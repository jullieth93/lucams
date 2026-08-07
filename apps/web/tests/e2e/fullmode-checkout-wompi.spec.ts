/*
 * FULL-MODE E2E §7.5.1 (registrado) + §7.5.2 (firma integridad) + §7.5.5
 * (decremento al PAID) + §7.5.7 (contrato best-effort de emails).
 *
 * Cliente REGISTRADO (storageState del setup) recorre por UI:
 *   PDP → carrito → datos → envío (cotización Aveonline live) → pago →
 *   "Pagar con Wompi". La navegación al hosted checkout se intercepta
 *   (route.fulfill con HTML mock) y sobre la URL capturada se certifica:
 *     · reference = Order.number creada en DB (PENDING_PAYMENT, WOMPI),
 *     · amount-in-cents = order.total,
 *     · signature:integrity = sha256(reference+amount+COP+INTEGRITY_SECRET)
 *       recomputada en el test con el secret del ambiente.
 *   Antes de pagar: stock SIN decrementar (no hay descuento prematuro).
 *   Luego se dispara el webhook APPROVED sintético firmado (patrón §8) y se
 *   certifica la saga: PAID/FULFILLING + trackingNumber (guía test Aveonline,
 *   no facturable) + stock decrementado + InventoryLog ORDER_PAID + carrito
 *   cerrado (soft-delete dentro de la tx del PAID) + WebhookEvent sellado.
 *
 * Emails (§7.5.7): el server full corre con RESEND_API_KEY vacío (ver
 * scripts/e2e-fullmode.sh) → la aserción E2E es el CONTRATO: la orden se
 * confirma igual aunque el envío se salte (confirmationSentAt queda null,
 * nunca rompe el PAID). Contenido/templates: cubierto por vitest; la vía con
 * envío real: wompi-sandbox.spec.ts (live 4242).
 *
 * SOLO LOCAL + server full (scripts/e2e-fullmode.sh). Limpieza: order items →
 * order → producto (hijas→madres), WebhookEvent del RUN y buckets checkout_*
 * borrados; el Consent del checkout queda (ledger legal).
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { strip } from "./_setup/env";
import { E2E_ENV, expect, test } from "./fixtures/auth";
import { db, disconnectDb } from "./fixtures/db";
import { newRunId } from "./fixtures/run";
import { deleteEphemeralProduct, type EphemeralProduct } from "./fixtures/data-factory";
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
const run = newRunId("fm-wompi");
const WOMPI_SECRET = strip(process.env.WOMPI_EVENTS_SECRET);
const WOMPI_INTEGRITY = strip(process.env.WOMPI_INTEGRITY_SECRET);

let product: EphemeralProduct | null = null;
let orderId = "";

test.afterAll(async () => {
  if (orderId) {
    await db()
      .orderItem.deleteMany({ where: { orderId } })
      .catch(() => {});
    await db()
      .order.deleteMany({ where: { id: orderId } })
      .catch(() => {});
  }
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
  if (product) await deleteEphemeralProduct(product);
  // Carritos anónimos vacíos dejados por flujos que no llegaron a PAID (el
  // carrito se cierra solo al pagar): shells sin ítems ni PII de esta corrida.
  await db()
    .cart.deleteMany({
      where: { customerId: null, items: { none: {} }, createdAt: { gte: RUN_STARTED } },
    })
    .catch(() => {});
  await disconnectDb();
});

test("§7.5 checkout Wompi registrado: firma de integridad real + webhook APPROVED → saga completa", async ({
  clientPage,
  request,
}, testInfo) => {
  test.setTimeout(300_000);
  test.skip(!WOMPI_SECRET || !WOMPI_INTEGRITY, "Sin llaves Wompi en el ambiente.");
  mkdirSync(resolve(EVIDENCE_DIR, "shots"), { recursive: true });
  const resultsPath = resolve(
    EVIDENCE_DIR,
    `results-${E2E_ENV}-${testInfo.project.name}-${run}.json`,
  );
  const steps: { step: string; ok: boolean; detail?: string }[] = [];
  const record = (step: string, detail?: string) => steps.push({ step, ok: true, detail });

  try {
    const driven = await driveCheckoutToPago(clientPage, run);
    product = driven.product;
    record("ui-hasta-pago", `${driven.carriers} transportadora(s) cotizadas live`);

    // ── 1. Pagar: captura del redirect al hosted checkout (sin salir a internet).
    const pago = new CheckoutPagoPage(clientPage);
    const checkoutUrl = await pago.payWithWompiCapture();
    const params = new URL(checkoutUrl).searchParams;
    const reference = params.get("reference");
    const amountParam = params.get("amount-in-cents");
    const integrity = params.get("signature:integrity");
    expect(reference, "la URL lleva reference").toBeTruthy();
    expect(amountParam, "la URL lleva amount-in-cents").toBeTruthy();
    expect(integrity, "la URL lleva signature:integrity").toBeTruthy();

    // ── 2. La orden existe y la URL la representa fielmente.
    const order = await db().order.findFirstOrThrow({
      where: { number: reference!, deletedAt: null },
      select: {
        id: true,
        number: true,
        status: true,
        total: true,
        paymentMethod: true,
        cartId: true,
      },
    });
    orderId = order.id;
    expect(order.status, "orden creada en PENDING_PAYMENT").toBe("PENDING_PAYMENT");
    expect(order.paymentMethod).toBe("WOMPI");
    expect(Number(amountParam), "amount-in-cents = order.total").toBe(order.total);
    const expectedIntegrity = createHash("sha256")
      .update(`${reference}${order.total}COP${WOMPI_INTEGRITY}`)
      .digest("hex");
    expect(integrity, "firma de integridad = sha256(ref+amount+COP+secret)").toBe(
      expectedIntegrity,
    );
    record(
      "redirect-wompi-firmado",
      `reference=${reference} · amount=${order.total} · firma de integridad verificada`,
    );

    // ── 3. Antes del pago: stock intacto (§7.5.5 — no hay descuento prematuro).
    const stockBefore = await db().productVariant.findUniqueOrThrow({
      where: { id: product.variantId },
      select: { stock: true },
    });
    expect(stockBefore.stock, "stock intacto con la orden apenas creada").toBe(100);

    // ── 4. Webhook APPROVED sintético firmado → saga completa.
    const txId = `e2e-${run}-approved`;
    const res = await postWompiEvent(request, {
      secret: WOMPI_SECRET!,
      txId,
      status: "APPROVED",
      amount: order.total,
      reference: order.number,
      timestamp: Math.floor(Date.now() / 1000),
    });
    expect(res.status, "webhook APPROVED aceptado").toBe(200);

    await expect(async () => {
      const after = await db().order.findUniqueOrThrow({
        where: { id: order.id },
        select: {
          status: true,
          trackingNumber: true,
          wompiTransactionId: true,
          confirmationSentAt: true,
        },
      });
      expect(["PAID", "FULFILLING"], "la orden se confirma").toContain(after.status);
      expect(after.wompiTransactionId, "tx registrada en la orden").toBe(txId);
      expect(after.trackingNumber, "guía Aveonline test creada (no facturable)").toBeTruthy();
      // §7.5.7 — contrato best-effort: con RESEND_API_KEY vacío el envío se
      // salta y el PAID NO se rompe (confirmationSentAt queda null).
      expect(after.confirmationSentAt, "email saltado sin romper la saga").toBeNull();
      const stock = await db().productVariant.findUniqueOrThrow({
        where: { id: product!.variantId },
        select: { stock: true },
      });
      expect(stock.stock, "stock decrementado al PAID (100 → 99)").toBe(99);
      const log = await db().inventoryLog.findFirst({
        where: { variantId: product!.variantId, reason: "ORDER_PAID" },
      });
      expect(log, "InventoryLog ORDER_PAID escrito").not.toBeNull();
      // El carrito NO se vacía borrando ítems: clearCartAfterPaid lo CIERRA
      // (soft-delete con deletedBy="saga:order-paid") dentro de la tx del PAID
      // — verificado leyendo features/orders/service.ts:494 tras un fallo real.
      const cart = await db().cart.findUniqueOrThrow({
        where: { id: order.cartId! },
        select: { deletedAt: true, deletedBy: true },
      });
      expect(cart.deletedAt, "carrito cerrado atómicamente al PAID").not.toBeNull();
    }).toPass({ timeout: 60_000 });
    const sealed = await db().webhookEvent.findFirst({
      where: { source: "WOMPI", externalId: { startsWith: `${txId}-APPROVED-` } },
    });
    expect(sealed?.processedAt, "WebhookEvent sellado").not.toBeNull();
    record(
      "webhook-approved-saga",
      "PAID/FULFILLING + guía test + stock 100→99 + InventoryLog + carrito cerrado (soft-delete en la tx) + email saltado sin romper",
    );
    const shot = resolve(
      EVIDENCE_DIR,
      "shots",
      `${E2E_ENV}-${testInfo.project.name}-${run}-paid.png`,
    );
    await clientPage.screenshot({ path: shot });

    writeFileSync(
      resultsPath,
      JSON.stringify(
        {
          spec: "fullmode-checkout-wompi",
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
          spec: "fullmode-checkout-wompi",
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
