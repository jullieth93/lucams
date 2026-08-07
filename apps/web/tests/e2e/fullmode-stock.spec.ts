/*
 * FULL-MODE E2E §7.5.5 — Stock: oversold imposible sobre la última unidad.
 *
 * DIVERGENCIA documentada respecto al prompt: el repo NO implementa reservas
 * (`StockReservation` existe en el schema sin consumidores y no existe el cron
 * `stock_reservation_cleanup` — features/orders/stock.ts:25). El modelo real
 * es: lectura validadora en cada paso + DECREMENTO ATÓMICO condicional
 * (UPDATE … WHERE stock>=qty) dentro de la tx del PAID. La carrera sobre la
 * última unidad se resuelve así: el segundo pago NO se confirma — la orden
 * queda PENDING_PAYMENT marcada needsReconciliation (visible en
 * /admin/pedidos) y el stock JAMÁS queda negativo. Este spec certifica ESE
 * modelo, no el del prompt.
 *
 * Matriz (producto efímero con stock=1, dos clientes anónimos A y B):
 *   1. A y B completan el checkout por UI hasta /checkout/pago y crean su
 *      orden (ambas PENDING_PAYMENT sobre la misma unidad — sin reservas).
 *   2. APPROVED de A (webhook sintético firmado) → PAID + stock 1→0.
 *   3. APPROVED de B → el decremento atómico falla → B sigue PENDING_PAYMENT,
 *      needsReconciliation=true con motivo, stock sigue en 0 (nunca −1),
 *      sin guía.
 *   4. Prevención UI: B recarga /checkout/pago → redirect a /carrito con
 *      "ya no está disponible" (assertCheckoutAvailability).
 *
 * SOLO LOCAL + server full (scripts/e2e-fullmode.sh). Limpieza completa.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { baseUrlFor, currentEnv, extraHeadersFor, strip } from "./_setup/env";
import { E2E_ENV, expect, test } from "./fixtures/auth";
import { db, disconnectDb } from "./fixtures/db";
import { newRunId } from "./fixtures/run";
import {
  createEphemeralProduct,
  deleteEphemeralProductsByTag,
  type EphemeralProduct,
} from "./fixtures/data-factory";
import { postWompiEvent } from "./_helpers/synthetic-events";
import { driveToPagoWithProduct } from "./_helpers/checkout-flow";
import { CheckoutPagoPage } from "./pages/checkout-pago";

const EVIDENCE_DIR = resolve(__dirname, "../../tmp/e2e-homologacion");

test.skip(E2E_ENV !== "local", "La suite full-mode (Etapa 2) solo corre en LOCAL.");
test.skip(
  strip(process.env.NEXT_PUBLIC_STORE_MODE) !== "full",
  "Requiere el server en modo full: scripts/e2e-fullmode.sh.",
);

const RUN_STARTED = new Date();
const run = newRunId("fm-stock");
const WOMPI_SECRET = strip(process.env.WOMPI_EVENTS_SECRET);

let product: EphemeralProduct | null = null;
const orderIds: string[] = [];

test.afterAll(async () => {
  await db()
    .orderItem.deleteMany({ where: { order: { email: { startsWith: "e2e-fm-stock-" } } } })
    .catch(() => {});
  await db()
    .order.deleteMany({ where: { email: { startsWith: "e2e-fm-stock-" } } })
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
  await deleteEphemeralProductsByTag("e2e-fm-stock");
  // Carritos anónimos vacíos dejados por flujos que no llegaron a PAID (el
  // carrito se cierra solo al pagar): shells sin ítems ni PII de esta corrida.
  await db()
    .cart.deleteMany({
      where: { customerId: null, items: { none: {} }, createdAt: { gte: RUN_STARTED } },
    })
    .catch(() => {});
  await disconnectDb();
});

test("§7.5.5 oversold: 2 clientes por la última unidad — el segundo pago no confirma y el stock nunca queda negativo", async ({
  anonPage,
  browser,
  request,
}, testInfo) => {
  test.setTimeout(480_000);
  test.skip(!WOMPI_SECRET, "Sin WOMPI_EVENTS_SECRET en el ambiente.");
  const resultsPath = resolve(
    EVIDENCE_DIR,
    `results-${E2E_ENV}-${testInfo.project.name}-${run}.json`,
  );
  const steps: { step: string; ok: boolean; detail?: string }[] = [];
  const record = (step: string, detail?: string) => steps.push({ step, ok: true, detail });

  // Cliente B: segundo contexto anónimo (mismo ambiente/bypass que anonPage).
  const contextB = await browser.newContext({
    baseURL: baseUrlFor(currentEnv()),
    extraHTTPHeaders: extraHeadersFor(currentEnv()),
    ignoreHTTPSErrors: true,
  });
  const pageB = await contextB.newPage();

  const orderOf = async (reference: string) => {
    const o = await db().order.findFirstOrThrow({
      where: { number: reference, deletedAt: null },
      select: { id: true, number: true, total: true, status: true },
    });
    orderIds.push(o.id);
    return o;
  };
  const stockNow = () =>
    db()
      .productVariant.findUniqueOrThrow({
        where: { id: product!.variantId },
        select: { stock: true },
      })
      .then((v) => v.stock);

  try {
    product = await createEphemeralProduct(run, { withShippingDims: true, stock: 1 });

    // ── 1. A y B crean su orden por UI (ambas sobre la última unidad).
    await driveToPagoWithProduct(anonPage, product, `${run}-a`);
    const pagoA = new CheckoutPagoPage(anonPage);
    const urlA = await pagoA.payWithWompiCapture();
    const orderA = await orderOf(new URL(urlA).searchParams.get("reference")!);

    await driveToPagoWithProduct(pageB, product, `${run}-b`);
    const pagoB = new CheckoutPagoPage(pageB);
    const urlB = await pagoB.payWithWompiCapture();
    const orderB = await orderOf(new URL(urlB).searchParams.get("reference")!);
    expect(orderB.number, "dos órdenes distintas").not.toBe(orderA.number);
    record(
      "dos-ordenes-pending",
      `A=${orderA.number} y B=${orderB.number} PENDING_PAYMENT sobre stock=1`,
    );

    // ── 2. A paga → PAID + stock 1→0.
    const fire = (txId: string, status: string, order: { number: string; total: number }) =>
      postWompiEvent(request, {
        secret: WOMPI_SECRET!,
        txId,
        status,
        amount: order.total,
        reference: order.number,
        timestamp: Math.floor(Date.now() / 1000),
      });
    expect((await fire(`e2e-${run}-a`, "APPROVED", orderA)).status).toBe(200);
    await expect(async () => {
      const o = await db().order.findUniqueOrThrow({
        where: { id: orderA.id },
        select: { status: true },
      });
      expect(["PAID", "FULFILLING"]).toContain(o.status);
      expect(await stockNow(), "A cobró la última unidad").toBe(0);
    }).toPass({ timeout: 60_000 });
    record("a-paid-stock-0", "A → PAID/FULFILLING · stock 1→0");

    // ── 3. B paga después → NO confirma: PENDING_PAYMENT + reconciliación.
    expect((await fire(`e2e-${run}-b`, "APPROVED", orderB)).status).toBe(200);
    await expect(async () => {
      const o = await db().order.findUniqueOrThrow({
        where: { id: orderB.id },
        select: {
          status: true,
          needsReconciliation: true,
          reconciliationReason: true,
          trackingNumber: true,
        },
      });
      expect(o.status, "B NO se confirma: sigue PENDING_PAYMENT").toBe("PENDING_PAYMENT");
      expect(o.needsReconciliation, "B marcada para revisión manual").toBe(true);
      expect(o.reconciliationReason).toContain("stock agotado");
      expect(o.trackingNumber, "B sin guía").toBeNull();
      expect(await stockNow(), "stock nunca negativo").toBe(0);
    }).toPass({ timeout: 30_000 });
    record(
      "b-no-oversold",
      "APPROVED de B → PENDING_PAYMENT + needsReconciliation + sin guía · stock 0 (nunca −1)",
    );

    // ── 4. Prevención UI: B ya no puede volver a intentar el pago.
    await pageB.goto("/checkout/pago", { waitUntil: "domcontentloaded" });
    await expect(pageB).toHaveURL(/\/carrito\?.*error=/, { timeout: 30_000 });
    await expect(pageB.locator("body")).toContainText(/ya no está disponible/i);
    record(
      "b-ui-bloqueada",
      "B al recargar /checkout/pago → /carrito?error=…ya no está disponible",
    );

    writeFileSync(
      resultsPath,
      JSON.stringify(
        {
          spec: "fullmode-stock",
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
          spec: "fullmode-stock",
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
  } finally {
    await contextB.close();
  }
});
