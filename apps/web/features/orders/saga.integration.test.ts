/*
 * Tests de integración de la SAGA POST-PAID — el corazón de la ruta de ingresos.
 *
 * SUT: features/orders/saga.ts
 *   - processPaidOrder: PENDING_PAYMENT → PAID (atómico: decrementa stock +
 *     InventoryLog + vacía cart) → claim atómico de guía → createShipment →
 *     persiste trackingNumber → FULFILLING. Email de confirmación idempotente.
 *   - processFailedPaymentOrder: DECLINED/VOIDED → estado terminal LEGAL según
 *     estado actual (CANCELLED / REFUNDED) + revierte stock si hubo decremento.
 *   - processTrackingUpdate: webhook Aveonline → transiciones FULFILLING→SHIPPED→
 *     DELIVERED + emails.
 *
 * FOCO (NO duplica order-transitions.test.ts ni stock.integration.test.ts):
 *   - order-transitions.test.ts ya fija la legalidad de canTransition (puro).
 *   - stock.integration.test.ts ya prueba el ledger aislado + el claim atómico
 *     de guía a bajo nivel + #10 VOIDED→REFUNDED con revert.
 *   Acá probamos la ORQUESTACIÓN de la saga: efectos COMBINADOS (estado + stock +
 *   cart + tracking + email) en un solo flujo, y la IDEMPOTENCIA de reentrada
 *   (webhook duplicado / retry) a nivel processPaidOrder.
 *
 * Estrategia: integración DB real (Order/OrderItem/InventoryLog/Product/Variant/
 * Category) + mocks OFFLINE deterministas de los colaboradores externos de la saga:
 *   - @/features/shipping/provider getShippingProvider(): stub createShipment
 *     (controla éxito/fallo + registra llamadas → aserción anti-doble-guía).
 *   - ./emails: stubs que registran llamadas; sendOrderConfirmationOnce simula
 *     el marcado real de confirmationSentAt para poder ejercer su idempotencia.
 *   - next/cache: no-op (getSettingValue de pickup usa unstable_cache).
 *   NUNCA pega a Aveonline/Resend reales.
 *
 * Aislamiento: fixtures con prefijo único por corrida (RUN) + limpieza SCOPED en
 * afterAll. JAMÁS toca seed/datos reales. Requiere DATABASE_URL (skipIf si falta).
 *   cd apps/web && ../../packages/db/node_modules/.bin/dotenv -e ../../.env.local \
 *     -- node_modules/.bin/vitest run features/orders/saga.integration.test.ts
 */

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// ───────────────────────── Mocks (antes de importar el SUT) ─────────────────────────

// next/cache → passthrough (getSettingValue de pickup usa unstable_cache).
vi.mock("next/cache", () => ({
  unstable_cache:
    (fn: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      fn(...args),
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}));

// Shipping provider stub — controla el resultado de createShipment y registra
// las llamadas para asertar que NO se crean guías duplicadas (idempotencia).
type CreateShipmentArgs = {
  carrier: string;
  orderId: string;
  items: Array<{ productSlug: string; qty: number; declaredValueCop: number }>;
  delivery: { city: string; department: string; address: string };
  pickup: { city: string; department: string };
};
const shipmentCalls: CreateShipmentArgs[] = [];
let shipmentShouldThrow: Error | null = null;
let shipmentResult = {
  trackingNumber: "TRACK-DEFAULT",
  trackingUrl: "https://track.test/TRACK-DEFAULT",
  labelUrl: "https://label.test/TRACK-DEFAULT.pdf",
  carrier: "envia",
  estimatedDeliveryAt: null as Date | null,
};
vi.mock("@/features/shipping/provider", () => ({
  getShippingProvider: async () => ({
    name: "aveonline" as const,
    createShipment: async (args: CreateShipmentArgs) => {
      shipmentCalls.push(args);
      if (shipmentShouldThrow) throw shipmentShouldThrow;
      return shipmentResult;
    },
  }),
}));

// Emails stub — registra llamadas. sendOrderConfirmationOnce simula el marcado
// REAL de confirmationSentAt (para poder ejercer su idempotencia a nivel saga)
// pero SIN pegar a Resend ni renderizar plantillas.
const emailCalls: Array<{ fn: string; orderId: string; extra?: string }> = [];
let confirmationShouldMark = true; // simula envío OK (marca timestamp) o fallo (no marca)
vi.mock("./emails", async () => {
  const { prisma } = await import("@/lib/db");
  return {
    sendOrderConfirmationOnce: async (orderId: string) => {
      emailCalls.push({ fn: "sendOrderConfirmationOnce", orderId });
      // Réplica fiel del contrato: solo marca si aún no estaba marcado y el
      // "envío" fue exitoso. Esto permite testear que un retry NO re-marca.
      const o = await prisma.order.findFirst({
        where: { id: orderId, deletedAt: null },
        select: { confirmationSentAt: true },
      });
      if (o && !o.confirmationSentAt && confirmationShouldMark) {
        await prisma.order.update({
          where: { id: orderId },
          data: { confirmationSentAt: new Date() },
        });
      }
    },
    sendOrderShipped: async (orderId: string) => {
      emailCalls.push({ fn: "sendOrderShipped", orderId });
    },
    sendOrderDelivered: async (orderId: string) => {
      emailCalls.push({ fn: "sendOrderDelivered", orderId });
    },
    sendOrderPaymentFailed: async (orderId: string, reason: string) => {
      emailCalls.push({ fn: "sendOrderPaymentFailed", orderId, extra: reason });
    },
    sendOrderRefunded: async (orderId: string) => {
      emailCalls.push({ fn: "sendOrderRefunded", orderId });
    },
  };
});

import { prisma } from "@/lib/db";
import { processPaidOrder, processFailedPaymentOrder, processTrackingUpdate } from "./saga";
import { refundOrder } from "./service";
import { INVENTORY_REASON } from "./stock";

const hasDb = Boolean(process.env.DATABASE_URL);

// Prefijo único por corrida. Toda fila creada lo lleva → limpieza scoped.
const RUN = `saga${Date.now()}${Math.floor(Math.random() * 1e6)}`.toLowerCase();

// IDs de fixtures compartidos (product + category). Las variants se crean por
// test con stock fresco para no acoplar aserciones de stock entre casos.
let categoryId = "";
let productId = "";

// physicalSpecs con dims completos → getEffectiveShippingDims devuelve dims.
const DIMS = { weightGrams: 120, widthCm: 8, heightCm: 8, depthCm: 2 };

// shippingAddress snapshot válido (lo que el checkout persiste).
const SHIP_ADDR = {
  fullName: "Lucia Perez",
  email: `${RUN}-buyer@lucams.test`,
  phone: "3001112233",
  documentType: "CC",
  documentNumber: "1020304050",
  city: "Bogotá",
  department: "Bogotá D.C.",
  addressLine1: "Calle 100 15-20",
  addressLine2: "Apto 401",
  zip: "110111",
};

// ───────────────────────── Helpers ─────────────────────────

/** Crea una variant fresca con stock dado. */
// Contador monótono para SKU único POR LLAMADA. Sin esto, un tag repetido —o un
// retry (retry:2) que re-ejecuta un test cuya variante ya se creó— colisiona en
// el UNIQUE de sku (P2002). El contador sobrevive al retry (mismo módulo) → SKU
// nuevo en cada intento. (Fix aislamiento hallado por la revisión.)
let variantSeq = 0;
// Contador para números de orden únicos POR LLAMADA. Sin esto, un test que flakea
// en el intento 1 (read-after-write del pooler) re-crea el mismo `number` fijo en
// el retry → P2002. El seq da un número fresco por intento (igual que variantSeq).
let numberSeq = 0;
async function makeVariant(stock: number, tag: string): Promise<string> {
  const v = await prisma.productVariant.create({
    data: {
      productId,
      name: `Variante ${tag}`,
      sku: `${RUN}-${tag}-${++variantSeq}`.toUpperCase(),
      stock,
      attributes: {},
    },
    select: { id: true },
  });
  return v.id;
}

/**
 * Crea una Order PENDING_PAYMENT con items (variantId, qty, unitPrice) lista para
 * pasar por processPaidOrder. Opcionalmente asocia un cartId real (para probar el
 * vaciado atómico del cart).
 */
async function makePendingOrder(
  items: Array<{ variantId: string; qty: number; unitPrice: number }>,
  opts: { cartId?: string; numberTag: string; couponId?: string; discount?: number; customerId?: string },
): Promise<string> {
  const subtotal = items.reduce((a, it) => a + it.unitPrice * it.qty, 0);
  const discount = opts.discount ?? 0;
  const order = await prisma.order.create({
    data: {
      number: `LCM-${RUN}-${opts.numberTag}-${++numberSeq}`.toUpperCase(),
      email: SHIP_ADDR.email,
      phone: SHIP_ADDR.phone,
      shippingAddress: SHIP_ADDR,
      subtotal,
      discount,
      shipping: 0,
      total: subtotal - discount,
      currency: "COP",
      paymentMethod: "WOMPI",
      status: "PENDING_PAYMENT",
      shippingCarrier: "envia",
      cartId: opts.cartId,
      couponId: opts.couponId,
      customerId: opts.customerId,
      items: { create: items },
    },
    select: { id: true },
  });
  return order.id;
}

async function getOrder(id: string) {
  return prisma.order.findUnique({
    where: { id },
    select: {
      status: true,
      trackingNumber: true,
      trackingUrl: true,
      labelUrl: true,
      shippingCarrier: true,
      wompiTransactionId: true,
      confirmationSentAt: true,
      shipmentClaimedAt: true,
      needsReconciliation: true,
      reconciliationReason: true,
    },
  });
}

async function stockOf(variantId: string): Promise<number> {
  const v = await prisma.productVariant.findUnique({
    where: { id: variantId },
    select: { stock: true },
  });
  return v!.stock;
}

async function logsFor(orderId: string, reason?: string) {
  return prisma.inventoryLog.findMany({
    where: { orderId, ...(reason ? { reason } : {}) },
  });
}

// ───────────────────────── Suite ─────────────────────────

describe.skipIf(!hasDb)("saga POST-PAID — integración DB (ruta de ingresos)", () => {
  beforeAll(async () => {
    const category = await prisma.category.create({
      data: { slug: `${RUN}-cat`, name: `Cat ${RUN}` },
    });
    categoryId = category.id;
    const product = await prisma.product.create({
      data: {
        slug: `${RUN}-prod`,
        name: `Prod ${RUN}`,
        description: "fixture saga",
        basePrice: 1000,
        sku: `${RUN}-PROD`.toUpperCase(),
        categoryId,
        physicalSpecs: DIMS,
      },
    });
    productId = product.id;
  });

  afterEach(() => {
    // Reset del estado mutable de los mocks entre tests.
    shipmentCalls.length = 0;
    emailCalls.length = 0;
    shipmentShouldThrow = null;
    confirmationShouldMark = true;
    shipmentResult = {
      trackingNumber: "TRACK-DEFAULT",
      trackingUrl: "https://track.test/TRACK-DEFAULT",
      labelUrl: "https://label.test/TRACK-DEFAULT.pdf",
      carrier: "envia",
      estimatedDeliveryAt: null,
    };
  });

  afterAll(async () => {
    // Limpieza SCOPED al RUN. Respeta FKs: InventoryLog → OrderItem/Order →
    // Variant → Product → Category. Todo filtrado por el prefijo de esta corrida.
    const variants = await prisma.productVariant.findMany({
      where: { productId },
      select: { id: true },
    });
    const variantIds = variants.map((v) => v.id);
    const orders = await prisma.order.findMany({
      where: { number: { startsWith: `LCM-${RUN}`.toUpperCase() } },
      select: { id: true },
    });
    const orderIds = orders.map((o) => o.id);

    if (variantIds.length) {
      await prisma.inventoryLog.deleteMany({ where: { variantId: { in: variantIds } } });
    }
    if (orderIds.length) {
      await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    }
    await prisma.cart.deleteMany({ where: { id: { startsWith: `${RUN}-cart` } } });
    await prisma.coupon.deleteMany({ where: { code: { startsWith: RUN.toUpperCase() } } });
    if (variantIds.length) {
      await prisma.productVariant.deleteMany({ where: { id: { in: variantIds } } });
    }
    if (productId) await prisma.product.deleteMany({ where: { id: productId } });
    if (categoryId) await prisma.category.deleteMany({ where: { id: categoryId } });
  });

  // ═══════════════════ processPaidOrder — HAPPY PATH (efectos combinados) ═══════════════════

  describe("processPaidOrder — happy path", () => {
    it("marca PAID, decrementa stock, crea guía, persiste tracking, transiciona a FULFILLING y envía email", async () => {
      const variantId = await makeVariant(10, "hp");
      const orderId = await makePendingOrder(
        [{ variantId, qty: 3, unitPrice: 5000 }],
        { numberTag: "HP1" },
      );
      shipmentResult = {
        trackingNumber: `${RUN}-GUIA-HP1`,
        trackingUrl: "https://track.test/hp1",
        labelUrl: "https://label.test/hp1.pdf",
        carrier: "coordinadora",
        estimatedDeliveryAt: null,
      };

      const res = await processPaidOrder({ orderId, wompiTransactionId: "wompi-tx-hp1" });

      // Resultado.
      expect(res.status).toBe("ok");
      expect(res.trackingNumber).toBe(`${RUN}-GUIA-HP1`);

      // Estado final + campos de guía persistidos + wompiTransactionId.
      const o = await getOrder(orderId);
      expect(o?.status).toBe("FULFILLING");
      expect(o?.trackingNumber).toBe(`${RUN}-GUIA-HP1`);
      expect(o?.trackingUrl).toBe("https://track.test/hp1");
      expect(o?.labelUrl).toBe("https://label.test/hp1.pdf");
      // El carrier del provider sobrescribe al del pedido.
      expect(o?.shippingCarrier).toBe("coordinadora");
      expect(o?.wompiTransactionId).toBe("wompi-tx-hp1");
      // Email de confirmación enviado y marcado.
      expect(o?.confirmationSentAt).not.toBeNull();

      // Stock decrementado exactamente qty (10 - 3 = 7).
      expect(await stockOf(variantId)).toBe(7);

      // InventoryLog ORDER_PAID con delta correcto.
      const paidLogs = await logsFor(orderId, INVENTORY_REASON.ORDER_PAID);
      expect(paidLogs).toHaveLength(1);
      expect(paidLogs[0].delta).toBe(-3);

      // Se llamó a Aveonline exactamente UNA vez, con los datos del pedido.
      expect(shipmentCalls).toHaveLength(1);
      expect(shipmentCalls[0].orderId).toBe(orderId);
      expect(shipmentCalls[0].items[0]).toMatchObject({ qty: 3, declaredValueCop: 5000 });
      expect(shipmentCalls[0].delivery.city).toBe("Bogotá");

      // Email de confirmación disparado una vez.
      expect(emailCalls.filter((c) => c.fn === "sendOrderConfirmationOnce")).toHaveLength(1);
    }, 30000);

    it("F1 — al PAGAR con cupón: crea CouponUsage e incrementa usedCount (una sola vez)", async () => {
      const coupon = await prisma.coupon.create({
        data: {
          code: `${RUN}-CPN`.toUpperCase(),
          type: "FIXED",
          value: 3000,
          validFrom: new Date("2026-01-01"),
          validTo: new Date("2027-01-01"),
          usedCount: 0,
        },
        select: { id: true },
      });
      const variantId = await makeVariant(10, "cpn");
      const orderId = await makePendingOrder([{ variantId, qty: 2, unitPrice: 5000 }], {
        numberTag: "CPN1",
        couponId: coupon.id,
        discount: 3000,
      });

      await processPaidOrder({ orderId, wompiTransactionId: "wompi-tx-cpn1" });

      // CouponUsage creado con el monto descontado, ligado 1:1 a la orden.
      const usages = await prisma.couponUsage.findMany({ where: { couponId: coupon.id } });
      expect(usages).toHaveLength(1);
      expect(usages[0].orderId).toBe(orderId);
      expect(usages[0].amount).toBe(3000);
      // usedCount denormalizado incrementado.
      const after = await prisma.coupon.findUnique({
        where: { id: coupon.id },
        select: { usedCount: true },
      });
      expect(after?.usedCount).toBe(1);

      // Idempotencia: re-procesar (webhook duplicado) NO doble-cuenta el uso.
      await processPaidOrder({ orderId, wompiTransactionId: "wompi-tx-cpn1" });
      const usagesAfter = await prisma.couponUsage.count({ where: { couponId: coupon.id } });
      expect(usagesAfter).toBe(1);
      const finalCoupon = await prisma.coupon.findUnique({
        where: { id: coupon.id },
        select: { usedCount: true },
      });
      expect(finalCoupon?.usedCount).toBe(1);
    }, 30000);

    it("F1 — al pagar con cupón AGOTADO (usedCount≥maxUses): no incrementa ni registra uso", async () => {
      const coupon = await prisma.coupon.create({
        data: {
          code: `${RUN}-EXH`.toUpperCase(),
          type: "FIXED",
          value: 1000,
          maxUses: 1,
          usedCount: 1, // ya agotado
          validFrom: new Date("2026-01-01"),
          validTo: new Date("2027-01-01"),
        },
        select: { id: true },
      });
      const variantId = await makeVariant(10, "exh");
      const orderId = await makePendingOrder([{ variantId, qty: 1, unitPrice: 5000 }], {
        numberTag: "EXH",
        couponId: coupon.id,
        discount: 1000,
      });
      await processPaidOrder({ orderId, wompiTransactionId: "wompi-tx-exh" });

      // El incremento gateado NO sube usedCount por encima de maxUses…
      const c = await prisma.coupon.findUnique({ where: { id: coupon.id }, select: { usedCount: true } });
      expect(c?.usedCount).toBe(1);
      // …y no se registra CouponUsage (cupón ya agotado al pagar).
      const usages = await prisma.couponUsage.count({ where: { couponId: coupon.id } });
      expect(usages).toBe(0);
    }, 30000);

    it("F2 — refundOrder: PAID→REFUNDED, revierte stock, audita y es idempotente", async () => {
      const variantId = await makeVariant(10, "rf");
      const orderId = await makePendingOrder([{ variantId, qty: 3, unitPrice: 5000 }], {
        numberTag: "RF1",
      });
      // Falla la guía a propósito → la orden queda en PAID (no avanza a FULFILLING),
      // que es un estado reembolsable, con el stock ya decrementado (10 - 3 = 7).
      shipmentShouldThrow = new Error("Aveonline caído (test)");
      await processPaidOrder({ orderId, wompiTransactionId: "wompi-tx-rf1" });
      expect(await stockOf(variantId)).toBe(7);
      const paid = await prisma.order.findUnique({ where: { id: orderId }, select: { status: true } });
      expect(paid?.status).toBe("PAID");

      const res = await refundOrder(orderId, { adminId: "admin-rf", reason: "producto defectuoso" });
      expect(res.status).toBe("refunded");
      expect(res.amount).toBe(15_000); // total (subtotal, envío 0)

      const o = await prisma.order.findUnique({
        where: { id: orderId },
        select: { status: true, refundedAt: true, refundedBy: true, refundReason: true, refundAmount: true },
      });
      expect(o?.status).toBe("REFUNDED");
      expect(o?.refundedBy).toBe("admin-rf");
      expect(o?.refundReason).toBe("producto defectuoso");
      expect(o?.refundAmount).toBe(15_000);
      expect(o?.refundedAt).not.toBeNull();

      // Stock revertido (7 + 3 = 10) + log ORDER_REFUNDED + email disparado.
      expect(await stockOf(variantId)).toBe(10);
      expect(await logsFor(orderId, "ORDER_REFUNDED")).toHaveLength(1);
      expect(emailCalls.filter((c) => c.fn === "sendOrderRefunded")).toHaveLength(1);

      // Idempotencia: re-refund → already_refunded, sin sobrescribir ni doble-revertir.
      const again = await refundOrder(orderId, { adminId: "otro-admin", reason: "otra" });
      expect(again.status).toBe("already_refunded");
      const o2 = await prisma.order.findUnique({ where: { id: orderId }, select: { refundedBy: true } });
      expect(o2?.refundedBy).toBe("admin-rf");
      expect(await stockOf(variantId)).toBe(10);
    }, 30000);

    it("F2 — refundOrder rechaza un estado no reembolsable (PENDING_PAYMENT)", async () => {
      const variantId = await makeVariant(5, "rf2");
      const orderId = await makePendingOrder([{ variantId, qty: 1, unitPrice: 5000 }], {
        numberTag: "RF2",
      });
      // Nunca se pagó → PENDING_PAYMENT; PENDING_PAYMENT → REFUNDED no es legal.
      await expect(refundOrder(orderId, { adminId: "admin-rf" })).rejects.toThrow();
      const o = await prisma.order.findUnique({ where: { id: orderId }, select: { status: true } });
      expect(o?.status).toBe("PENDING_PAYMENT");
    });

    it("decrementa TODAS las variantes de una orden multi-ítem antes de crear una sola guía", async () => {
      const vA = await makeVariant(10, "multiA");
      const vB = await makeVariant(10, "multiB");
      const orderId = await makePendingOrder(
        [
          { variantId: vA, qty: 2, unitPrice: 3000 },
          { variantId: vB, qty: 5, unitPrice: 4000 },
        ],
        { numberTag: "MULTI1" },
      );

      const res = await processPaidOrder({ orderId, wompiTransactionId: "wompi-tx-multi" });

      expect(res.status).toBe("ok");
      expect(await stockOf(vA)).toBe(8);
      expect(await stockOf(vB)).toBe(5);
      // Dos logs ORDER_PAID (uno por variante) — una sola orden.
      expect(await logsFor(orderId, INVENTORY_REASON.ORDER_PAID)).toHaveLength(2);
      // Una sola guía para toda la orden (no una por ítem).
      expect(shipmentCalls).toHaveLength(1);
      expect(shipmentCalls[0].items).toHaveLength(2);
    }, 30000);

    it("vacía (soft-delete) el cart de origen atómicamente al pasar a PAID", async () => {
      const variantId = await makeVariant(5, "cart");
      const cart = await prisma.cart.create({
        data: { id: `${RUN}-cart-1`, sessionId: `${RUN}-sess-1`, currency: "COP" },
        select: { id: true },
      });
      const orderId = await makePendingOrder(
        [{ variantId, qty: 1, unitPrice: 5000 }],
        { cartId: cart.id, numberTag: "CART1" },
      );

      await processPaidOrder({ orderId });

      const c = await prisma.cart.findUnique({
        where: { id: cart.id },
        select: { deletedAt: true, deletedBy: true },
      });
      expect(c?.deletedAt).not.toBeNull();
      expect(c?.deletedBy).toBe("saga:order-paid");
    }, 30000);
  });

  // ═══════════════════ processPaidOrder — IDEMPOTENCIA (reentrada) ═══════════════════

  describe("processPaidOrder — idempotencia de reentrada", () => {
    it("segunda invocación sobre orden ya procesada NO decrementa stock ni crea guía nueva", async () => {
      const variantId = await makeVariant(10, "idem");
      const orderId = await makePendingOrder(
        [{ variantId, qty: 2, unitPrice: 5000 }],
        { numberTag: "IDEM1" },
      );
      shipmentResult = {
        trackingNumber: `${RUN}-GUIA-IDEM`,
        trackingUrl: "https://track.test/idem",
        labelUrl: "https://label.test/idem.pdf",
        carrier: "envia",
        estimatedDeliveryAt: null,
      };

      // 1ra pasada (happy).
      const first = await processPaidOrder({ orderId, wompiTransactionId: "tx-1" });
      expect(first.status).toBe("ok");
      const stockAfterFirst = await stockOf(variantId); // 8
      expect(stockAfterFirst).toBe(8);
      expect(shipmentCalls).toHaveLength(1);

      // 2da pasada (webhook Wompi duplicado). El guard `if (order.trackingNumber)`
      // al inicio corta limpio → already_processed, sin tocar nada.
      const second = await processPaidOrder({ orderId, wompiTransactionId: "tx-1" });
      expect(second.status).toBe("already_processed");
      expect(second.trackingNumber).toBe(`${RUN}-GUIA-IDEM`);

      // Stock NO cambió (no doble-decremento).
      expect(await stockOf(variantId)).toBe(8);
      // NO se creó una segunda guía (sigue en 1).
      expect(shipmentCalls).toHaveLength(1);
      // Sigue habiendo un solo log ORDER_PAID.
      expect(await logsFor(orderId, INVENTORY_REASON.ORDER_PAID)).toHaveLength(1);
    }, 30000);

    it("orden ya PAID con tracking null (guía falló antes) — reintento crea la guía sin re-decrementar", async () => {
      // Simula: 1ra pasada transicionó a PAID + decrementó, pero Aveonline falló.
      const variantId = await makeVariant(10, "retry");
      const orderId = await makePendingOrder(
        [{ variantId, qty: 4, unitPrice: 2000 }],
        { numberTag: "RETRY1" },
      );

      shipmentShouldThrow = new Error("Aveonline 503");
      const failed = await processPaidOrder({ orderId, wompiTransactionId: "tx-retry" });
      expect(failed.status).toBe("shipment_failed");

      const afterFail = await getOrder(orderId);
      expect(afterFail?.status).toBe("PAID"); // transicionó pero NO llegó a FULFILLING
      expect(afterFail?.trackingNumber).toBeNull();
      // Stock YA se decrementó en la 1ra pasada.
      expect(await stockOf(variantId)).toBe(6);
      // El claim se LIBERÓ (shipmentClaimedAt vuelve a null) para permitir retry.
      expect(afterFail?.shipmentClaimedAt).toBeNull();
      expect(shipmentCalls).toHaveLength(1);

      // Reintento con Aveonline OK. NO re-decrementa (log ORDER_PAID ya existe).
      shipmentShouldThrow = null;
      shipmentResult = {
        trackingNumber: `${RUN}-GUIA-RETRY`,
        trackingUrl: "https://track.test/retry",
        labelUrl: "https://label.test/retry.pdf",
        carrier: "envia",
        estimatedDeliveryAt: null,
      };
      const retried = await processPaidOrder({ orderId, wompiTransactionId: "tx-retry" });
      expect(retried.status).toBe("ok");
      expect(retried.trackingNumber).toBe(`${RUN}-GUIA-RETRY`);

      const done = await getOrder(orderId);
      expect(done?.status).toBe("FULFILLING");
      expect(done?.trackingNumber).toBe(`${RUN}-GUIA-RETRY`);
      // Stock intacto en 6 (NO se decrementó de nuevo).
      expect(await stockOf(variantId)).toBe(6);
      expect(await logsFor(orderId, INVENTORY_REASON.ORDER_PAID)).toHaveLength(1);
      // Segunda guía SÍ se creó (la 1ra había fallado); total de llamadas = 2.
      expect(shipmentCalls).toHaveLength(2);
    }, 30000);

    it("no re-envía el email de confirmación si ya se envió (confirmationSentAt seteado)", async () => {
      const variantId = await makeVariant(10, "email");
      const orderId = await makePendingOrder(
        [{ variantId, qty: 1, unitPrice: 5000 }],
        { numberTag: "EMAIL1" },
      );

      await processPaidOrder({ orderId });
      const firstSentAt = (await getOrder(orderId))?.confirmationSentAt;
      expect(firstSentAt).not.toBeNull();

      // Reentrada → sendOrderConfirmationOnce se invoca de nuevo PERO no re-marca
      // (ya estaba seteado). Verificamos que el timestamp NO cambió.
      await processPaidOrder({ orderId });
      const secondSentAt = (await getOrder(orderId))?.confirmationSentAt;
      expect(secondSentAt?.getTime()).toBe(firstSentAt?.getTime());
    }, 30000);
  });

  // ═══════════════════ processPaidOrder — CARRERA / STOCK AGOTADO ═══════════════════

  describe("processPaidOrder — stock agotado (reconciliación)", () => {
    it("Wompi APROBADO pero stock agotado entre PENDING_PAYMENT y PAID → flag needsReconciliation, queda PENDING_PAYMENT, sin guía", async () => {
      // Variant con stock 1 pero la orden pide 3 (otro comprador ganó la carrera).
      const variantId = await makeVariant(1, "nostock");
      const orderId = await makePendingOrder(
        [{ variantId, qty: 3, unitPrice: 5000 }],
        { numberTag: "NOSTOCK1" },
      );

      const res = await processPaidOrder({ orderId, wompiTransactionId: "tx-nostock" });

      expect(res.status).toBe("shipment_failed");
      expect(res.reason).toMatch(/reconciliación/i);

      const o = await getOrder(orderId);
      // Rollback: queda en PENDING_PAYMENT (NO PAID).
      expect(o?.status).toBe("PENDING_PAYMENT");
      // Marcada para atención humana.
      expect(o?.needsReconciliation).toBe(true);
      expect(o?.reconciliationReason).toMatch(/stock agotado/i);
      // Stock NO se tocó (rollback atómico).
      expect(await stockOf(variantId)).toBe(1);
      // NO se llamó a Aveonline (no hay guía sobre orden sin stock).
      expect(shipmentCalls).toHaveLength(0);
      // Sin log ORDER_PAID (la tx hizo rollback).
      expect(await logsFor(orderId, INVENTORY_REASON.ORDER_PAID)).toHaveLength(0);
    }, 30000);
  });

  // ═══════════════════ processPaidOrder — BORDES / INVÁLIDOS ═══════════════════

  describe("processPaidOrder — bordes e inválidos", () => {
    it("orderId inexistente → transition_failed (no lanza)", async () => {
      const res = await processPaidOrder({ orderId: `${RUN}-does-not-exist` });
      expect(res.status).toBe("transition_failed");
      expect(res.reason).toMatch(/no encontrada/i);
      expect(shipmentCalls).toHaveLength(0);
    }, 30000);

    it("orden soft-deleted (deletedAt) es invisible → transition_failed", async () => {
      const variantId = await makeVariant(5, "deleted");
      const orderId = await makePendingOrder(
        [{ variantId, qty: 1, unitPrice: 5000 }],
        { numberTag: "DELETED1" },
      );
      await prisma.order.update({
        where: { id: orderId },
        data: { deletedAt: new Date(), deletedBy: "test" },
      });

      const res = await processPaidOrder({ orderId });
      expect(res.status).toBe("transition_failed");
      // No decrementó ni creó guía.
      expect(await stockOf(variantId)).toBe(5);
      expect(shipmentCalls).toHaveLength(0);
    }, 30000);

    it("orden en estado no arrancable (CANCELLED) → transition_failed, sin efectos", async () => {
      const variantId = await makeVariant(5, "cancelled");
      const orderId = await makePendingOrder(
        [{ variantId, qty: 1, unitPrice: 5000 }],
        { numberTag: "CANCEL1" },
      );
      await prisma.order.update({ where: { id: orderId }, data: { status: "CANCELLED" } });

      const res = await processPaidOrder({ orderId });
      expect(res.status).toBe("transition_failed");
      expect(res.reason).toMatch(/CANCELLED/);
      expect(shipmentCalls).toHaveLength(0);
      expect(await stockOf(variantId)).toBe(5);
    }, 30000);

    it("variante sin dims de envío → shipment_failed ANTES de llamar Aveonline (pero ya transicionó a PAID + decrementó)", async () => {
      // Producto SIN physicalSpecs → getEffectiveShippingDims devuelve null.
      const bareProduct = await prisma.product.create({
        data: {
          slug: `${RUN}-bare`,
          name: `Bare ${RUN}`,
          description: "sin dims",
          basePrice: 1000,
          sku: `${RUN}-BARE`.toUpperCase(),
          categoryId,
          // physicalSpecs por defecto {} → sin weight/dims.
        },
        select: { id: true },
      });
      const bareVariant = await prisma.productVariant.create({
        data: { productId: bareProduct.id, name: "sin dims", sku: `${RUN}-BAREV`.toUpperCase(), stock: 5, attributes: {} },
        select: { id: true },
      });
      const orderId = await makePendingOrder(
        [{ variantId: bareVariant.id, qty: 1, unitPrice: 5000 }],
        { numberTag: "NODIMS1" },
      );

      const res = await processPaidOrder({ orderId });
      expect(res.status).toBe("shipment_failed");
      expect(res.reason).toMatch(/peso\/dimensiones|dimensiones/i);
      // NO se llamó a Aveonline (falla antes del claim/createShipment).
      expect(shipmentCalls).toHaveLength(0);
      // Pero SÍ transicionó a PAID y decrementó (el bloque de dims corre después).
      const o = await getOrder(orderId);
      expect(o?.status).toBe("PAID");
      expect(await stockOf(bareVariant.id)).toBe(4);

      // Cleanup del producto extra (fuera del productId compartido).
      await prisma.inventoryLog.deleteMany({ where: { variantId: bareVariant.id } });
      await prisma.orderItem.deleteMany({ where: { orderId } });
      await prisma.order.delete({ where: { id: orderId } });
      await prisma.productVariant.delete({ where: { id: bareVariant.id } });
      await prisma.product.delete({ where: { id: bareProduct.id } });
    }, 30000);

    it("Aveonline falla → shipment_failed, orden PAID sin tracking, claim liberado para retry", async () => {
      const variantId = await makeVariant(10, "avefail");
      const orderId = await makePendingOrder(
        [{ variantId, qty: 2, unitPrice: 5000 }],
        { numberTag: "AVEFAIL1" },
      );
      shipmentShouldThrow = new Error("No se pudo generar la guia");

      const res = await processPaidOrder({ orderId });
      expect(res.status).toBe("shipment_failed");
      expect(res.reason).toMatch(/No se pudo generar la guia/);

      const o = await getOrder(orderId);
      expect(o?.status).toBe("PAID");
      expect(o?.trackingNumber).toBeNull();
      expect(o?.shipmentClaimedAt).toBeNull(); // liberado
      // El decremento SÍ ocurrió (la guía es un paso posterior).
      expect(await stockOf(variantId)).toBe(8);
    }, 30000);

    it("claim de guía ya tomado (fresco) por otro proceso → already_processed, sin segunda guía", async () => {
      // Orden PAID, tracking null, shipmentClaimedAt ahora (otro proceso está
      // creando la guía). Esta invocación NO debe ganar el claim.
      const variantId = await makeVariant(10, "claimtaken");
      const orderId = await makePendingOrder(
        [{ variantId, qty: 1, unitPrice: 5000 }],
        { numberTag: "CLAIM1" },
      );
      // Llevar a PAID + decremento (1ra pasada con guía OK) NO — necesitamos
      // PAID sin tracking. Forzamos el estado directamente.
      await prisma.order.update({
        where: { id: orderId },
        data: { status: "PAID", shipmentClaimedAt: new Date() },
      });

      const res = await processPaidOrder({ orderId });
      expect(res.status).toBe("already_processed");
      // No se llamó a Aveonline (el claim lo tiene el "otro" proceso).
      expect(shipmentCalls).toHaveLength(0);
    }, 30000);
  });

  // ═══════════════════ processFailedPaymentOrder ═══════════════════

  describe("processFailedPaymentOrder — VOID/DECLINED", () => {
    it("DECLINED sobre PENDING_PAYMENT → CANCELLED, sin revert (no hubo decremento), envía email payment-failed", async () => {
      const variantId = await makeVariant(5, "declined");
      const orderId = await makePendingOrder(
        [{ variantId, qty: 1, unitPrice: 5000 }],
        { numberTag: "DECLINED1" },
      );

      await processFailedPaymentOrder({
        orderId,
        wompiTransactionId: "tx-declined",
        reason: "Fondos insuficientes",
      });

      const o = await getOrder(orderId);
      expect(o?.status).toBe("CANCELLED");
      expect(o?.wompiTransactionId).toBe("tx-declined");
      // Sin decremento previo → no-op de stock (sigue en 5).
      expect(await stockOf(variantId)).toBe(5);
      // No hay logs de revert.
      expect(await logsFor(orderId, INVENTORY_REASON.ORDER_CANCELLED)).toHaveLength(0);
      // Email de pago fallido enviado (era pre-pago).
      const failMails = emailCalls.filter((c) => c.fn === "sendOrderPaymentFailed");
      expect(failMails).toHaveLength(1);
      expect(failMails[0].extra).toBe("Fondos insuficientes");
    }, 30000);

    it("VOIDED sobre orden en FULFILLING → CANCELLED (legal desde FULFILLING) y revierte el stock", async () => {
      const variantId = await makeVariant(10, "void");
      const orderId = await makePendingOrder(
        [{ variantId, qty: 3, unitPrice: 5000 }],
        { numberTag: "VOID1" },
      );
      // Llevar a PAID con decremento real vía la saga (efecto combinado real).
      await processPaidOrder({ orderId });
      expect((await getOrder(orderId))?.status).toBe("FULFILLING"); // guía OK → FULFILLING
      expect(await stockOf(variantId)).toBe(7);

      // VOIDED llega.
      await processFailedPaymentOrder({
        orderId,
        wompiTransactionId: "tx-void",
        reason: "VOIDED por Wompi",
      });

      const o = await getOrder(orderId);
      // Desde FULFILLING el target NO es PAID/DELIVERED → la saga elige CANCELLED,
      // que ES legal desde FULFILLING (#10) y también revierte stock. REFUNDED
      // solo se elige desde PAID/DELIVERED (ver test PAIDPURE de PAID puro).
      expect(o?.status).toBe("CANCELLED");
      // Stock revertido a su valor original (10).
      expect(await stockOf(variantId)).toBe(10);
      // Log de revert ORDER_CANCELLED con delta = +qty.
      const revertLog = (await logsFor(orderId, INVENTORY_REASON.ORDER_CANCELLED))[0];
      expect(revertLog).toBeTruthy();
      expect(revertLog?.delta).toBe(3); // incremento = qty
    }, 30000);

    it("VOIDED sobre orden en estado PAID puro (sin FULFILLING) → REFUNDED y revierte stock", async () => {
      const variantId = await makeVariant(10, "paidpure");
      const orderId = await makePendingOrder(
        [{ variantId, qty: 2, unitPrice: 5000 }],
        { numberTag: "PAIDPURE1" },
      );
      // Llevar a PAID + decremento pero fallando la guía → queda PAID (no FULFILLING).
      shipmentShouldThrow = new Error("Aveonline down");
      await processPaidOrder({ orderId });
      expect((await getOrder(orderId))?.status).toBe("PAID");
      expect(await stockOf(variantId)).toBe(8);
      shipmentShouldThrow = null;

      await processFailedPaymentOrder({ orderId, reason: "VOIDED" });

      const o = await getOrder(orderId);
      expect(o?.status).toBe("REFUNDED"); // PAID → REFUNDED (legal, revierte)
      expect(await stockOf(variantId)).toBe(10);
      expect((await logsFor(orderId, INVENTORY_REASON.ORDER_REFUNDED)).length).toBeGreaterThan(0);
      // NO se envía email payment-failed desde PAID (sería contradictorio).
      expect(emailCalls.filter((c) => c.fn === "sendOrderPaymentFailed")).toHaveLength(0);
    }, 30000);

    it("es idempotente: segunda invocación sobre orden ya terminal es no-op", async () => {
      const variantId = await makeVariant(5, "termidem");
      const orderId = await makePendingOrder(
        [{ variantId, qty: 1, unitPrice: 5000 }],
        { numberTag: "TERMIDEM1" },
      );
      await processFailedPaymentOrder({ orderId, reason: "DECLINED" });
      expect((await getOrder(orderId))?.status).toBe("CANCELLED");
      emailCalls.length = 0;

      // 2da invocación (webhook duplicado) → no-op, no re-envía email.
      await processFailedPaymentOrder({ orderId, reason: "DECLINED" });
      expect((await getOrder(orderId))?.status).toBe("CANCELLED");
      expect(emailCalls.filter((c) => c.fn === "sendOrderPaymentFailed")).toHaveLength(0);
    }, 30000);

    it("orderId inexistente → no-op silencioso (no lanza)", async () => {
      await expect(
        processFailedPaymentOrder({ orderId: `${RUN}-ghost`, reason: "x" }),
      ).resolves.toBeUndefined();
    }, 30000);
  });

  // ═══════════════════ processTrackingUpdate ═══════════════════

  describe("processTrackingUpdate — webhook Aveonline", () => {
    /** Crea una orden FULFILLING con tracking (post-saga) lista para tracking updates. */
    async function makeFulfillingOrder(tag: string, trackingNumber: string): Promise<string> {
      const variantId = await makeVariant(10, `trk${tag}`);
      const orderId = await makePendingOrder(
        [{ variantId, qty: 1, unitPrice: 5000 }],
        { numberTag: `TRK${tag}` },
      );
      shipmentResult = {
        trackingNumber,
        trackingUrl: `https://track.test/${trackingNumber}`,
        labelUrl: `https://label.test/${trackingNumber}.pdf`,
        carrier: "envia",
        estimatedDeliveryAt: null,
      };
      await processPaidOrder({ orderId });
      expect((await getOrder(orderId))?.status).toBe("FULFILLING");
      emailCalls.length = 0; // limpiar el email de confirmación
      return orderId;
    }

    it("IN_TRANSIT desde FULFILLING → SHIPPED + email order-shipped", async () => {
      const tracking = `${RUN}-TRK-A`;
      const orderId = await makeFulfillingOrder("A", tracking);

      const res = await processTrackingUpdate({
        trackingNumber: tracking,
        status: "IN_TRANSIT",
        carrierStatusRaw: "EN TRANSITO",
      });

      expect(res.status).toBe("ok");
      expect(res.transitionedTo).toBe("SHIPPED");
      expect((await getOrder(orderId))?.status).toBe("SHIPPED");
      expect(emailCalls.filter((c) => c.fn === "sendOrderShipped")).toHaveLength(1);
    }, 30000);

    it("DELIVERED desde FULFILLING → salta a DELIVERED (SHIPPED intermedio) + email delivered", async () => {
      const tracking = `${RUN}-TRK-B`;
      const orderId = await makeFulfillingOrder("B", tracking);

      const res = await processTrackingUpdate({
        trackingNumber: tracking,
        status: "DELIVERED",
        carrierStatusRaw: "ENTREGADA",
      });

      expect(res.status).toBe("ok");
      expect(res.transitionedTo).toBe("DELIVERED");
      expect((await getOrder(orderId))?.status).toBe("DELIVERED");
      expect(emailCalls.filter((c) => c.fn === "sendOrderDelivered")).toHaveLength(1);
      // No dispara el email de shipped en el salto intermedio.
      expect(emailCalls.filter((c) => c.fn === "sendOrderShipped")).toHaveLength(0);
    }, 30000);

    it("DELIVERED desde SHIPPED → DELIVERED", async () => {
      const tracking = `${RUN}-TRK-C`;
      const orderId = await makeFulfillingOrder("C", tracking);
      // Primero a SHIPPED.
      await processTrackingUpdate({ trackingNumber: tracking, status: "IN_TRANSIT", carrierStatusRaw: "EN TRANSITO" });
      emailCalls.length = 0;

      const res = await processTrackingUpdate({
        trackingNumber: tracking,
        status: "DELIVERED",
        carrierStatusRaw: "ENTREGADA",
      });

      expect(res.status).toBe("ok");
      expect(res.transitionedTo).toBe("DELIVERED");
      expect((await getOrder(orderId))?.status).toBe("DELIVERED");
      expect(emailCalls.filter((c) => c.fn === "sendOrderDelivered")).toHaveLength(1);
    }, 30000);

    it("tracking desconocido → no_match, sin efectos", async () => {
      const res = await processTrackingUpdate({
        trackingNumber: `${RUN}-NO-SUCH-TRACK`,
        status: "DELIVERED",
        carrierStatusRaw: "ENTREGADA",
      });
      expect(res.status).toBe("no_match");
      expect(res.orderNumber).toBeUndefined();
    }, 30000);

    it("RETURNED → noop (no transición automática; admin decide)", async () => {
      const tracking = `${RUN}-TRK-D`;
      const orderId = await makeFulfillingOrder("D", tracking);

      const res = await processTrackingUpdate({
        trackingNumber: tracking,
        status: "RETURNED",
        carrierStatusRaw: "DEVUELTA",
      });

      expect(res.status).toBe("noop");
      expect(res.orderNumber).toBeTruthy();
      // El estado NO cambió automáticamente.
      expect((await getOrder(orderId))?.status).toBe("FULFILLING");
      expect(emailCalls).toHaveLength(0);
    }, 30000);

    it("EXCEPTION → noop, sin transición", async () => {
      const tracking = `${RUN}-TRK-E`;
      const orderId = await makeFulfillingOrder("E", tracking);

      const res = await processTrackingUpdate({
        trackingNumber: tracking,
        status: "EXCEPTION",
        carrierStatusRaw: "NOVEDAD",
      });

      expect(res.status).toBe("noop");
      expect((await getOrder(orderId))?.status).toBe("FULFILLING");
    }, 30000);

    it("IN_TRANSIT desde un estado no-FULFILLING (ej. DELIVERED) → noop, no retrocede", async () => {
      const tracking = `${RUN}-TRK-F`;
      const orderId = await makeFulfillingOrder("F", tracking);
      // Llevar a DELIVERED.
      await processTrackingUpdate({ trackingNumber: tracking, status: "DELIVERED", carrierStatusRaw: "ENTREGADA" });
      expect((await getOrder(orderId))?.status).toBe("DELIVERED");
      emailCalls.length = 0;

      // IN_TRANSIT tardío (fuera de orden) → noop, no retrocede a SHIPPED.
      const res = await processTrackingUpdate({
        trackingNumber: tracking,
        status: "IN_TRANSIT",
        carrierStatusRaw: "EN TRANSITO",
      });
      expect(res.status).toBe("noop");
      expect((await getOrder(orderId))?.status).toBe("DELIVERED");
      expect(emailCalls).toHaveLength(0);
    }, 30000);

    it("DELIVERED reentrante sobre orden ya DELIVERED → idempotente (sigue DELIVERED)", async () => {
      const tracking = `${RUN}-TRK-G`;
      const orderId = await makeFulfillingOrder("G", tracking);
      await processTrackingUpdate({ trackingNumber: tracking, status: "DELIVERED", carrierStatusRaw: "ENTREGADA" });
      expect((await getOrder(orderId))?.status).toBe("DELIVERED");

      // Reentrada del mismo webhook DELIVERED. current.status ya es DELIVERED:
      // no entra a la rama FULFILLING/SHIPPED → noop.
      const res = await processTrackingUpdate({
        trackingNumber: tracking,
        status: "DELIVERED",
        carrierStatusRaw: "ENTREGADA",
      });
      expect(res.status).toBe("noop");
      expect((await getOrder(orderId))?.status).toBe("DELIVERED");
    }, 30000);
  });
});
