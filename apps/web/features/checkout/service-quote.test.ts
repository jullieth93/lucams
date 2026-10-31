/*
 * Unit tests de quoteShipping — oferta "Envío Lucams" con la regla
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

const { prisma, shippingProvider, lucamsSettings, carrierRules } = vi.hoisted(() => ({
  prisma: {
    productVariant: { findMany: vi.fn(async () => [] as unknown[]) },
    customer: { findFirst: vi.fn(async () => null) },
  },
  shippingProvider: { quote: vi.fn(async () => [] as unknown[]) },
  lucamsSettings: vi.fn(),
  carrierRules: vi.fn<
    () => Promise<
      Record<
        string,
        { minWeightKg: number | null; maxWeightKg: number | null; note: string | null }
      >
    >
  >(async () => ({})),
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
  // normalizeCarrierKey real colapsa formato; acá identity y las keys de las
  // reglas se escriben igual que carrierName en los tests.
  normalizeCarrierKey: (s: string) => s,
  getCarrierRules: () => carrierRules(),
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
  {
    variantId: "v-listo",
    qty: 1,
    inventoryUnits: 1,
    unitPrice: 10_000,
    productSlug: "iman-listo",
  },
  {
    variantId: "v-personalizado",
    qty: 1,
    inventoryUnits: 1,
    unitPrice: 20_000,
    productSlug: "iman-personalizado",
  },
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
  carrierRules.mockResolvedValue({});
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

describe("quoteShipping — oferta Lucams con producción + cutoff", () => {
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

describe("quoteShipping — filtro por reglas de peso (SHIPPING_CARRIER_RULES)", () => {
  // El carrito de prueba son 2 items de 100 g c/u → paquete de 0.2 kg
  // (computePackedPackage REAL: cotización y guía usan el mismo modelo).
  it("carrier por debajo de su peso mínimo NO entra al set ofrecido y se loguea", async () => {
    carrierRules.mockResolvedValue({
      Coordinadora: { minWeightKg: 11, maxWeightKg: null, note: "No opera < 11 kg" },
    });
    const result = await quoteShipping({
      destinationCity: "Bogotá",
      destinationDepartment: "Cundinamarca",
      ctx,
    });
    expect(result.quotes.some((q) => q.carrier === "coordinadora")).toBe(false);
    // El envío propio sobrevive al filtro (el flujo lucams-only no se rompe).
    expect(result.quotes.some((q) => q.carrier === LUCAMS_CARRIER)).toBe(true);
    const { logger } = await import("@/lib/logger");
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "shipping.quote.carrier_filtered",
        carrierName: "Coordinadora",
        packageWeightKg: 0.2,
        violated: "minWeightKg",
      }),
    );
  });

  it("paquete dentro del rango → la oferta pasa intacta", async () => {
    carrierRules.mockResolvedValue({
      Coordinadora: { minWeightKg: 0.1, maxWeightKg: 5, note: null },
    });
    const result = await quoteShipping({
      destinationCity: "Bogotá",
      destinationDepartment: "Cundinamarca",
      ctx,
    });
    expect(result.quotes.some((q) => q.carrier === "coordinadora")).toBe(true);
  });

  it("carrier por encima de su peso máximo también se excluye", async () => {
    carrierRules.mockResolvedValue({
      Coordinadora: { minWeightKg: null, maxWeightKg: 0.1, note: null },
    });
    const result = await quoteShipping({
      destinationCity: "Bogotá",
      destinationDepartment: "Cundinamarca",
      ctx,
    });
    expect(result.quotes.some((q) => q.carrier === "coordinadora")).toBe(false);
    const { logger } = await import("@/lib/logger");
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "shipping.quote.carrier_filtered",
        violated: "maxWeightKg",
      }),
    );
  });

  it("sin reglas el comportamiento es el de siempre (todas las ofertas pasan)", async () => {
    const result = await quoteShipping({
      destinationCity: "Bogotá",
      destinationDepartment: "Cundinamarca",
      ctx,
    });
    expect(result.quotes.some((q) => q.carrier === "coordinadora")).toBe(true);
  });
});

describe("quoteShipping — valor declarado con packs multi-unidad (bug 2026-10-31)", () => {
  // Regresión del bug real de PRD: una variante con `quantity` N (abecedario
  // ×26, vocales ×5, separadores ×2-6) declaraba unitPrice × N a Aveonline —
  // un set de $39.900 se aseguraba en $1.037.400 y la valoración ~1 % del
  // carrier inflaba el flete ~$10.000 (Bogotá→Bogotá cotizaba ~$20-36k en vez
  // de ~$8-10k). El valor declarado POR unidad física debe ser
  // unitPrice × qty / inventoryUnits.
  it("declara el valor de venta de la línea, no el precio del pack × unidades físicas", async () => {
    const abecedarioCtx = {
      ...(ctx as object),
      cart: {
        ...(ctx as { cart: object }).cart,
        items: [
          {
            variantId: "v-personalizado",
            qty: 1,
            inventoryUnits: 26,
            unitPrice: 3_990_000, // centavos, por SET de 26 letras
            productSlug: "abecedario-completo",
          },
        ],
      },
    } as never;
    await quoteShipping({
      destinationCity: "Bogotá",
      destinationDepartment: "Cundinamarca",
      ctx: abecedarioCtx,
    });
    const [quoteInput] = shippingProvider.quote.mock.calls[0] as unknown as [
      { items: Array<{ qty: number; declaredValueCop: number }> },
    ];
    const items = quoteInput.items;
    expect(items).toHaveLength(1);
    expect(items[0].qty).toBe(26); // unidades físicas (peso/dims apilados)
    expect(items[0].declaredValueCop).toBe(Math.round(3_990_000 / 26));
    // El total asegurado es el valor de venta real (≤ redondeo por unidad).
    expect(Math.abs(items[0].declaredValueCop * items[0].qty - 3_990_000)).toBeLessThanOrEqual(13);
  });

  it("un pack sin multiplicador (inventoryUnits = qty) declara el unitPrice tal cual", async () => {
    await quoteShipping({
      destinationCity: "Bogotá",
      destinationDepartment: "Cundinamarca",
      ctx,
    });
    const [quoteInput] = shippingProvider.quote.mock.calls[0] as unknown as [
      { items: Array<{ qty: number; declaredValueCop: number }> },
    ];
    const items = quoteInput.items;
    expect(items[0].declaredValueCop).toBe(10_000);
    expect(items[1].declaredValueCop).toBe(20_000);
  });
});
