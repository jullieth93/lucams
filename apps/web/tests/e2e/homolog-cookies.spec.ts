/*
 * HOMOLOGACIÓN E2E — cookies Ley 1581 (docs/TESTING.md):
 *
 *   banner con 3 botones (solo necesarias / personalizar / aceptar todas) →
 *   modal con 4 switches (necesarias bloqueadas ON) → persistencia en refresh
 *   → /legal/cookies con tabla + reabrir preferencias → filas Consent en DB
 *   por alcance (COOKIES_NECESSARY/FUNCTIONAL/ANALYTICS/MARKETING).
 *
 * Corre en LOCAL y STG × desktop/mobile. En PRD PROHIBIDO (escribe Consent).
 * Las filas Consent son el ledger legal append-only (regla dura: QUEDAN) —
 * van marcadas con un User-Agent de corrida (lucams-e2e-homolog/<run>) para
 * ser distinguibles como prueba ante cualquier revisión.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { E2E_ENV, expect, test } from "./fixtures/auth";
import { baseUrlFor, extraHeadersFor } from "./_setup/env";
import { db, disconnectDb } from "./fixtures/db";
import { newRunId } from "./fixtures/run";

const EVIDENCE_DIR = resolve(__dirname, "../../tmp/e2e-homologacion");

test.skip(E2E_ENV === "prd", "El flujo de cookies escribe Consent en DB: prohibido en PRD.");
test.setTimeout(240_000);

const run = newRunId("cookies");
const TEST_UA = `lucams-e2e-homolog/${run}`;
let windowStart = 0;

type Prefs = { necessary: boolean; functional: boolean; analytics: boolean; marketing: boolean };
const SCOPE_OF: Record<keyof Prefs, string> = {
  necessary: "COOKIES_NECESSARY",
  functional: "COOKIES_FUNCTIONAL",
  analytics: "COOKIES_ANALYTICS",
  marketing: "COOKIES_MARKETING",
};

async function newTrackedContext(browser: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({
    baseURL: baseUrlFor(E2E_ENV),
    extraHTTPHeaders: extraHeadersFor(E2E_ENV),
    userAgent: TEST_UA,
    ignoreHTTPSErrors: true,
  });
  return { ctx, page: await ctx.newPage() };
}

/** Cookie cookie_consent_v1 del contexto, parseada. */
async function readPrefsCookie(ctx: BrowserContext): Promise<Prefs | null> {
  const cookies = await ctx.cookies();
  const c = cookies.find((k) => k.name === "cookie_consent_v1");
  if (!c) return null;
  return JSON.parse(decodeURIComponent(c.value)) as Prefs;
}

/** Filas Consent de la ventana de la corrida (marcadas con el UA de prueba). */
async function consentRows() {
  return db().consent.findMany({
    where: { acceptedAt: { gte: new Date(windowStart) }, userAgent: TEST_UA },
    orderBy: { acceptedAt: "asc" },
  });
}

/** Verifica que las ÚLTIMAS 4 filas reflejan las preferencias esperadas. */
async function expectConsentMatches(expected: Prefs) {
  await expect(async () => {
    const rows = await consentRows();
    expect(rows.length % 4, `filas Consent múltiplo de 4 (hay ${rows.length})`).toBe(0);
    expect(rows.length).toBeGreaterThan(0);
    const last4 = rows.slice(-4);
    for (const [key, scope] of Object.entries(SCOPE_OF) as [keyof Prefs, string][]) {
      const row = last4.find((r) => r.scope === scope);
      expect(row, `fila ${scope} debe existir`).toBeTruthy();
      expect(row!.accepted, `${scope} accepted debe ser ${expected[key]}`).toBe(expected[key]);
    }
  }).toPass({ timeout: 30_000 });
}

test.afterAll(async () => {
  await disconnectDb();
});

type Step = { step: string; ok: boolean; detail?: string; screenshot?: string; at: string };

test("cookies Ley 1581: banner 3 botones + modal 4 switches + persistencia + Consent por alcance", async ({
  browser,
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
  windowStart = Date.now();

  const banner = (page: Page) =>
    page.locator('div[role="dialog"][aria-labelledby="cookies-banner-title"]');

  try {
    // ─── Escenario A: Personalizar → granular → Guardar → persistencia ───
    {
      const { ctx, page } = await newTrackedContext(browser);
      await page.goto("/", { waitUntil: "domcontentloaded" });
      // Banner visible con los 3 botones.
      await expect(banner(page)).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole("button", { name: /solo necesarias/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /personalizar/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /aceptar todas/i })).toBeVisible();
      record("banner-3-buttons", true, undefined, await shot(page, "0-banner"));

      // Modal: 4 switches; necesarias ON y bloqueadas.
      await page.getByRole("button", { name: /personalizar/i }).click();
      const modal = page.locator('div[role="dialog"]', { hasText: "Preferencias de cookies" });
      await expect(modal).toBeVisible();
      const necessarySwitch = modal.getByRole("checkbox", { name: /necesarias/i });
      await expect(necessarySwitch).toBeChecked();
      await expect(necessarySwitch).toBeDisabled();
      record("modal-4-switches", true, "necesarias ON bloqueadas; 3 opcionales editables");

      // Granular: funcionales + analíticas ON, marketing OFF → Guardar.
      await modal.getByRole("checkbox", { name: /funcionales/i }).check();
      await modal.getByRole("checkbox", { name: /analíticas/i }).check();
      await page.getByRole("button", { name: /guardar mis preferencias/i }).click();
      await expect(banner(page)).toHaveCount(0);

      const prefs = await readPrefsCookie(ctx);
      expect(prefs).toMatchObject({
        necessary: true,
        functional: true,
        analytics: true,
        marketing: false,
      });
      record("granular-cookie", true, JSON.stringify({ ...prefs, savedAt: undefined }));

      // Consent en DB por alcance (fire-and-forget → poll).
      await expectConsentMatches({
        necessary: true,
        functional: true,
        analytics: true,
        marketing: false,
      });
      record("granular-consent-db", true, "4 filas por alcance con accepted correctos");

      // Persistencia: reload → el banner NO reaparece.
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(banner(page)).toHaveCount(0);
      record("persistence-reload", true, "tras reload no reaparece el banner");

      // /legal/cookies: tabla + reabrir preferencias.
      await page.goto("/legal/cookies", { waitUntil: "domcontentloaded" });
      await expect(page.locator("table").first()).toBeVisible({ timeout: 15_000 });
      await page.getByRole("button", { name: /abrir preferencias/i }).click();
      await expect(
        page.locator('div[role="dialog"]', { hasText: "Preferencias de cookies" }),
      ).toBeVisible();
      record(
        "legal-cookies-reopen",
        true,
        "tabla + modal reabierto",
        await shot(page, "1-legal-reopen"),
      );
      await ctx.close();
    }

    // ─── Escenario B: Aceptar todas ───
    {
      const { ctx, page } = await newTrackedContext(browser);
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await expect(banner(page)).toBeVisible({ timeout: 15_000 });
      await page.getByRole("button", { name: /aceptar todas/i }).click();
      await expect(banner(page)).toHaveCount(0);
      const prefs = await readPrefsCookie(ctx);
      expect(prefs).toMatchObject({
        necessary: true,
        functional: true,
        analytics: true,
        marketing: true,
      });
      await expectConsentMatches({
        necessary: true,
        functional: true,
        analytics: true,
        marketing: true,
      });
      record("accept-all", true, "cookie + 4 filas accepted=true");
      await ctx.close();
    }

    // ─── Escenario C: Solo necesarias ───
    {
      const { ctx, page } = await newTrackedContext(browser);
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await expect(banner(page)).toBeVisible({ timeout: 15_000 });
      await page.getByRole("button", { name: /solo necesarias/i }).click();
      await expect(banner(page)).toHaveCount(0);
      const prefs = await readPrefsCookie(ctx);
      expect(prefs).toMatchObject({
        necessary: true,
        functional: false,
        analytics: false,
        marketing: false,
      });
      await expectConsentMatches({
        necessary: true,
        functional: false,
        analytics: false,
        marketing: false,
      });
      record(
        "reject-all",
        true,
        "cookie solo necesarias + filas opcionales accepted=false (rechazo también es prueba)",
        await shot(page, "2-rejected"),
      );
      await ctx.close();
    }

    writeFileSync(
      resultsPath,
      JSON.stringify(
        {
          spec: "homolog-cookies",
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
    console.log(`✓ evidencia cookies: ${resultsPath}`);
  } catch (err) {
    writeFileSync(
      resultsPath,
      JSON.stringify(
        {
          spec: "homolog-cookies",
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
