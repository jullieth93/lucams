/*
 * Unit tests de getGuestLoyaltyIncentive (2026-10-26 — decisión owner):
 * incentivo "crea tu cuenta y gana puntos" para INVITADOS en /checkout/datos
 * y en el resumen del paso de pago.
 *
 *  - Solo invitados: con sesión el cliente ya ve earnPreviewPoints
 *    (getCheckoutLoyalty) y el incentivo sería ruido → null.
 *  - null si el programa está apagado, en modo catálogo o si la compra no
 *    alcanza ni 1 punto.
 *  - Puntos = floor(totalEstimado / earnCopPerPoint) sobre productos tras
 *    cupón + envío ya seleccionado (en datos no hay envío aún).
 *
 * Sin DB: todo lo externo mockeado (patrón de service-finalize.test.ts). Las
 * funciones puras de loyalty (computeEarnedPoints / pointValueCents) son las
 * REALES — el cálculo es el contrato bajo test.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma, checkoutState, catalogMode, loyaltySettings, referralSettings } = vi.hoisted(
  () => ({
    prisma: {
      order: { findFirst: vi.fn(async () => null), updateMany: vi.fn(), update: vi.fn() },
      productVariant: { findMany: vi.fn(async () => []) },
      address: { findFirst: vi.fn(async () => null) },
      customer: { findFirst: vi.fn(async () => null), updateMany: vi.fn() },
    },
    checkoutState: { current: null as null | Record<string, unknown> },
    catalogMode: { current: false },
    loyaltySettings: {
      current: {
        enabled: true,
        earnCopPerPoint: 1_000,
        redeemPointsPer1000: 100,
        redeemMinPoints: 100,
        redeemMaxPercent: 50,
        expirationEnabled: false,
        expirationDays: 365,
      },
    },
    referralSettings: {
      current: { enabled: true, rewardPercent: 10, rewardDays: 90 },
    },
  }),
);

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
vi.mock("@/lib/store-mode", () => ({ isCatalogMode: () => catalogMode.current }));
vi.mock("@/features/orders/service", () => ({ createOrderFromCart: vi.fn() }));
vi.mock("@/features/orders/payment-reference", () => ({ resolveWompiPaymentReference: vi.fn() }));
vi.mock("@/features/orders/saga", () => ({ processPaidOrder: vi.fn() }));
vi.mock("@/features/orders/stock", () => ({ assertStockAvailable: vi.fn(async () => {}) }));
vi.mock("@/features/orders/stock-alerts", () => ({ notifyStockSaleLost: vi.fn(async () => {}) }));
vi.mock("@/features/coupons/redemption", () => ({
  // Sin cupón válido en estos tests: merchandiseAfterCouponCents = subtotal.
  priceCouponForCart: vi.fn(async () => ({ ok: false, message: "no aplica" })),
  CouponInvalidatedError: class CouponInvalidatedError extends Error {},
}));
vi.mock("@/features/loyalty/settings", () => ({
  getLoyaltySettings: vi.fn(async () => loyaltySettings.current),
  getReferralSettings: vi.fn(async () => referralSettings.current),
}));
vi.mock("@/features/payments/provider", () => ({ getPaymentProvider: vi.fn() }));
vi.mock("@/features/shipping/provider", () => ({ getShippingProvider: vi.fn() }));
vi.mock("@/features/shipping/settings", () => ({
  getDisabledCarriersNormalized: vi.fn(async () => []),
  getLucamsShippingSettings: vi.fn(async () => ({
    enabled: false,
    priceCop: 1_000_000,
    cutoffHour: 12,
    zones: {},
  })),
  normalizeCarrierKey: (s: string) => s,
}));
vi.mock("@/features/shipping/lucams-shipping", () => ({
  buildLucamsOffer: vi.fn(async () => null),
  LUCAMS_CARRIER: "lucams",
}));
vi.mock("@/lib/lucams-zones", () => ({ getZone: vi.fn(() => undefined) }));
vi.mock("@/features/products/shipping-schemas", () => ({
  getEffectiveShippingDims: vi.fn(),
  parsePhysicalSpecs: vi.fn(),
  MissingShippingDimsError: class MissingShippingDimsError extends Error {},
}));
vi.mock("@/lib/checkout-session", () => ({
  getCheckoutState: vi.fn(async () => checkoutState.current),
  setCheckoutState: vi.fn(async () => {}),
  clearCheckoutState: vi.fn(async () => {}),
  sealShippingOffersPayload: vi.fn(() => "token"),
  openShippingOffersPayload: vi.fn(() => null),
}));
vi.mock("@/features/checkout/cod-risk", () => ({ assessCodRisk: vi.fn() }));
vi.mock("@/features/cart/service", () => ({ getCartDetail: vi.fn(async () => null) }));

import { getGuestLoyaltyIncentive, type CheckoutContext } from "./service";

function guestCtx(over?: {
  subtotal?: number;
  customerId?: string | null;
  shippingFleteCop?: number;
}): CheckoutContext {
  return {
    cart: {
      cartId: "cart_1",
      sessionId: "sess_1",
      itemCount: 1,
      subtotal: over?.subtotal ?? 5_990_000, // $59.900 COP
      items: [],
    } as unknown as CheckoutContext["cart"],
    customerId: over?.customerId ?? null,
    customerEmail: null,
    state: {
      step: 1,
      updatedAt: Date.now(),
      ...(over?.shippingFleteCop != null
        ? {
            shippingSelection: {
              carrier: "envia",
              carrierName: "Envía",
              fleteCop: over.shippingFleteCop,
              deliveryDays: 3,
              contraentrega: false,
              quoteId: "q1",
            },
          }
        : {}),
    } as CheckoutContext["state"],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  catalogMode.current = false;
  loyaltySettings.current.enabled = true;
  loyaltySettings.current.earnCopPerPoint = 1_000;
  referralSettings.current.enabled = true;
});

describe("getGuestLoyaltyIncentive", () => {
  it("invitado + programa activo: puntos = floor(total/1000) con su equivalencia en pesos", async () => {
    // $59.900 de productos (sin envío aún, paso de datos) → 59 puntos;
    // 100 pts = $1.000 → 1 punto = $10 → 59 pts = $590.
    const incentive = await getGuestLoyaltyIncentive(guestCtx());
    expect(incentive).toEqual({
      earnPreviewPoints: 59,
      valueCents: 59_000,
      referralsEnabled: true,
    });
  });

  it("incluye el envío ya seleccionado (paso de pago) en el estimado", async () => {
    // $59.900 + $15.000 de envío = $74.900 → 74 puntos.
    const incentive = await getGuestLoyaltyIncentive(guestCtx({ shippingFleteCop: 1_500_000 }));
    expect(incentive?.earnPreviewPoints).toBe(74);
  });

  it("microcopy de referidos solo cuando el programa Invita y gana está activo", async () => {
    referralSettings.current.enabled = false;
    const incentive = await getGuestLoyaltyIncentive(guestCtx());
    expect(incentive?.referralsEnabled).toBe(false);
  });

  it("cliente CON sesión → null (él ya ve el preview normal de puntos)", async () => {
    const incentive = await getGuestLoyaltyIncentive(guestCtx({ customerId: "cust_1" }));
    expect(incentive).toBeNull();
  });

  it("programa de puntos apagado → null", async () => {
    loyaltySettings.current.enabled = false;
    const incentive = await getGuestLoyaltyIncentive(guestCtx());
    expect(incentive).toBeNull();
  });

  it("compra que no alcanza ni 1 punto → null (nada que prometer)", async () => {
    const incentive = await getGuestLoyaltyIncentive(guestCtx({ subtotal: 99_900 })); // $999
    expect(incentive).toBeNull();
  });

  it("modo catálogo → null (no hay compra en línea que acredite puntos)", async () => {
    catalogMode.current = true;
    const incentive = await getGuestLoyaltyIncentive(guestCtx());
    expect(incentive).toBeNull();
  });
});
