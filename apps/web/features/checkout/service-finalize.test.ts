/*
 * Unit tests de finalizeCheckout (2026-09-29):
 *  - OrderAlreadyPaidError (carrera TOCTOU de reconciliación) se traduce a
 *    CheckoutError ORDER_ALREADY_PAID con redirect seguro a la confirmación
 *    (/checkout/gracias?id=<txId> verifica la tx contra Wompi y sana la
 *    orden) — nunca crea otra orden ni cobra dos veces.
 *  - assertCheckoutAvailability propaga el mensaje que NOMBRA el producto
 *    agotado (fallback genérico si no hay nombre).
 *
 * Sin DB ni Supabase: todo lo externo mockeado (patrón de los tests de
 * actions del admin). Los errores tipados de orders son los REALES (los
 * instanceof son el contrato bajo test).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma, createOrderFromCart, assertStockAvailable, checkoutState } = vi.hoisted(() => ({
  prisma: {
    order: {
      findFirst: vi.fn(
        async (): Promise<{ status: string; wompiTransactionId: string | null } | null> => null,
      ),
      updateMany: vi.fn(async () => ({ count: 0 })),
      update: vi.fn(),
    },
    productVariant: { findMany: vi.fn(async () => []) },
    customer: { findFirst: vi.fn(async () => null), updateMany: vi.fn(async () => ({ count: 0 })) },
  },
  createOrderFromCart: vi.fn(),
  assertStockAvailable: vi.fn(async () => {}),
  checkoutState: { current: null as null | Record<string, unknown> },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ prisma }));
vi.mock("@/lib/cart-session", () => ({ peekCartSession: vi.fn(async () => "sess_1") }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => null) }));
vi.mock("@/lib/cms", () => {
  return { getSettingValue: vi.fn(async (_k: string, fallback: string) => fallback) };
});
vi.mock("@/lib/stage-guard", () => ({ assertTransactionalAllowed: vi.fn() }));
vi.mock("@/features/orders/service", () => ({ createOrderFromCart }));
vi.mock("@/features/orders/saga", () => ({ processPaidOrder: vi.fn() }));
vi.mock("@/features/orders/stock", () => ({ assertStockAvailable }));
vi.mock("@/features/coupons/redemption", () => ({
  priceCouponForCart: vi.fn(),
  CouponInvalidatedError: class CouponInvalidatedError extends Error {
    constructor(
      message: string,
      public reason: string,
    ) {
      super(message);
    }
  },
}));
vi.mock("@/features/payments/provider", () => ({ getPaymentProvider: vi.fn() }));
vi.mock("@/features/shipping/provider", () => ({ getShippingProvider: vi.fn() }));
vi.mock("@/features/shipping/settings", () => ({
  getDisabledCarriersNormalized: vi.fn(async () => []),
  normalizeCarrierKey: (s: string) => s,
}));
vi.mock("@/features/shipping/lucams-shipping", () => ({
  buildLucamsOffer: vi.fn(async () => null),
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
vi.mock("@/features/cart/service", () => ({
  getCartDetail: vi.fn(async () => cartFixture),
}));

import {
  assertCheckoutAvailability,
  CheckoutError,
  destinationKeyOf,
  finalizeCheckout,
  fingerprintCartItems,
} from "./service";
import { InsufficientStockError, OrderAlreadyPaidError } from "@/features/orders/errors";
import { getPaymentProvider } from "@/features/payments/provider";

const CART_ITEMS = [{ variantId: "v1", qty: 2, unitPrice: 10_000, productName: "Imán Nevera" }];

const cartFixture = {
  cartId: "cart_1",
  sessionId: "sess_1",
  customerId: null as string | null,
  itemCount: 2,
  subtotal: 20_000,
  items: CART_ITEMS,
};

const ADDRESS = {
  kind: "urban",
  city: "Bogotá",
  department: "Cundinamarca",
  deptCode: "11",
  cityCode: "11001",
  viaType: "Calle",
  viaNumber: "1",
  cruceNumber: "2",
};

const SELECTION = {
  carrier: "coordinadora",
  carrierName: "Coordinadora",
  fleteCop: 5_000,
  deliveryDays: 2,
  contraentrega: false,
  quoteId: "q1",
};

function seedState() {
  checkoutState.current = {
    step: 3,
    updatedAt: Date.now(),
    contact: { fullName: "Ana Prueba", email: "ana@example.co", phone: "3001234567" },
    address: ADDRESS,
    shippingSelection: SELECTION,
    paymentMethod: "WOMPI",
    // El sello anti-manipulación de flete debe matchear el carrito y el destino.
    shippingOffers: {
      offers: [SELECTION],
      cartHash: fingerprintCartItems(CART_ITEMS),
      destKey: destinationKeyOf(ADDRESS as never),
      quotedAt: Date.now(),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  cartFixture.customerId = null;
  seedState();
});

describe("finalizeCheckout — OrderAlreadyPaidError (carrera TOCTOU)", () => {
  it("con txId Wompi: CheckoutError ORDER_ALREADY_PAID con redirect a /checkout/gracias?id=<tx>", async () => {
    createOrderFromCart.mockRejectedValue(new OrderAlreadyPaidError("ord_1", "LCM-2026-0001"));
    prisma.order.findFirst.mockResolvedValue({ status: "PAID", wompiTransactionId: "tx-123" });

    const err = await finalizeCheckout({ redirectUrl: "https://x.co/checkout/gracias" }).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(CheckoutError);
    expect(err.code).toBe("ORDER_ALREADY_PAID");
    expect(err.redirectTo).toBe("/checkout/gracias?id=tx-123");
    // Mensaje customer-safe, sin internals.
    expect(err.message).not.toContain("ord_1");
  });

  it("sin txId (carrera COD doble-submit): cae a los pedidos de la cuenta si está logueado", async () => {
    cartFixture.customerId = "cust_1";
    createOrderFromCart.mockRejectedValue(new OrderAlreadyPaidError("ord_1", "LCM-2026-0001"));
    prisma.order.findFirst.mockResolvedValue({ status: "FULFILLING", wompiTransactionId: null });

    const err = await finalizeCheckout({ redirectUrl: "https://x.co/checkout/gracias" }).catch(
      (e) => e,
    );
    expect(err.code).toBe("ORDER_ALREADY_PAID");
    expect(err.redirectTo).toBe("/mi-cuenta/pedidos");
  });

  it("sin txId y guest: fallback al home (nunca crea otra orden)", async () => {
    createOrderFromCart.mockRejectedValue(new OrderAlreadyPaidError("ord_1", "LCM-2026-0001"));
    prisma.order.findFirst.mockResolvedValue({ status: "FULFILLING", wompiTransactionId: null });

    const err = await finalizeCheckout({ redirectUrl: "https://x.co/checkout/gracias" }).catch(
      (e) => e,
    );
    expect(err.code).toBe("ORDER_ALREADY_PAID");
    expect(err.redirectTo).toBe("/");
  });
});

describe("finalizeCheckout — persiste el documento DIAN en el perfil (T7)", () => {
  function mockWompiOk() {
    createOrderFromCart.mockResolvedValue({
      id: "ord_1",
      number: "LCM-2026-0001",
      total: 25_000,
      subtotal: 20_000,
      shipping: 5_000,
      discount: 0,
      publicAccessToken: "tok",
      paymentMethod: "WOMPI",
    });
    vi.mocked(getPaymentProvider).mockReturnValue({
      createCheckout: vi.fn(async () => ({ checkoutUrl: "https://wompi.example/x" })),
    } as never);
  }

  it("customer logueado con documento en el contacto: lo guarda SOLO si el perfil está vacío", async () => {
    cartFixture.customerId = "cust_1";
    checkoutState.current!.contact = {
      fullName: "Ana Prueba",
      email: "ana@example.co",
      phone: "3001234567",
      documentType: "CC",
      documentNumber: "1234567890",
    };
    mockWompiOk();
    prisma.customer.updateMany.mockResolvedValue({ count: 1 });

    const res = await finalizeCheckout({ redirectUrl: "https://x.co/gracias" });
    expect(res.checkoutUrl).toBe("https://wompi.example/x");
    // updateMany condicional atómico: where documentType/documentNumber null → jamás pisa.
    expect(prisma.customer.updateMany).toHaveBeenCalledWith({
      where: { id: "cust_1", documentType: null, documentNumber: null },
      data: { documentType: "CC", documentNumber: "1234567890", updatedBy: "cust_1" },
    });
  });

  it("sin documento en el contacto: cae al de facturación (wantsInvoice)", async () => {
    cartFixture.customerId = "cust_1";
    checkoutState.current!.billing = {
      wantsInvoice: true,
      documentType: "NIT",
      documentNumber: "900123456",
      name: "Empresa SAS",
    };
    mockWompiOk();

    await finalizeCheckout({ redirectUrl: "https://x.co/gracias" });
    expect(prisma.customer.updateMany).toHaveBeenCalledWith({
      where: { id: "cust_1", documentType: null, documentNumber: null },
      data: { documentType: "NIT", documentNumber: "900123456", updatedBy: "cust_1" },
    });
  });

  it("guest o checkout sin documento: NO escribe en el perfil", async () => {
    mockWompiOk();
    await finalizeCheckout({ redirectUrl: "https://x.co/gracias" });
    expect(prisma.customer.updateMany).not.toHaveBeenCalled();
  });
});

describe("assertCheckoutAvailability — mensaje que nombra el producto", () => {
  it("propaga el customerMessage del InsufficientStockError", async () => {
    assertStockAvailable.mockRejectedValueOnce(
      new InsufficientStockError("v1", 5, 3, "Imán Nevera"),
    );
    const err = await assertCheckoutAvailability({
      cart: cartFixture,
      customerId: null,
      state: {},
    } as never).catch((e) => e);
    expect(err).toBeInstanceOf(CheckoutError);
    expect(err.code).toBe("STOCK_UNAVAILABLE");
    expect(err.message).toBe(
      "Solo quedan 3 unidades de «Imán Nevera». Ajusta la cantidad en tu carrito.",
    );
  });

  it("sin nombre en el error: fallback genérico customer-safe", async () => {
    assertStockAvailable.mockRejectedValueOnce(new InsufficientStockError("v1", 5));
    const err = await assertCheckoutAvailability({
      cart: cartFixture,
      customerId: null,
      state: {},
    } as never).catch((e) => e);
    expect(err.code).toBe("STOCK_UNAVAILABLE");
    expect(err.message).toBe(
      "Uno de los productos ya no está disponible. Por favor revisa tu carrito.",
    );
    expect(err.message).not.toContain("v1");
  });
});
