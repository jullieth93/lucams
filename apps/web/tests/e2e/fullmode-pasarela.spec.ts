/*
 * FULL-MODE E2E §7.5.2 — Pasarela Wompi: DECLINED noop + reintento con la
 * MISMA reference + VOIDED con reversión de stock + guard de transacción
 * foránea. Todo con eventos sintéticos firmados (sin compras reales).
 *
 * Flujo:
 *   1. Checkout UI hasta /checkout/pago → "Pagar con Wompi" (redirect
 *      capturado) → orden PENDING_PAYMENT con reference R.
 *   2. Webhook DECLINED (tx1, firma válida) → 200 y la orden NO cambia
 *      (noop por diseño: Wompi habilita reintento con la misma reference).
 *   3. Reintento por UI (mismo carrito) → el redirect lleva LA MISMA
 *      reference R (createOrderFromCart reusa la orden PENDING_PAYMENT por
 *      cartId — idempotencia, no duplica órdenes).
 *   4. Webhook APPROVED (tx2) → saga: PAID/FULFILLING + stock −1 + guía test.
 *   5. Webhook VOIDED con tx DISTINTA (tx3) → guard B2: una orden pagada no
 *      la tumba un evento de otra transacción → sigue FULFILLING.
 *   6. Webhook VOIDED con tx2 (la que pagó) → REFUNDED/CANCELLED + stock
 *      revertido (InventoryLog ORDER_CANCELLED/ORDER_REFUNDED) — la plata
 *      capturada no deja la orden "pagada fantasma".
 *
 * SOLO LOCAL + server full (scripts/e2e-fullmode.sh). Limpieza completa en
 * afterAll (orden, ítems, producto, eventos, buckets).
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { strip } from "./_setup/env";
import { E2E_ENV, expect, test } from "./fixtures/auth";
import { db, disconnectDb } from "./fixtures/db";
import { newRunId } from "./fixtures/run";
import { deleteEphemeralProductsByTag, type EphemeralProduct } from "./fixtures/data-factory";
import { postWompiEvent } from "./_helpers/synthetic-events";
import { driveCheckoutToPago } from "./_helpers/checkout-flow";
import { CheckoutPagoPage } from "./pages/checkout-pago";

const EVIDENCE_DIR = resolve(__dirname, "../../tmp/e2e-homologacion");

test.skip(E2E_ENV !== "local", "La suite full-mode (Etapa 2) solo corre en LOCAL.");
test.skip(
  strip(process.env.NEXT_PUBLIC_STORE_MODE) !== "full",
  "Requiere el server en modo full: scripts/e2e-fullmode.sh.",
);

const RUN_STARTED = new Date();
const run = newRunId("fm-pasarela");
const WOMPI_SECRET = strip(process.env.WOMPI_EVENTS_SECRET);

let product: EphemeralProduct | null = null;

test.afterAll(async () => {
  await db()
    .orderItem.deleteMany({ where: { order: { email: { startsWith: "e2e-fm-pasarela-" } } } })
    .catch(() => {});
  await db()
    .order.deleteMany({ where: { email: { startsWith: "e2e-fm-pasarela-" } } })
    .catch(() => {});
  await db()
    .webhookEvent.deleteMany({ where: { source: "WOMPI", externalId: { contains: run } } })
    .catch(() => {});
  await db().$executeRaw`DELETE FROM rate_limit_buckets WHERE key LIKE 'checkout_pay:%'`.catch(
    () => {},
  );
  // Clientes invitados creados por el checkout con el email del RUN (soft-delete,
  // patrón wompi-sandbox: el Consent queda — ledger legal append-only).
  await db()
    .customer.updateMany({
      where: { email: { contains: run }, deletedAt: null },
      data: { deletedAt: new Date(), updatedAt: new Date() },
    })
    .catch(() => {});
  // Barrido por tag: cubre los retries (cada intento crea su producto y
  // el último proceso solo ve el suyo — fuga reproducida 2026-08-07).
  await deleteEphemeralProductsByTag("e2e-fm-pasarela");
  // Carritos anónimos vacíos dejados por flujos que no llegaron a PAID (el
  // carrito se cierra solo al pagar): shells sin ítems ni PII de esta corrida.
  await db()
    .cart.deleteMany({
      where: { customerId: null, items: { none: {} }, createdAt: { gte: RUN_STARTED } },
    })
    .catch(() => {});
  await disconnectDb();
});

test("§7.5.2 pasarela: DECLINED noop → reintento misma reference → APPROVED → VOIDED foráneo ignorado → VOIDED real revierte stock", async ({
  anonPage,
  request,
}, testInfo) => {
  test.setTimeout(300_000);
  test.skip(!WOMPI_SECRET, "Sin WOMPI_EVENTS_SECRET en el ambiente.");
  const resultsPath = resolve(
    EVIDENCE_DIR,
    `results-${E2E_ENV}-${testInfo.project.name}-${run}.json`,
  );
  const steps: { step: string; ok: boolean; detail?: string }[] = [];
  const record = (step: string, detail?: string) => steps.push({ step, ok: true, detail });
  const fire = (txId: string, status: string, amount: number, reference: string) =>
    postWompiEvent(request, {
      secret: WOMPI_SECRET!,
      txId,
      status,
      amount,
      reference,
      timestamp: Math.floor(Date.now() / 1000),
    });

  try {
    const driven = await driveCheckoutToPago(anonPage, run);
    product = driven.product;
    const pago = new CheckoutPagoPage(anonPage);

    // ── 1. Primer intento de pago → orden PENDING_PAYMENT.
    const url1 = await pago.payWithWompiCapture();
    const reference = new URL(url1).searchParams.get("reference")!;
    const order = await db().order.findFirstOrThrow({
      where: { number: reference, deletedAt: null },
      select: { id: true, number: true, total: true, status: true },
    });
    expect(order.status).toBe("PENDING_PAYMENT");
    record("orden-pending", `reference=${reference} · total=${order.total}`);

    // ── 2. DECLINED → noop (la orden sigue cobrable).
    const txDeclined = `e2e-${run}-declined`;
    const declined = await fire(txDeclined, "DECLINED", order.total, reference);
    expect(declined.status).toBe(200);
    await expect(async () => {
      const o = await db().order.findUniqueOrThrow({
        where: { id: order.id },
        select: { status: true },
      });
      expect(o.status, "DECLINED es noop: sigue PENDING_PAYMENT").toBe("PENDING_PAYMENT");
    }).toPass({ timeout: 15_000 });
    record("declined-noop", "DECLINED → 200, orden intacta PENDING_PAYMENT");

    // ── 3. Reintento por UI → MISMA reference (reuso por cartId).
    await anonPage.goto("/checkout/pago", { waitUntil: "domcontentloaded" });
    await pago.expectLoaded();
    const url2 = await pago.payWithWompiCapture();
    const reference2 = new URL(url2).searchParams.get("reference")!;
    expect(reference2, "el reintento reusa la orden (misma reference)").toBe(reference);
    const orderCount = await db().order.count({
      where: { number: { in: [reference, reference2] }, deletedAt: null },
    });
    expect(orderCount, "una sola orden para los dos intentos").toBe(1);
    record("reintento-misma-reference", `segundo intento → reference idéntica, 1 sola orden`);

    // ── 4. APPROVED (tx2) → saga completa.
    const txApproved = `e2e-${run}-approved`;
    const approved = await fire(txApproved, "APPROVED", order.total, reference);
    expect(approved.status).toBe(200);
    await expect(async () => {
      const o = await db().order.findUniqueOrThrow({
        where: { id: order.id },
        select: { status: true, trackingNumber: true },
      });
      expect(["PAID", "FULFILLING"]).toContain(o.status);
      expect(o.trackingNumber).toBeTruthy();
      const stock = await db().productVariant.findUniqueOrThrow({
        where: { id: product!.variantId },
        select: { stock: true },
      });
      expect(stock.stock, "stock decrementado al PAID").toBe(99);
    }).toPass({ timeout: 60_000 });
    record("approved-saga", "PAID/FULFILLING + guía test + stock 100→99");

    // ── 5. VOIDED con tx FORÁNEA → ignorado (guard B2).
    const txForeign = `e2e-${run}-foreign`;
    const foreign = await fire(txForeign, "VOIDED", order.total, reference);
    expect(foreign.status).toBe(200);
    await expect(async () => {
      const o = await db().order.findUniqueOrThrow({
        where: { id: order.id },
        select: { status: true },
      });
      expect(o.status, "VOIDED de otra tx no tumba la orden").toBe("FULFILLING");
    }).toPass({ timeout: 15_000 });
    record("voided-foraneo-ignorado", "VOIDED tx foránea → 200, orden sigue FULFILLING");

    // ── 6. VOIDED de la tx que pagó → CANCELLED + stock revertido.
    const voided = await fire(txApproved, "VOIDED", order.total, reference);
    expect(voided.status).toBe(200);
    await expect(async () => {
      const o = await db().order.findUniqueOrThrow({
        where: { id: order.id },
        select: { status: true },
      });
      expect(["CANCELLED", "REFUNDED"], "VOIDED real tumba la orden").toContain(o.status);
      const stock = await db().productVariant.findUniqueOrThrow({
        where: { id: product!.variantId },
        select: { stock: true },
      });
      expect(stock.stock, "stock revertido al anular (99 → 100)").toBe(100);
      const revertLog = await db().inventoryLog.findFirst({
        where: {
          variantId: product!.variantId,
          reason: { in: ["ORDER_CANCELLED", "ORDER_REFUNDED"] },
        },
      });
      expect(revertLog, "InventoryLog de reversión escrito").not.toBeNull();
    }).toPass({ timeout: 30_000 });
    record("voided-real-revierte", "VOIDED tx correcta → CANCELLED + stock 99→100 + log");

    writeFileSync(
      resultsPath,
      JSON.stringify(
        {
          spec: "fullmode-pasarela",
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
  } catch (err) {
    writeFileSync(
      resultsPath,
      JSON.stringify(
        {
          spec: "fullmode-pasarela",
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
