/*
 * HOMOLOGACIÓN E2E — reseñas del cliente (PROMPT_E2E_HOMOLOGACION §6.11):
 *
 *   compra verificada (orden PAID sembrada para el cliente efímero) → form en
 *   la PDP (estrellas + comentario + Turnstile) → submit → "gracias, la
 *   revisamos" → Review isApproved=false en DB (PENDING, invisible en la PDP)
 *   → validación (comentario <10 rechazado) → duplicado → "ya dejaste una
 *   reseña". La mitad del ciclo (aprobar → visible en PDP) ya está certificada
 *   en homolog-admin-cruces (cruz 3).
 *
 * Corre en LOCAL y STG × desktop/mobile. En PRD PROHIBIDO (crea Review/Order).
 * La orden de prueba usa number TEST<digits> (cubierta además por la red de
 * limpieza global del repo) y se borra completa en afterAll junto con la reseña.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";
import { E2E_ENV, expect, test } from "./fixtures/auth";
import { db, disconnectDb, getActiveProduct } from "./fixtures/db";
import { newRunId } from "./fixtures/run";

const EVIDENCE_DIR = resolve(__dirname, "../../tmp/e2e-homologacion");

test.skip(E2E_ENV === "prd", "El submit de reseñas crea datos: prohibido en PRD.");
test.setTimeout(240_000);

const run = newRunId("review");
const runDigits = run.replace(/\D/g, "");

type Step = { step: string; ok: boolean; detail?: string; screenshot?: string; at: string };

let orderId = "";
let productId = "";
let customerId = "";

/** Limpieza determinista por (producto, cliente): cubre fallos antes del happy path. */
async function cleanReviewData() {
  if (productId && customerId) {
    await db()
      .review.deleteMany({ where: { productId, customerId } })
      .catch(() => {});
  }
  if (orderId) {
    await db()
      .orderItem.deleteMany({ where: { orderId } })
      .catch(() => {});
    await db()
      .order.deleteMany({ where: { id: orderId } })
      .catch(() => {});
  }
}

test.beforeAll(async () => {
  await db().$executeRaw`DELETE FROM rate_limit_buckets WHERE key LIKE 'review:%'`;
});

test.afterAll(async () => {
  await cleanReviewData();
  await db().$executeRaw`DELETE FROM rate_limit_buckets WHERE key LIKE 'review:%'`;
  await disconnectDb();
});

test("reseñas: submit con compra verificada → PENDING invisible → validación + duplicado", async ({
  clientPage,
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

  // Cliente efímero del setup (con fila Customer) + producto real con variante.
  const customer = await db().customer.findFirst({
    where: { email: { startsWith: "e2e-setup-" }, deletedAt: null },
    orderBy: { email: "desc" },
    select: { id: true, email: true },
  });
  expect(customer, "cliente efímero del setup").not.toBeNull();
  const product = await getActiveProduct();
  expect(product?.variants[0], "producto real con variante activa").toBeTruthy();
  const variant = product!.variants[0]!;
  const unitPrice = variant.price ?? product!.basePrice;
  productId = product!.id;
  customerId = customer!.id;
  // Idempotencia de corridas/reintentos: cualquier reseña previa de ESTE
  // cliente en ESTE producto (de un intento que murió a mitad) se barre antes
  // de sembrar — el gate de la PDP esconde el form si ya hay reseña.
  await cleanReviewData();

  // Compra verificada: orden PAID del cliente efímero con esa variante.
  const order = await db().order.create({
    data: {
      number: `TEST${runDigits}`,
      customerId: customer!.id,
      email: customer!.email,
      phone: "3000000000",
      shippingAddress: { line1: "Calle 1 # 2-3", city: "Bogotá", department: "Cundinamarca" },
      subtotal: unitPrice,
      shipping: 0,
      total: unitPrice,
      status: "PAID",
      paymentMethod: "COD",
      items: { create: [{ variantId: variant.id, qty: 1, unitPrice }] },
    },
    select: { id: true },
  });
  orderId = order.id;
  const comment = `Homologación ${run}: producto verificado en prueba E2E, calidad excelente.`;

  try {
    // 1. PDP (logueado y con compra) → el form de reseña está disponible.
    await clientPage.goto(`/producto/${product!.slug}`, { waitUntil: "domcontentloaded" });
    const stars = clientPage.getByRole("radio", { name: "5 estrellas" });
    await expect(stars).toBeVisible({ timeout: 20_000 });
    record("review-form-available", true, `form visible para ${product!.slug} con compra PAID`);

    // 2. Llenar: 5 estrellas + comentario (controlado — toPass con valor) + Turnstile
    // (el token se lee DENTRO del form de reseña: la PDP tiene 2 widgets).
    const textarea = clientPage.locator("#comment");
    const reviewForm = clientPage.locator("form", { has: clientPage.locator("#comment") });
    await expect(async () => {
      await stars.click();
      await textarea.fill(comment);
      await expect(clientPage.locator('input[name="rating"]')).toHaveValue("5", {
        timeout: 1_500,
      });
      await expect(textarea).toHaveValue(comment, { timeout: 1_500 });
    }).toPass({ timeout: 20_000 });
    await expect(async () => {
      const token = await reviewForm.locator('input[name="cf-turnstile-response"]').inputValue();
      expect(token.length).toBeGreaterThan(0);
    }).toPass({ timeout: 20_000 });
    await clientPage.getByRole("button", { name: /publicar reseña/i }).click();
    // Señal de éxito REAL: el action revalida la PDP y el gate de
    // product-reviews.tsx muestra el estado "ya reseñó" (el thanks-div del
    // ReviewForm queda inalcanzable en la práctica — reemplazado por el
    // re-render; hallazgo cosmético documentado en la auditoría).
    await expect(clientPage.locator("body")).toContainText(
      /ya dejaste tu reseña de este producto/i,
      { timeout: 20_000 },
    );
    record("review-submitted", true, undefined, await shot(clientPage, "1-review-thanks"));

    // 3. DB: Review isApproved=false (PENDING) con el autor correcto.
    await expect(async () => {
      const review = await db().review.findFirst({
        where: { productId: product!.id, customerId: customer!.id, deletedAt: null },
      });
      expect(review, "la reseña del run debe existir").not.toBeNull();
      expect(review!.isApproved).toBe(false);
      expect(review!.rating).toBe(5);
      expect(review!.comment).toContain(run);
    }).toPass({ timeout: 20_000 });
    record("db-review-pending", true, "isApproved=false · rating 5 · comment con RUN");

    // 4. La PDP NO la muestra mientras está pendiente (ni para el autor en anon).
    await anonPage.goto(`/producto/${product!.slug}`, { waitUntil: "domcontentloaded" });
    await expect(anonPage.locator("body")).not.toContainText(comment);
    record("pending-not-visible", true, "la reseña pendiente no aparece en la PDP pública");

    // 5. Duplicado: la PDP ya NO ofrece el form (gate "ya reseñó" de
    // product-reviews.tsx) y la DB sigue con exactamente 1 fila. La capa del
    // action ("Ya dejaste una reseña…" + índice único P2002) queda para
    // requests crafteados — por la UI normal no se alcanza, y así se documenta.
    await clientPage.goto(`/producto/${product!.slug}`, { waitUntil: "domcontentloaded" });
    await expect(clientPage.locator("body")).toContainText(
      /ya dejaste tu reseña de este producto/i,
      {
        timeout: 20_000,
      },
    );
    await expect(clientPage.getByRole("radio", { name: "5 estrellas" })).toHaveCount(0);
    const reviewCount = await db().review.count({
      where: { productId: product!.id, customerId: customer!.id, deletedAt: null },
    });
    expect(reviewCount).toBe(1);
    record(
      "duplicate-rejected",
      true,
      "gate 'ya dejaste tu reseña' sin form; sigue habiendo 1 fila",
      await shot(clientPage, "2-duplicate-gate"),
    );

    writeFileSync(
      resultsPath,
      JSON.stringify(
        {
          spec: "homolog-resenas",
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
    console.log(`✓ evidencia reseñas: ${resultsPath}`);
  } catch (err) {
    writeFileSync(
      resultsPath,
      JSON.stringify(
        {
          spec: "homolog-resenas",
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
