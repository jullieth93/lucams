/*
 * HOMOLOGACIÓN E2E — back-in-stock "avísame cuando vuelva" (§6.12):
 *
 *   producto agotado → suscripción con email por la UI (consent informado) →
 *   BackInStockSubscription + Consent BACK_IN_STOCK en DB → RE-STOCK por la UI
 *   del admin (/admin/inventario, editor inline) → cron /api/cron/back-in-stock
 *   (x-cron-secret, como pg_cron en producción) → la suscripción queda
 *   notifiedAt (el aviso salió; el email va por Resend — 1 por corrida,
 *   dominio de prueba .test, documentado en la matriz).
 *
 * Corre en LOCAL y STG × desktop/mobile. En PRD PROHIBIDO (crea suscripción/
 * stock/email). Limpieza: suscripción y producto efímero borrados; el Consent
 * QUEDA (ledger legal marcado con el email de corrida); buckets de rate-limit
 * reseteados.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";
import { E2E_ENV, expect, test } from "./fixtures/auth";
import { db, disconnectDb } from "./fixtures/db";
import {
  createEphemeralProduct,
  deleteEphemeralProduct,
  type EphemeralProduct,
} from "./fixtures/data-factory";
import { newRunId } from "./fixtures/run";

const EVIDENCE_DIR = resolve(__dirname, "../../tmp/e2e-homologacion");

test.skip(E2E_ENV === "prd", "El flujo back-in-stock crea datos: prohibido en PRD.");
test.setTimeout(240_000);

const run = newRunId("bis");
const EMAIL = `${run}@e2e.test`;

type Step = { step: string; ok: boolean; detail?: string; screenshot?: string; at: string };

let product: EphemeralProduct | null = null;

test.beforeAll(async () => {
  await db().$executeRaw`DELETE FROM rate_limit_buckets WHERE key LIKE 'back_in_stock:%'`;
});

test.afterAll(async () => {
  await db()
    .backInStockSubscription.deleteMany({ where: { email: EMAIL } })
    .catch(() => {});
  if (product) await deleteEphemeralProduct(product);
  await db().$executeRaw`DELETE FROM rate_limit_buckets WHERE key LIKE 'back_in_stock:%'`;
  await disconnectDb();
});

test("back-in-stock: suscribir en PDP agotado → re-stock admin → cron → notifiedAt", async ({
  adminPage,
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

  try {
    // 0. Producto efímero AGOTADO (stock 0 en todas sus variantes).
    product = await createEphemeralProduct(run);
    await db().productVariant.updateMany({
      where: { productId: product.productId },
      data: { stock: 0 },
    });
    record("product-out-of-stock", true, `${product.slug} con stock 0`);

    // 1. PDP → el botón "Avísame" está y suscribe con el email de la corrida.
    await anonPage.goto(`/producto/${product.slug}`, { waitUntil: "domcontentloaded" });
    const emailInput = anonPage.locator("#bis-email");
    await expect(emailInput).toBeVisible({ timeout: 20_000 });
    await expect(async () => {
      await emailInput.fill(EMAIL);
      await expect(emailInput).toHaveValue(EMAIL, { timeout: 1_500 });
    }).toPass({ timeout: 15_000 });
    await anonPage.getByRole("button", { name: /avísame/i }).click();
    await expect(anonPage.locator("body")).toContainText(/te avisamos por correo apenas vuelva/i, {
      timeout: 20_000,
    });
    record("subscribe-ui", true, EMAIL, await shot(anonPage, "1-subscribed"));

    // 2. DB: suscripción + Consent BACK_IN_STOCK (evidencia Ley 1581).
    await expect(async () => {
      const sub = await db().backInStockSubscription.findUnique({
        where: { productId_email: { productId: product!.productId, email: EMAIL } },
      });
      expect(sub, "la suscripción debe existir").not.toBeNull();
      expect(sub!.notifiedAt).toBeNull();
      const consent = await db().consent.findFirst({
        where: { email: EMAIL, scope: "BACK_IN_STOCK", accepted: true },
      });
      expect(consent, "el Consent BACK_IN_STOCK debe existir").not.toBeNull();
    }).toPass({ timeout: 20_000 });
    record("db-subscription-consent", true, "subscription(notifiedAt=null) + Consent accepted");

    // 3. RE-STOCK por la UI del admin (/admin/inventario, editor inline de fila).
    await adminPage.goto(`/admin/inventario?q=${run}`, { waitUntil: "domcontentloaded" });
    const row = adminPage.locator("tr", { hasText: run }).first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    const stockInput = row.locator('input[name="newStock"]');
    const saveStockBtn = row.getByRole("button", { name: /guardar nuevo stock/i });
    // En el preview de STG el island puede tardar >12s en hidratar tras un
    // arranque frío (verificado 2026-08-06: a los 15-20s hidrata igual que en
    // LOCAL — no es bug de la app). Espera ACTIVA estricta: sonda de una tecla
    // y exige el EFECTO React (botón habilitado) — un cambio DOM sin React no
    // cuenta (el island controlado revierte/ignora hasta hidratar).
    await expect(async () => {
      await stockInput.press("End");
      await stockInput.press("9");
      const enabled = await saveStockBtn.isEnabled().catch(() => false);
      expect(enabled, "React debe haber procesado la sonda (island hidratado)").toBe(true);
    }).toPass({ timeout: 60_000, intervals: [1_000, 2_000, 5_000] });
    await expect(async () => {
      await stockInput.press("ControlOrMeta+a");
      await stockInput.pressSequentially("5", { delay: 10 });
      await expect(stockInput).toHaveValue("5", { timeout: 1_500 });
      await expect(saveStockBtn).toBeEnabled({ timeout: 1_500 });
    }).toPass({ timeout: 20_000 });
    await saveStockBtn.click();
    await expect(async () => {
      const v = await db().productVariant.findUnique({
        where: { id: product!.variantId },
        select: { stock: true },
      });
      expect(v!.stock, "stock persistido = 5").toBe(5);
    }).toPass({ timeout: 30_000 });
    record("admin-restock", true, "stock 0 → 5 vía /admin/inventario");

    // 4. Cron (misma vía que pg_cron en producción): debe notificar la suscripción.
    const cron = await anonPage.request.get("/api/cron/back-in-stock", {
      headers: { "x-cron-secret": (process.env.CRON_SECRET ?? "").trim() },
    });
    expect(cron.status()).toBe(200);
    const cronBody = (await cron.json()) as { ok: boolean; sent: number; considered: number };
    expect(cronBody.ok).toBe(true);
    expect(cronBody.sent, "el cron debe haber enviado ≥1 aviso").toBeGreaterThanOrEqual(1);
    record("cron-sent", true, JSON.stringify(cronBody));

    // 5. La suscripción quedó notificada (el aviso salió por Resend).
    await expect(async () => {
      const sub = await db().backInStockSubscription.findUnique({
        where: { productId_email: { productId: product!.productId, email: EMAIL } },
      });
      expect(sub!.notifiedAt, "notifiedAt sellado por el cron").not.toBeNull();
    }).toPass({ timeout: 20_000 });
    record("db-notified", true, "notifiedAt != null (aviso enviado)");

    writeFileSync(
      resultsPath,
      JSON.stringify(
        {
          spec: "homolog-back-in-stock",
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
    console.log(`✓ evidencia back-in-stock: ${resultsPath}`);
  } catch (err) {
    writeFileSync(
      resultsPath,
      JSON.stringify(
        {
          spec: "homolog-back-in-stock",
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
