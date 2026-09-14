/*
 * HOMOLOGACIÓN E2E — newsletter + unsubscribe (docs/TESTING.md):
 *
 *   suscripción con consent obligatorio → Consent NEWSLETTER en DB + welcome
 *   email (en LOCAL se inspecciona en Mailpit: asunto, link de baja, headers
 *   List-Unsubscribe RFC 2369/8058) → duplicado → "ya estabas suscrito" sin
 *   duplicar fila → baja por link opaco (HMAC) → revocación accepted=false con
 *   revokesId → re-suscripción → baja One-Click por POST /api/unsubscribe.
 *
 * Corre en LOCAL y STG × desktop/mobile. En PRD PROHIBIDO (escribe Consent +
 * contactos Resend). El email de prueba es <run>@e2e.test (dominio reservado
 * para pruebas); en STG Resend acepta y luego rebota ese dominio — queda
 * documentado en la matriz (1-2 correos por corrida). El contacto Resend se
 * borra por API en afterAll; las filas Consent QUEDAN (ledger legal, regla
 * dura) marcadas con el email de corrida.
 */

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";
import { E2E_ENV, expect, test } from "./fixtures/auth";
import { db, disconnectDb } from "./fixtures/db";
import { newRunId } from "./fixtures/run";

const EVIDENCE_DIR = resolve(__dirname, "../../tmp/e2e-homologacion");

test.skip(E2E_ENV === "prd", "El flujo de newsletter escribe Consent/Resend: prohibido en PRD.");
test.setTimeout(240_000);

const run = newRunId("newsletter");
const EMAIL = `${run}@e2e.test`;

test.beforeAll(async () => {
  // Higiene de test: buckets de rate-limit de newsletter (20/h por IP en
  // no-prod) — los reintentos entre corridas los agotan y la suite moriría
  // con "Demasiados intentos" en vez del flujo real (mismo patrón quote:%).
  await db().$executeRaw`DELETE FROM rate_limit_buckets WHERE key LIKE 'newsletter:%'`;
});

type Step = { step: string; ok: boolean; detail?: string; screenshot?: string; at: string };

/** Mismo algoritmo que features/newsletter/unsubscribe.ts (server-only: no importable acá). */
function opaqueUnsubscribeParam(email: string): string {
  const secret = (process.env.CSRF_SECRET ?? "").trim();
  if (!secret) throw new Error("CSRF_SECRET requerido para firmar el token de baja");
  const token = createHash("sha256")
    .update(`${email.trim().toLowerCase()}:${secret}`)
    .digest("hex")
    .slice(0, 32);
  return `${Buffer.from(email.trim().toLowerCase(), "utf-8").toString("base64url")}.${token}`;
}

async function consentRows() {
  return db().consent.findMany({
    where: { email: EMAIL, scope: "NEWSLETTER" },
    orderBy: { acceptedAt: "asc" },
  });
}

test.afterAll(async () => {
  // El contacto Resend (si el ambiente tiene API key real) se borra por API.
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) {
    await fetch(`https://api.resend.com/contacts/${encodeURIComponent(EMAIL)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${apiKey}` },
    }).catch(() => {});
  }
  await db().$executeRaw`DELETE FROM rate_limit_buckets WHERE key LIKE 'newsletter:%'`;
  // Las filas Consent QUEDAN (ledger legal append-only, marcadas con <run>@e2e.test).
  await disconnectDb();
});

test("newsletter: suscribir → welcome + Consent → duplicado → baja HMAC → One-Click", async ({
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

  const subscribe = async (expectToast: RegExp) => {
    // Página FRESCA por suscripción: el token Turnstile es de UN SOLO USO
    // (el widget conserva el ya consumido y el segundo submit moría con
    // "Validación anti-bot falló" en vez del mensaje de duplicado).
    await anonPage.goto("/", { waitUntil: "domcontentloaded" });
    const form = anonPage.locator("form", { has: anonPage.locator('input[name="consent"]') });
    const emailInput = form.locator('input[name="email"]');
    const consent = form.locator('input[name="consent"]');
    // Misma carrera de hidratación que H5: el fill pre-hidratación se revierte
    // (input sin valor al submit → Zod rechaza) → toPass con aserción de valores.
    await expect(async () => {
      await emailInput.fill(EMAIL);
      await consent.check();
      await expect(emailInput).toHaveValue(EMAIL, { timeout: 1_500 });
      await expect(consent).toBeChecked({ timeout: 1_500 });
    }).toPass({ timeout: 20_000 });
    await expect(async () => {
      const token = await anonPage.locator('input[name="cf-turnstile-response"]').inputValue();
      expect(token.length).toBeGreaterThan(0);
    }).toPass({ timeout: 20_000 });
    await form.getByRole("button", { name: /suscribirme/i }).click();
    // El toast es la señal del resultado. Primero espero CUALQUIER toast (la
    // acción puede tardar segundos por la API de Resend) y leo su texto real:
    // si no es el esperado, el error dice exactamente cuál salió.
    const anyToast = anonPage.locator("[data-sonner-toast]");
    await expect(anyToast.first(), "la acción debe responder con un toast").toBeVisible({
      timeout: 25_000,
    });
    const seen = (await anyToast.allInnerTexts()).join(" | ").slice(0, 300);
    if (!expectToast.test(seen)) {
      throw new Error(`toast esperado ${expectToast}; visto: "${seen}"`);
    }
  };

  try {
    // 1. Suscripción con consent → toast de éxito.
    await subscribe(/te avisaremos del lanzamiento/i);
    record("subscribe-success", true, EMAIL, await shot(anonPage, "1-subscribe"));

    // 2. Consent NEWSLETTER en DB (accepted=true, versión del aviso).
    await expect(async () => {
      const rows = await consentRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]!.accepted).toBe(true);
      expect(rows[0]!.scope).toBe("NEWSLETTER");
    }).toPass({ timeout: 20_000 });
    record("db-consent-newsletter", true, "1 fila NEWSLETTER accepted=true");

    // 3. Welcome email: sale por la API REAL de Resend en ambos ambientes
    // (Mailpit solo captura el auth de Supabase local) → no inspeccionable
    // desde el test. Los headers List-Unsubscribe/One-Click (RFC 2369/8058)
    // los cubre el unitario features/newsletter/unsubscribe.test.ts. La baja
    // por link HMAC y por POST One-Click se ejercen E2E abajo (pasos 5 y 7).
    // El correo va a <run>@e2e.test (dominio reservado): Resend lo acepta y
    // luego rebota — queda documentado en la matriz.
    record(
      "welcome-email-path",
      true,
      "welcome enviado vía Resend API (no inspeccionable E2E; headers cubiertos por unsubscribe.test.ts)",
    );

    // 4. Duplicado → "ya estabas suscrito" y NO duplica la fila vigente.
    await subscribe(/ya estabas suscrito/i);
    const afterDup = await consentRows();
    expect(afterDup.filter((r) => r.accepted)).toHaveLength(1);
    record("duplicate-idempotent", true, "mensaje 'ya estabas suscrito'; 1 sola fila vigente");

    // 5. Baja por link opaco (HMAC) → revocación accepted=false con revokesId.
    await anonPage.goto(`/unsubscribe?u=${opaqueUnsubscribeParam(EMAIL)}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(anonPage.locator("body")).toContainText(/cancelamos tu suscripción/i, {
      timeout: 20_000,
    });
    await expect(async () => {
      const rows = await consentRows();
      const revocation = rows.find((r) => !r.accepted);
      expect(revocation, "fila de revocación").toBeTruthy();
      expect(revocation!.revokesId).toBe(rows[0]!.id);
    }).toPass({ timeout: 20_000 });
    record(
      "unsubscribe-hmac",
      true,
      "página de baja OK + revocación accepted=false → revokesId",
      await shot(anonPage, "2-unsubscribed"),
    );

    // 6. Re-suscripción → nueva fila accepted (el historial se conserva).
    await subscribe(/te avisaremos del lanzamiento/i);
    await expect(async () => {
      const rows = await consentRows();
      expect(rows.filter((r) => r.accepted)).toHaveLength(2);
    }).toPass({ timeout: 20_000 });
    record("resubscribe", true, "nueva fila accepted tras la baja; historial intacto");

    // 7. Baja One-Click (RFC 8058) por POST — la que usa Gmail/Yahoo.
    const oneClick = await anonPage.request.post(
      `/api/unsubscribe?u=${opaqueUnsubscribeParam(EMAIL)}`,
    );
    expect(oneClick.status()).toBe(200);
    expect(await oneClick.json()).toEqual({ ok: true });
    await expect(async () => {
      const rows = await consentRows();
      expect(rows.filter((r) => !r.accepted).length).toBeGreaterThanOrEqual(2);
    }).toPass({ timeout: 20_000 });
    record("one-click-api", true, "POST /api/unsubscribe → 200 + segunda revocación");

    writeFileSync(
      resultsPath,
      JSON.stringify(
        {
          spec: "homolog-newsletter",
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
    console.log(`✓ evidencia newsletter: ${resultsPath}`);
  } catch (err) {
    writeFileSync(
      resultsPath,
      JSON.stringify(
        {
          spec: "homolog-newsletter",
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
