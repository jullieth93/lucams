/*
 * Unit tests del núcleo puro de redención de cupones (Bloque F1).
 * priceCouponPure no toca DB → tests directos, exhaustivos, sobre cada regla.
 */

import { describe, it, expect } from "vitest";
import { priceCouponPure, type CouponRow, type CouponEligibleItem } from "./redemption";

const NOW = new Date("2026-07-03T12:00:00Z");

function coupon(overrides: Partial<CouponRow> = {}): CouponRow {
  return {
    id: "c1",
    code: "TEST",
    type: "PERCENT",
    value: 10,
    minOrder: null,
    maxUses: null,
    usedCount: 0,
    validFrom: new Date("2026-01-01T00:00:00Z"),
    validTo: new Date("2026-12-31T23:59:59Z"),
    isActive: true,
    appliesToCategories: [],
    appliesToProductSlugs: [],
    maxUsesPerCustomer: null,
    requiresMinQuantity: null,
    ...overrides,
  };
}

function item(over: Partial<CouponEligibleItem> = {}): CouponEligibleItem {
  return { productSlug: "iman-x", categorySlug: "clasicos", qty: 1, lineTotal: 20_000, ...over };
}

const ctx = (over: Partial<Parameters<typeof priceCouponPure>[1]> = {}) => ({
  items: [item()],
  subtotal: 20_000,
  shippingCost: 12_000,
  now: NOW,
  perCustomerUses: 0,
  ...over,
});

describe("priceCouponPure — cálculo de descuento", () => {
  it("PERCENT: descuenta el % del subtotal elegible (floor)", () => {
    const r = priceCouponPure(coupon({ type: "PERCENT", value: 15 }), ctx({ subtotal: 33_333, items: [item({ lineTotal: 33_333 })] }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.discount).toBe(Math.floor(33_333 * 0.15)); // 4999
  });

  it("FIXED: descuenta el valor fijo, capado al subtotal elegible", () => {
    const big = priceCouponPure(coupon({ type: "FIXED", value: 5_000 }), ctx());
    expect(big.ok && big.discount).toBe(5_000);
    // valor fijo mayor que el subtotal → capa al subtotal
    const capped = priceCouponPure(coupon({ type: "FIXED", value: 999_999 }), ctx({ subtotal: 20_000 }));
    expect(capped.ok && capped.discount).toBe(20_000);
  });

  it("FREE_SHIPPING: descuento = costo de envío", () => {
    const r = priceCouponPure(coupon({ type: "FREE_SHIPPING", value: 0 }), ctx({ shippingCost: 12_000 }));
    expect(r.ok && r.discount).toBe(12_000);
  });

  it("FREE_SHIPPING con envío 0 (aún no elegido) → ZERO_DISCOUNT", () => {
    const r = priceCouponPure(coupon({ type: "FREE_SHIPPING" }), ctx({ shippingCost: 0 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("ZERO_DISCOUNT");
  });
});

describe("priceCouponPure — vigencia y activación", () => {
  it("INACTIVE si isActive=false", () => {
    const r = priceCouponPure(coupon({ isActive: false }), ctx());
    expect(!r.ok && r.reason).toBe("INACTIVE");
  });
  it("NOT_STARTED si now < validFrom", () => {
    const r = priceCouponPure(coupon({ validFrom: new Date("2026-08-01") }), ctx());
    expect(!r.ok && r.reason).toBe("NOT_STARTED");
  });
  it("EXPIRED si now > validTo", () => {
    const r = priceCouponPure(coupon({ validTo: new Date("2026-06-01") }), ctx());
    expect(!r.ok && r.reason).toBe("EXPIRED");
  });
});

describe("priceCouponPure — límites de uso", () => {
  it("MAX_USES_REACHED si usedCount >= maxUses", () => {
    const r = priceCouponPure(coupon({ maxUses: 100, usedCount: 100 }), ctx());
    expect(!r.ok && r.reason).toBe("MAX_USES_REACHED");
  });
  it("permite si usedCount < maxUses", () => {
    const r = priceCouponPure(coupon({ maxUses: 100, usedCount: 99 }), ctx());
    expect(r.ok).toBe(true);
  });
  it("PER_CUSTOMER_LIMIT si perCustomerUses >= maxUsesPerCustomer", () => {
    const r = priceCouponPure(coupon({ maxUsesPerCustomer: 1 }), ctx({ perCustomerUses: 1 }));
    expect(!r.ok && r.reason).toBe("PER_CUSTOMER_LIMIT");
  });
  it("invitado (perCustomerUses=0) pasa aunque haya maxUsesPerCustomer", () => {
    const r = priceCouponPure(coupon({ maxUsesPerCustomer: 1 }), ctx({ perCustomerUses: 0 }));
    expect(r.ok).toBe(true);
  });
});

describe("priceCouponPure — mínimos", () => {
  it("MIN_ORDER_NOT_MET si subtotal < minOrder", () => {
    const r = priceCouponPure(coupon({ minOrder: 50_000 }), ctx({ subtotal: 20_000 }));
    expect(!r.ok && r.reason).toBe("MIN_ORDER_NOT_MET");
  });
  it("MIN_QUANTITY_NOT_MET si totalQty < requiresMinQuantity", () => {
    const r = priceCouponPure(coupon({ requiresMinQuantity: 6 }), ctx({ items: [item({ qty: 3 })] }));
    expect(!r.ok && r.reason).toBe("MIN_QUANTITY_NOT_MET");
  });
  it("cumple mínimo justo en el borde", () => {
    const r = priceCouponPure(coupon({ minOrder: 20_000, requiresMinQuantity: 1 }), ctx());
    expect(r.ok).toBe(true);
  });
});

describe("priceCouponPure — restricción por categoría/producto", () => {
  const items = [
    item({ productSlug: "iman-a", categorySlug: "clasicos", lineTotal: 20_000 }),
    item({ productSlug: "iman-b", categorySlug: "temporada", lineTotal: 30_000 }),
  ];

  it("PERCENT solo sobre items de la categoría permitida", () => {
    const r = priceCouponPure(
      coupon({ type: "PERCENT", value: 10, appliesToCategories: ["temporada"] }),
      ctx({ items, subtotal: 50_000 }),
    );
    // 10% de 30.000 (solo el de temporada), no de 50.000
    expect(r.ok && r.discount).toBe(3_000);
  });

  it("por producto específico", () => {
    const r = priceCouponPure(
      coupon({ type: "FIXED", value: 5_000, appliesToProductSlugs: ["iman-a"] }),
      ctx({ items, subtotal: 50_000 }),
    );
    expect(r.ok && r.discount).toBe(5_000);
  });

  it("NOT_APPLICABLE si ningún item del carrito califica", () => {
    const r = priceCouponPure(
      coupon({ appliesToCategories: ["inexistente"] }),
      ctx({ items, subtotal: 50_000 }),
    );
    expect(!r.ok && r.reason).toBe("NOT_APPLICABLE");
  });
});
