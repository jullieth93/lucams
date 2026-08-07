/*
 * FULL-MODE E2E §7.5.4 — Cupones en el checkout (paso de pago).
 *
 * Matriz sobre cupones sembrados en DB con el RUN (nunca cupones reales):
 *   · código inexistente → "Ese código no existe o ya no está disponible."
 *   · pausado (isActive=false) → "Ese cupón está pausado."
 *   · vencido (validTo pasado) → "Ese cupón ya venció."
 *   · agotado (usedCount=maxUses) → "Ese cupón se agotó."
 *   · VÁLIDO (PERCENT 10%) → caja verde + línea "Descuento" en el resumen y
 *     total recomputado; al pagar (redirect Wompi capturado + webhook APPROVED
 *     sintético firmado) → CouponUsage con el monto exacto + usedCount
 *     incrementado atómicamente (saga, misma tx del PAID).
 *
 * SOLO LOCAL + server full (scripts/e2e-fullmode.sh). Limpieza: CouponUsage →
 * Coupon → OrderItem → Order → producto → WebhookEvent/buckets — todo con RUN.
 */
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
const run = newRunId("fm-coupon");
const digits = run.replace(/\D/g, "").slice(-8);
const CODE_OK = `E2E${digits}OK`;
const CODE_INACTIVE = `E2E${digits}OFF`;
const CODE_EXPIRED = `E2E${digits}OLD`;
const CODE_EXHAUSTED = `E2E${digits}MAX`;
const WOMPI_SECRET = strip(process.env.WOMPI_EVENTS_SECRET);

let product: EphemeralProduct | null = null;
let orderId = "";
let couponIds: string[] = [];

test.beforeAll(async () => {
  const now = new Date();
  const past = new Date(now.getTime() - 24 * 3600_000);
  const future = new Date(now.getTime() + 24 * 3600_000);
  const created = await Promise.all([
    db().coupon.create({
      data: {
        code: CODE_OK,
        type: "PERCENT",
        value: 10,
        isActive: true,
        validFrom: past,
        validTo: future,
        maxUses: 50,
        description: `Cupón E2E ${run} (se borra en teardown)`,
      },
      select: { id: true },
    }),
    db().coupon.create({
      data: {
        code: CODE_INACTIVE,
        type: "PERCENT",
        value: 10,
        isActive: false,
        validFrom: past,
        validTo: future,
      },
      select: { id: true },
    }),
    db().coupon.create({
      data: {
        code: CODE_EXPIRED,
        type: "PERCENT",
        value: 10,
        isActive: true,
        validFrom: new Date(past.getTime() - 48 * 3600_000),
        validTo: past,
      },
      select: { id: true },
    }),
    db().coupon.create({
      data: {
        code: CODE_EXHAUSTED,
        type: "PERCENT",
        value: 10,
        isActive: true,
        validFrom: past,
        validTo: future,
        maxUses: 1,
        usedCount: 1,
      },
      select: { id: true },
    }),
  ]);
  couponIds = created.map((c) => c.id);
});

test.afterAll(async () => {
  await db()
    .couponUsage.deleteMany({ where: { couponId: { in: couponIds } } })
    .catch(() => {});
  await db()
    .coupon.deleteMany({ where: { id: { in: couponIds } } })
    .catch(() => {});
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
  for (const scope of ["checkout_pay", "coupon_apply"]) {
    await db()
      .$executeRawUnsafe(`DELETE FROM rate_limit_buckets WHERE key LIKE '${scope}:%'`)
      .catch(() => {});
  }
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

test("§7.5.4 cupones: inválido/pausado/vencido/agotado con mensaje + válido descuenta y registra uso al pagar", async ({
  anonPage,
  request,
}, testInfo) => {
  test.setTimeout(300_000);
  test.skip(!WOMPI_SECRET, "Sin WOMPI_EVENTS_SECRET en el ambiente.");
  const resultsPath = resolve(
    EVIDENCE_DIR,
    `results-${E2E_ENV}-${testInfo.project.name}-${run}.json`,
  );
  mkdirSync(resolve(EVIDENCE_DIR, "shots"), { recursive: true });
  const steps: { step: string; ok: boolean; detail?: string }[] = [];
  const record = (step: string, detail?: string) => steps.push({ step, ok: true, detail });

  try {
    const driven = await driveCheckoutToPago(anonPage, run);
    product = driven.product;
    const pago = new CheckoutPagoPage(anonPage);

    // ── Rechazos con mensaje claro (matriz de errores real del código).
    const cases: [string, RegExp, string][] = [
      [`E2E${digits}NOPE`, /no existe o ya no está disponible/i, "inexistente"],
      [CODE_INACTIVE, /está pausado/i, "pausado"],
      [CODE_EXPIRED, /ya venció/i, "vencido"],
      [CODE_EXHAUSTED, /se agotó/i, "agotado"],
    ];
    for (const [code, re, label] of cases) {
      await pago.applyCoupon(code);
      await expect(pago.couponError(), `cupón ${label} → mensaje claro`).toHaveText(re, {
        timeout: 20_000,
      });
      record(`cupon-${label}-rechazado`, `"${code}" → ${re.source}`);
    }

    // ── Válido: caja verde + línea de descuento en el resumen.
    await pago.applyCoupon(CODE_OK);
    await expect(
      anonPage.getByText(new RegExp(`Cupón ${CODE_OK} aplicado`, "i")).first(),
      "caja verde de cupón aplicado",
    ).toBeVisible({ timeout: 20_000 });
    // La línea "Descuento (CÓDIGO)" del resumen con monto negativo. El valor
    // EXACTO se aserta en DB (10% de 19_900 = 1_990 centavos): la UI formatea
    // COP con redondeo y no es el contrato preciso.
    const discountRow = anonPage
      .locator("div", { has: anonPage.locator("dt", { hasText: /descuento/i }) })
      .first();
    await expect(discountRow, "línea Descuento con el código y monto negativo").toContainText(
      CODE_OK,
      { timeout: 20_000 },
    );
    await expect(discountRow).toContainText(/−\s*\$/);
    record("cupon-valido-aplicado", "caja verde + línea Descuento (código) con monto −$ visible");

    // ── Pagar: redirect capturado; la orden nace con el descuento.
    const checkoutUrl = await pago.payWithWompiCapture();
    const reference = new URL(checkoutUrl).searchParams.get("reference")!;
    const order = await db().order.findFirstOrThrow({
      where: { number: reference, deletedAt: null },
      select: {
        id: true,
        number: true,
        subtotal: true,
        shipping: true,
        discount: true,
        total: true,
        couponId: true,
      },
    });
    orderId = order.id;
    expect(order.discount, "descuento = 10% del subtotal").toBe(1_990);
    expect(order.total, "total = subtotal + envío − descuento").toBe(
      order.subtotal + order.shipping - order.discount,
    );
    expect(order.couponId, "la orden queda ligada al cupón").toBe(couponIds[0]);
    const amountParam = Number(new URL(checkoutUrl).searchParams.get("amount-in-cents"));
    expect(amountParam, "Wompi cobra el total CON descuento").toBe(order.total);
    record(
      "orden-con-descuento",
      `subtotal ${order.subtotal} + envío ${order.shipping} − ${order.discount} = ${order.total} · amount-in-cents coherente`,
    );

    // ── Webhook APPROVED → CouponUsage + usedCount atómico.
    const before = await db().coupon.findUniqueOrThrow({
      where: { id: couponIds[0]! },
      select: { usedCount: true },
    });
    const txId = `e2e-${run}-approved`;
    const res = await postWompiEvent(request, {
      secret: WOMPI_SECRET!,
      txId,
      status: "APPROVED",
      amount: order.total,
      reference: order.number,
      timestamp: Math.floor(Date.now() / 1000),
    });
    expect(res.status).toBe(200);
    await expect(async () => {
      const usage = await db().couponUsage.findFirst({
        where: { couponId: couponIds[0]!, orderId: order.id },
      });
      expect(usage, "CouponUsage registrado al pagar").not.toBeNull();
      expect(usage!.amount).toBe(1_990);
      const after = await db().coupon.findUniqueOrThrow({
        where: { id: couponIds[0]! },
        select: { usedCount: true },
      });
      expect(after.usedCount, "usedCount +1 atómico en la tx del PAID").toBe(before.usedCount + 1);
    }).toPass({ timeout: 60_000 });
    record(
      "uso-registrado-al-pagar",
      `CouponUsage(amount=1990) + usedCount ${before.usedCount}→${before.usedCount + 1}`,
    );

    writeFileSync(
      resultsPath,
      JSON.stringify(
        {
          spec: "fullmode-cupones",
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
          spec: "fullmode-cupones",
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
