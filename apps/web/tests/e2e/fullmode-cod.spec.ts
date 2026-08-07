/*
 * FULL-MODE E2E §7.5.3 — COD (contraentrega): pedido sin pago en línea +
 * guía Aveonline con recaudo (modo test, no facturable) + ledger COD visible
 * en el admin tras la entrega.
 *
 * Flujo (invitado, todo por UI + webhooks sintéticos firmados):
 *   1. Pre-check: el setting COD_ENABLED está ON (leído de DB, CmsField
 *      SETTING — si está OFF el spec se salta: el toggle on/off del chip ya
 *      lo cubre homolog-admin-cruces §5.3).
 *   2. Checkout UI completo → /checkout/pago → tarjeta "Pago contraentrega" →
 *      "Confirmar pedido" → redirect a la vista pública /pedido/<token>?nueva=1.
 *   3. Orden en DB: paymentMethod=COD, SIN wompiTransactionId, PAID/FULFILLING
 *      (la saga confirma COD de inmediato), trackingNumber de guía test
 *      (contraentrega con recaudo = total), stock decrementado.
 *   4. Antes de entregar: NO aparece en /admin/finanzas/conciliacion
 *      (el estado "por remitir" deriva de deliveredAt).
 *   5. Webhook Aveonline sintético (secret por header) ENTREGADA → orden
 *      DELIVERED con deliveredAt.
 *   6. Admin (SUPERADMIN efímero del setup): /admin/finanzas/conciliacion
 *      ?filter=pending lista el pedido con su número — el ledger COD es
 *      visible. (La marca de remesa es una acción humana; no se ejerce.)
 *
 * SOLO LOCAL + server full (scripts/e2e-fullmode.sh). Limpieza completa en
 * afterAll (orden, ítems, producto, eventos Aveonline, buckets checkout_cod).
 * El Consent del checkout queda (ledger legal).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { strip } from "./_setup/env";
import { E2E_ENV, expect, test } from "./fixtures/auth";
import { db, disconnectDb, getCmsFieldState } from "./fixtures/db";
import { newRunId } from "./fixtures/run";
import { deleteEphemeralProductsByTag, type EphemeralProduct } from "./fixtures/data-factory";
import { aveonlineEvent } from "./_helpers/synthetic-events";
import { driveCheckoutToPago } from "./_helpers/checkout-flow";
import { CheckoutPagoPage } from "./pages/checkout-pago";

const EVIDENCE_DIR = resolve(__dirname, "../../tmp/e2e-homologacion");

test.skip(E2E_ENV !== "local", "La suite full-mode (Etapa 2) solo corre en LOCAL.");
test.skip(
  strip(process.env.NEXT_PUBLIC_STORE_MODE) !== "full",
  "Requiere el server en modo full: scripts/e2e-fullmode.sh.",
);

const RUN_STARTED = new Date();
const run = newRunId("fm-cod");
const AVE_SECRET = strip(process.env.AVEONLINE_WEBHOOK_SECRET);

let product: EphemeralProduct | null = null;
let trackingNumber = "";

test.afterAll(async () => {
  await db()
    .orderItem.deleteMany({ where: { order: { email: { startsWith: "e2e-fm-cod-" } } } })
    .catch(() => {});
  await db()
    .order.deleteMany({ where: { email: { startsWith: "e2e-fm-cod-" } } })
    .catch(() => {});
  if (trackingNumber) {
    await db()
      .webhookEvent.deleteMany({
        where: { source: "AVEONLINE", externalId: { startsWith: `${trackingNumber}-` } },
      })
      .catch(() => {});
  }
  await db().$executeRaw`DELETE FROM rate_limit_buckets WHERE key LIKE 'checkout_cod:%'`.catch(
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
  await deleteEphemeralProductsByTag("e2e-fm-cod");
  // Carritos anónimos vacíos dejados por flujos que no llegaron a PAID (el
  // carrito se cierra solo al pagar): shells sin ítems ni PII de esta corrida.
  await db()
    .cart.deleteMany({
      where: { customerId: null, items: { none: {} }, createdAt: { gte: RUN_STARTED } },
    })
    .catch(() => {});
  await disconnectDb();
});

test("§7.5.3 COD: pedido sin pago → guía con recaudo test → entrega por webhook → visible en conciliación admin", async ({
  anonPage,
  adminPage,
  request,
}, testInfo) => {
  test.setTimeout(300_000);
  test.skip(!AVE_SECRET, "Sin AVEONLINE_WEBHOOK_SECRET en el ambiente.");
  const resultsPath = resolve(
    EVIDENCE_DIR,
    `results-${E2E_ENV}-${testInfo.project.name}-${run}.json`,
  );
  mkdirSync(resolve(EVIDENCE_DIR, "shots"), { recursive: true });
  const steps: { step: string; ok: boolean; detail?: string }[] = [];
  const record = (step: string, detail?: string) => steps.push({ step, ok: true, detail });

  try {
    // ── 1. Pre-check del setting (leído de DB, no asumido).
    const cod = await getCmsFieldState("COD_ENABLED");
    test.skip(cod?.publishedBody !== "true", "COD_ENABLED está OFF en este ambiente.");
    record("cod-enabled", `COD_ENABLED publicado = ${cod!.publishedBody}`);

    // ── 2. Checkout UI → COD.
    const driven = await driveCheckoutToPago(anonPage, run);
    product = driven.product;
    const pago = new CheckoutPagoPage(anonPage);
    await pago.payCodAndConfirm();
    record("redirect-pedido-publico", anonPage.url());

    // ── 3. Orden COD confirmada por la saga (sin pago en línea).
    const order = await db().order.findFirstOrThrow({
      where: { email: driven.customer.email, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        number: true,
        status: true,
        paymentMethod: true,
        wompiTransactionId: true,
        trackingNumber: true,
        total: true,
      },
    });
    trackingNumber = order.trackingNumber ?? "";
    expect(order.paymentMethod).toBe("COD");
    expect(order.wompiTransactionId, "COD sin transacción Wompi").toBeNull();
    expect(["PAID", "FULFILLING"], "la saga confirma COD de inmediato").toContain(order.status);
    expect(trackingNumber, "guía Aveonline test con recaudo creada").toBeTruthy();
    const stock = await db().productVariant.findUniqueOrThrow({
      where: { id: product.variantId },
      select: { stock: true },
    });
    expect(stock.stock, "stock comprometido al confirmar COD").toBe(99);
    // La vista pública muestra el pedido (token sin IDOR).
    await expect(anonPage.locator("body")).toContainText(order.number);
    record(
      "orden-cod-confirmada",
      `${order.number} · COD · ${order.status} · guía ${trackingNumber} · stock 100→99 · vista pública OK`,
    );

    // ── 4. Antes de la entrega NO es "por remitir".
    await adminPage.goto("/admin/finanzas/conciliacion?filter=pending", {
      waitUntil: "domcontentloaded",
    });
    await expect(
      adminPage.getByText(order.number),
      "sin deliveredAt no entra al ledger pendiente",
    ).not.toBeVisible({ timeout: 15_000 });
    record(
      "conciliacion-ausente-pre-entrega",
      "el pedido no aparece como pendiente antes de entregar",
    );

    // ── 5. Entrega por webhook Aveonline sintético (secret por header).
    const fecha = new Date().toISOString().slice(0, 19).replace("T", " ");
    const res = await request.post("/api/webhooks/aveonline", {
      headers: { "Content-Type": "application/json", "x-aveonline-secret": AVE_SECRET! },
      data: aveonlineEvent(trackingNumber, "ENTREGADA", fecha),
    });
    expect(res.status()).toBe(200);
    await expect(async () => {
      const o = await db().order.findUniqueOrThrow({
        where: { id: order.id },
        select: { status: true, deliveredAt: true },
      });
      expect(o.status).toBe("DELIVERED");
      expect(o.deliveredAt, "deliveredAt es el ancla del ledger COD").not.toBeNull();
    }).toPass({ timeout: 30_000 });
    record("webhook-entregada", "ENTREGADA firmada → DELIVERED con deliveredAt");

    // ── 6. Ahora SÍ es visible en la conciliación del admin.
    await adminPage.goto("/admin/finanzas/conciliacion?filter=pending", {
      waitUntil: "domcontentloaded",
    });
    await expect(
      adminPage.getByText(order.number),
      "el pedido entregado COD aparece como pendiente de remesa",
    ).toBeVisible({ timeout: 20_000 });
    const shot = resolve(
      EVIDENCE_DIR,
      "shots",
      `${E2E_ENV}-${testInfo.project.name}-${run}-conciliacion.png`,
    );
    await adminPage.screenshot({ path: shot, fullPage: true });
    record("conciliacion-visible", `${order.number} listado en pendientes de remesa`);

    writeFileSync(
      resultsPath,
      JSON.stringify(
        {
          spec: "fullmode-cod",
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
          spec: "fullmode-cod",
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
