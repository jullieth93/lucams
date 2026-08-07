/*
 * HOMOLOGACIÓN E2E — contacto + legales/ayuda (PROMPT_E2E_HOMOLOGACION §6.18):
 *
 *   form de contacto con Turnstile → SupportTicket OPEN en DB (+ 2 emails
 *   donde el ambiente los envía — Resend real, documentado; el ticket es la
 *   prueba durable) · las 8 páginas legales responden 200 con su h1 · /ayuda
 *   renderiza el FAQ (acordeón) coherente con modo catálogo.
 *
 * Corre en LOCAL y STG × desktop/mobile. En PRD PROHIBIDO (crea el ticket).
 * El ticket de prueba lleva el RUN y se borra en afterAll.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";
import { E2E_ENV, expect, test } from "./fixtures/auth";
import { db, disconnectDb } from "./fixtures/db";
import { newRunId } from "./fixtures/run";

const EVIDENCE_DIR = resolve(__dirname, "../../tmp/e2e-homologacion");

test.skip(E2E_ENV === "prd", "El form de contacto crea un ticket: prohibido en PRD.");
test.setTimeout(240_000);

const run = newRunId("contacto");
const EMAIL = `${run}@e2e.test`;

const LEGAL_PAGES = [
  "cookies",
  "devoluciones",
  "garantias",
  "habeas-data",
  "privacidad",
  "security",
  "subprocesadores",
  "terminos",
];

type Step = { step: string; ok: boolean; detail?: string; screenshot?: string; at: string };

test.afterAll(async () => {
  await db()
    .supportTicket.deleteMany({ where: { email: EMAIL } })
    .catch(() => {});
  await db().$executeRaw`DELETE FROM rate_limit_buckets WHERE key LIKE 'contact:%'`;
  await disconnectDb();
});

test("contacto: form → ticket OPEN en DB + 8 legales 200 + /ayuda FAQ", async ({
  anonPage,
}, testInfo) => {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const shotsDir = resolve(EVIDENCE_DIR, "shots");
  mkdirSync(shotsDir, { recursive: true });
  const resultsPath = resolve(
    EVIDENCE_DIR,
    `results-${E2E_ENV}-${testInfo.project.name}-${run}.json`,
  );
  const steps: Step[] = [];
  const record = (step: string, ok: boolean, detail?: string, screenshot?: string) =>
    steps.push({ step, ok, detail, screenshot, at: new Date().toISOString() });
  const shot = async (page: Page, name: string) => {
    const path = resolve(shotsDir, `${E2E_ENV}-${testInfo.project.name}-${run}-${name}.png`);
    await page.screenshot({ path, fullPage: false });
    return path;
  };

  await db().$executeRaw`DELETE FROM rate_limit_buckets WHERE key LIKE 'contact:%'`;

  try {
    // 1. Form de contacto con Turnstile → éxito → ticket OPEN en DB.
    await anonPage.goto("/contacto", { waitUntil: "domcontentloaded" });
    const form = anonPage.locator("form", {
      has: anonPage.locator("#contact-email"),
    });
    await expect(async () => {
      await form.locator('input[name="name"]').fill(`Cliente Prueba ${run.slice(-4)}`);
      await form.locator('input[name="email"]').fill(EMAIL);
      await form.locator("#contact-subject").selectOption({ index: 1 });
      await form
        .locator("#contact-message")
        .fill(`Mensaje de homologación ${run}: el form de contacto funciona end to end.`);
      await expect(form.locator('input[name="name"]')).not.toHaveValue("", { timeout: 1_500 });
      await expect(form.locator("#contact-message")).not.toHaveValue("", { timeout: 1_500 });
    }).toPass({ timeout: 20_000 });
    await expect(async () => {
      const token = await form.locator('input[name="cf-turnstile-response"]').inputValue();
      expect(token.length).toBeGreaterThan(0);
    }).toPass({ timeout: 20_000 });
    await form.getByRole("button", { name: /enviar/i }).click();
    await expect(anonPage.locator("body")).toContainText(/recibimos tu mensaje|te escribimos/i, {
      timeout: 20_000,
    });
    record("contact-submitted", true, EMAIL, await shot(anonPage, "1-contact"));

    await expect(async () => {
      const ticket = await db().supportTicket.findFirst({
        where: { email: EMAIL },
        select: { id: true, subject: true, status: true },
      });
      expect(ticket, "el ticket del run debe existir").not.toBeNull();
      expect(ticket!.status).toBe("OPEN");
      expect(ticket!.subject).not.toBe("CONSULTA_PRODUCTO"); // elegimos index 1
    }).toPass({ timeout: 20_000 });
    record(
      "db-ticket-open",
      true,
      "SupportTicket OPEN (los 2 emails salen por Resend real — no inspeccionable; el ticket es la prueba durable)",
    );

    // 2. Las 8 páginas legales: 200 + h1 visible.
    for (const slug of LEGAL_PAGES) {
      const res = await anonPage.goto(`/legal/${slug}`, { waitUntil: "domcontentloaded" });
      expect(res!.status(), `/legal/${slug} debe responder 200`).toBe(200);
      await expect(anonPage.locator("h1").first()).toBeVisible({ timeout: 15_000 });
    }
    record("legal-pages-200", true, LEGAL_PAGES.join(", "));

    // 3. /ayuda: FAQ con acordeón (details) — coherente con modo catálogo.
    await anonPage.goto("/ayuda", { waitUntil: "domcontentloaded" });
    await expect(anonPage.locator("h1").first()).toBeVisible({ timeout: 15_000 });
    const details = anonPage.locator("details");
    expect(await details.count(), "el FAQ debe tener preguntas en acordeón").toBeGreaterThan(0);
    // Coherencia con modo catálogo: NO debe prometer pago en línea.
    await expect(anonPage.locator("body")).not.toContainText(/paga en línea con tarjeta/i);
    record(
      "ayuda-faq",
      true,
      `${await details.count()} preguntas en acordeón, sin "paga en línea"`,
    );

    writeFileSync(
      resultsPath,
      JSON.stringify(
        {
          spec: "homolog-contacto",
          env: E2E_ENV,
          project: testInfo.project.name,
          run,
          status: "pass",
          steps,
        },
        null,
        2,
      ),
    );
    console.log(`✓ evidencia contacto: ${resultsPath}`);
  } catch (err) {
    writeFileSync(
      resultsPath,
      JSON.stringify(
        {
          spec: "homolog-contacto",
          env: E2E_ENV,
          project: testInfo.project.name,
          run,
          status: "fail",
          error: String(err),
          steps,
        },
        null,
        2,
      ),
    );
    throw err;
  }
});
