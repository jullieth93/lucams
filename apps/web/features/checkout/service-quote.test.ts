/*
 * Unit tests de quoteShipping — oferta "Envío Lucam's" con la regla
 * producción + hora de corte (lib/delivery-estimate.ts):
 *
 *  - maxProductionDays se deriva del carrito (máx. Product.productionDays de
 *    los items) y alimenta buildLucamsOffer.
 *  - ANTI-DIVERGENCIA del sello HMAC: la oferta que quoteShipping agrega al
 *    set sellado es EXACTAMENTE la que produce buildLucamsOffer con el mismo
 *    maxProductionDays — finalizeCheckout re-valida con match exacto contra
 *    ese set, así que cualquier divergencia rompería el checkout al pagar.
 *
 * Sin DB ni Supabase: todo lo externo mockeado (patrón de
 * service-finalize.test.ts). lucams-shipping se usa REAL (con settings
 * mockeadas) para que el test ejercite la integración verdadera.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { prisma, shippingProvider, lucamsSettings } = vi.hoisted(() => ({
  prisma: {
    productVariant: { findMany: vi.fn(async () => [] as unknown[]) },
    customer: { findFirst: vi.fn(async () => null) },
  },
  shippingProvider: { quote: vi.fn(async () => [] as unknown[]) },
  lucamsSettings: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ prisma }));
vi.mock("@/lib/cart-session", () => ({ peekCartSession: vi.fn(async () => "sess_1") }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => null) }));
vi.mock("@/lib/cms", () => ({
  getSettingValue: vi.fn(async (_k: string, fallback: string) => fallback),
}));
vi.mock("@/lib/stage-guard", () => ({ assertTransactionalAllowed: vi.fn() }));
vi.mock("@/features/orders/service", () => ({ createOrderFromCart: vi.fn() }));
vi.mock("@/features/orders/saga", () => ({ processPaidOrder: vi.fn() }));
vi.mock("@/features/orders/stock", () => ({ assertStockAvailable: vi.fn(async () => {}) }));
vi.mock("@/features/coupons/redemption", () => ({
  priceCouponForCart: vi.fn(),
  CouponInvalidatedError: class CouponInvalidatedError extends Error {},
}));
vi.mock("@/features/payments/provider", () => ({ getPaymentProvider: vi.fn() }));
vi.mock("@/features/shipping/provider", () => ({
  getShippingProvider: vi.fn(async () => shippingProvider),
}));
vi.mock("@/features/shipping/settings", () => ({
  getDisabledCarriersNormalized: vi.fn(async () => []),
  normalizeCarrierKey: (s: string) => s,
  getLucamsShippingSettings: () => lucamsSettings(),
}));
vi.mock("@/features/products/shipping-schemas", () => ({
  getEffectiveShippingDims: vi.fn(() => ({
    weightGrams: 100,
    widthCm: 10,
    heightCm: 10,
    depthCm: 10,
  })),
  parsePhysicalSpecs: vi.fn(),
  MissingShippingDimsError: class MissingShippingDimsError extends Error {},
}));
vi.mock("@/lib/checkout-session", () => ({
  getCheckoutState: vi.fn(async () => null),
  setCheckoutState: vi.fn(async () => {}),
  clearCheckoutState: vi.fn(async () => {}),
  sealShippingOffersPayload: vi.fn(() => "token"),
  openShippingOffersPayload: vi.fn(() => null),
}));
vi.mock("@/features/checkout/cod-risk", () => ({ assessCodRisk: vi.fn() }));
vi.mock("@/features/cart/service", () => ({ getCartDetail: vi.fn(async () => null) }));

import { quoteShipping } from "./service";
import { buildLucamsOffer, LUCAMS_CARRIER } from "@/features/shipping/lucams-shipping";

const BOGOTA = "11001";

/** Carrito con 2 items: uno listo (0 días de producción) y uno a fabricar (2). */
const CART_ITEMS = [
  { variantId: "v-listo", qty: 1, unitPrice: 10_000, productSlug: "iman-listo" },
  { variantId: "v-personalizado", qty: 1, unitPrice: 20_000, productSlug: "iman-personalizado" },
];

const VARIANTS = [
  {
    id: "v-listo",
    attributes: {},
    product: { slug: "iman-listo", physicalSpecs: {}, productionDays: 0 },
  },
  {
    id: "v-personalizado",
    attributes: {},
    product: { slug: "iman-personalizado", physicalSpecs: {}, productionDays: 2 },
  },
];

const ADDRESS = {
  kind: "urban",
  city: "Bogotá",
  department: "Cundinamarca",
  deptCode: "11",
  cityCode: BOGOTA,
  localityId: "chapinero",
  viaType: "Calle",
  viaNumber: "1",
  cruceNumber: "2",
};

const ctx = {
  cart: {
    cartId: "cart_1",
    sessionId: "sess_1",
    customerId: null,
    itemCount: 2,
    subtotal: 30_000,
    items: CART_ITEMS,
  },
  customerId: null,
  state: { step: 2, updatedAt: Date.now(), address: ADDRESS },
} as never;

// 2026-09-29 14:00 UTC = 09:00 Bogotá < cutoff 12 (la producción arranca hoy).
const BEFORE_CUTOFF = new Date("2026-09-29T14:00:00Z");
// 18:00 UTC = 13:00 Bogotá ≥ cutoff 12 (arranca el siguiente día hábil).
const AFTER_CUTOFF = new Date("2026-09-29T18:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(BEFORE_CUTOFF);
  prisma.productVariant.findMany.mockResolvedValue(VARIANTS);
  shippingProvider.quote.mockResolvedValue([
    {
      carrier: "coordinadora",
      carrierName: "Coordinadora",
      fleteCop: 9_000,
      deliveryDays: 3,
      contraentrega: false,
      quoteId: "q-coord",
    },
  ]);
  lucamsSettings.mockResolvedValue({
    enabled: true,
    priceCop: 1_000_000,
    cutoffHour: 12,
    zones: { [BOGOTA]: ["chapinero"] },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("quoteShipping — oferta Lucam's con producción + cutoff", () => {
  it("agrega la oferta propia con deliveryDays = max(productionDays) del carrito (antes del cutoff)", async () => {
    const result = await quoteShipping({
      destinationCity: "Bogotá",
      destinationDepartment: "Cundinamarca",
      ctx,
    });
    const lucams = result.quotes.find((q) => q.carrier === LUCAMS_CARRIER);
    expect(lucams).toBeDefined();
    // max(0, 2) = 2 días de producción + 0 (09:00 < 12) → entrega en 2 días hábiles.
    expect(lucams?.deliveryDays).toBe(2);
    // Las transportadoras siguen pasando intactas.
    expect(result.quotes.some((q) => q.carrier === "coordinadora")).toBe(true);
  });

  it("después del cutoff suma 1 (la producción arranca el siguiente día hábil)", async () => {
    vi.setSystemTime(AFTER_CUTOFF);
    const result = await quoteShipping({
      destinationCity: "Bogotá",
      destinationDepartment: "Cundinamarca",
      ctx,
    });
    const lucams = result.quotes.find((q) => q.carrier === LUCAMS_CARRIER);
    expect(lucams?.deliveryDays).toBe(3);
  });

  it("carrito de productos listos (0 días): entrega hoy antes del cutoff", async () => {
    prisma.productVariant.findMany.mockResolvedValue([VARIANTS[0]]);
    const soloListoCtx = {
      ...(ctx as object),
      cart: { ...(ctx as { cart: object }).cart, items: [CART_ITEMS[0]] },
    } as never;
    const result = await quoteShipping({
      destinationCity: "Bogotá",
      destinationDepartment: "Cundinamarca",
      ctx: soloListoCtx,
    });
    const lucams = result.quotes.find((q) => q.carrier === LUCAMS_CARRIER);
    expect(lucams?.deliveryDays).toBe(0);
  });

  it("ANTI-DIVERGENCIA: la oferta ofrecida es idéntica a buildLucamsOffer con el mismo maxProductionDays", async () => {
    const result = await quoteShipping({
      destinationCity: "Bogotá",
      destinationDepartment: "Cundinamarca",
      ctx,
    });
    const lucams = result.quotes.find((q) => q.carrier === LUCAMS_CARRIER);
    // Misma función, mismas settings mockeadas, mismo reloj: si quoteShipping
    // calculara distinto, el match exacto de finalizeCheckout contra el set
    // sellado (quoteId + fleteCop + deliveryDays + contraentrega) fallaría.
    const expected = await buildLucamsOffer(
      { cityCode: BOGOTA, zoneId: "chapinero" },
      { maxProductionDays: 2 },
    );
    expect(lucams).toEqual(expected);
  });

  it("si Aveonline falla, el fallback lucams-only conserva el mismo deliveryDays", async () => {
    shippingProvider.quote.mockRejectedValue(new Error("Aveonline down"));
    const result = await quoteShipping({
      destinationCity: "Bogotá",
      destinationDepartment: "Cundinamarca",
      ctx,
    });
    expect(result.quotes).toHaveLength(1);
    expect(result.quotes[0].carrier).toBe(LUCAMS_CARRIER);
    expect(result.quotes[0].deliveryDays).toBe(2);
  });
});
