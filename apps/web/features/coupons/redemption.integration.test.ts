/*
 * Integración DB — redención de cupones (Bloque F1).
 *
 * Verifica priceCouponForCart contra un carrito real (matching por slug de
 * producto/categoría) y createOrderFromCart aplicando el cupón (persiste discount
 * + couponId, re-validación atómica). Aislamiento por prefijo RUN + cleanup
 * SCOPED en afterAll.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { priceCouponForCart } from "./redemption";
import { createOrderFromCart } from "@/features/orders/service";

const hasDb = !!process.env.DATABASE_URL;
const RUN = `cpn${Date.now()}${Math.floor(Math.random() * 1e6)}`.toLowerCase();

let categoryId = "";
let productId = "";
let variantId = "";
const variantPrice = 20_000;

// Idempotente: vitest reintenta (retry:2) los tests que flakean por el
// read-after-write del pooler; el upsert evita P2002 al recrear el mismo código.
async function mkCoupon(
  data: Parameters<typeof prisma.coupon.create>[0]["data"] & { code: string },
): Promise<{ id: string }> {
  return prisma.coupon.upsert({
    where: { code: data.code },
    update: {},
    create: data,
    select: { id: true },
  });
}

async function makeCart(items: Array<{ variantId: string; qty: number; unitPrice: number }>) {
  const sessionId = `${RUN}-cart-${Math.random().toString(36).slice(2)}`;
  const cart = await prisma.cart.create({
    data: { sessionId, currency: "COP", items: { create: items.map((it) => ({ ...it })) } },
    select: { id: true },
  });
  return cart.id;
}

function orderInput(cartId: string, couponCode?: string) {
  return {
    cartId,
    customerId: null,
    shipping: {
      fullName: "Test User",
      email: `${RUN}-buyer@lucams.test`,
      phone: "+573001112233",
      city: "Bogotá",
      department: "Cundinamarca",
      addressLine1: "Cra 1 # 2-3",
      zip: "110111",
      notes: undefined,
    },
    shippingSelection: {
      carrier: "envia",
      carrierName: "Envía",
      fleteCop: 12_000,
      deliveryDays: 3,
      contraentrega: false,
      quoteId: `${RUN}-quote`,
    },
    billing: { wantsInvoice: false },
    paymentMethod: "WOMPI" as const,
    couponCode,
  };
}

const VALID = { validFrom: new Date("2026-01-01"), validTo: new Date("2027-01-01") };

describe.skipIf(!hasDb)("coupons/redemption — integración DB", { timeout: 30_000 }, () => {
  beforeAll(async () => {
    const category = await prisma.category.create({
      data: { slug: `${RUN}-cat`, name: `Cat ${RUN}` },
    });
    categoryId = category.id;
    const product = await prisma.product.create({
      data: {
        slug: `${RUN}-prod`,
        name: `Prod ${RUN}`,
        description: "fixture cupón",
        basePrice: variantPrice,
        sku: `${RUN}-PROD`.toUpperCase(),
        categoryId,
        variants: {
          create: [
            { name: "Default", sku: `${RUN}-V`.toUpperCase(), price: variantPrice, stock: 100, attributes: {} },
          ],
        },
      },
      select: { id: true, variants: { select: { id: true } } },
    });
    productId = product.id;
    variantId = product.variants[0]!.id;
  });

  afterAll(async () => {
    const safe = async (fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch {
        /* teardown best-effort */
      }
    };
    await safe(() =>
      prisma.couponUsage.deleteMany({ where: { coupon: { code: { startsWith: RUN.toUpperCase() } } } }),
    );
    await safe(() => prisma.order.deleteMany({ where: { email: `${RUN}-buyer@lucams.test` } }));
    await safe(() => prisma.cart.deleteMany({ where: { sessionId: { startsWith: `${RUN}-cart` } } }));
    await safe(() => prisma.coupon.deleteMany({ where: { code: { startsWith: RUN.toUpperCase() } } }));
    await safe(() => prisma.productVariant.deleteMany({ where: { productId } }));
    await safe(() => prisma.product.deleteMany({ where: { id: productId } }));
    await safe(() => prisma.category.deleteMany({ where: { id: categoryId } }));
    await prisma.$disconnect();
  });

  it("priceCouponForCart: PERCENT válido descuenta el % del subtotal", async () => {
    const cartId = await makeCart([{ variantId, qty: 2, unitPrice: variantPrice }]); // 40.000
    const code = `${RUN}-P10`.toUpperCase();
    await mkCoupon({ code, type: "PERCENT", value: 10, ...VALID });
    const r = await priceCouponForCart({ code, cartId, shippingCost: 12_000, customerId: null });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.discount).toBe(4_000); // 10% de 40.000
  });

  it("priceCouponForCart: minOrder no alcanzado → MIN_ORDER_NOT_MET", async () => {
    const cartId = await makeCart([{ variantId, qty: 1, unitPrice: variantPrice }]); // 20.000
    const code = `${RUN}-MIN`.toUpperCase();
    await mkCoupon({ code, type: "FIXED", value: 5_000, minOrder: 100_000, ...VALID });
    const r = await priceCouponForCart({ code, cartId, shippingCost: 0, customerId: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("MIN_ORDER_NOT_MET");
  });

  it("priceCouponForCart: restricción por categoría matchea el producto del cart", async () => {
    const cartId = await makeCart([{ variantId, qty: 1, unitPrice: variantPrice }]);
    const okCode = `${RUN}-CATOK`.toUpperCase();
    const noCode = `${RUN}-CATNO`.toUpperCase();
    await mkCoupon({ code: okCode, type: "PERCENT", value: 20, appliesToCategories: [`${RUN}-cat`], ...VALID });
    await mkCoupon({ code: noCode, type: "PERCENT", value: 20, appliesToCategories: ["otra-categoria"], ...VALID });
    const ok = await priceCouponForCart({ code: okCode, cartId, shippingCost: 0, customerId: null });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.discount).toBe(4_000); // 20% de 20.000
    const no = await priceCouponForCart({ code: noCode, cartId, shippingCost: 0, customerId: null });
    expect(no.ok).toBe(false);
    if (!no.ok) expect(no.reason).toBe("NOT_APPLICABLE");
  });

  it("createOrderFromCart aplica el cupón: persiste discount + couponId + total", async () => {
    const cartId = await makeCart([{ variantId, qty: 2, unitPrice: variantPrice }]); // 40.000
    const code = `${RUN}-ORD`.toUpperCase();
    const coupon = await mkCoupon({ code, type: "FIXED", value: 8_000, ...VALID });
    const order = await createOrderFromCart(orderInput(cartId, code));
    expect(order.discount).toBe(8_000);
    expect(order.subtotal).toBe(40_000);
    expect(order.total).toBe(40_000 + 12_000 - 8_000); // subtotal + envío − descuento
    const persisted = await prisma.order.findUnique({ where: { id: order.id }, select: { couponId: true } });
    expect(persisted?.couponId).toBe(coupon.id);
  });

  it("createOrderFromCart ignora un cupón vencido (discount 0, couponId null)", async () => {
    const cartId = await makeCart([{ variantId, qty: 1, unitPrice: variantPrice }]);
    const code = `${RUN}-EXP`.toUpperCase();
    await mkCoupon({
      code,
      type: "FIXED",
      value: 5_000,
      validFrom: new Date("2025-01-01"),
      validTo: new Date("2025-02-01"),
    });
    const order = await createOrderFromCart(orderInput(cartId, code));
    expect(order.discount).toBe(0);
    const persisted = await prisma.order.findUnique({ where: { id: order.id }, select: { couponId: true } });
    expect(persisted?.couponId).toBeNull();
  });
});
