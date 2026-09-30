/*
 * Unit tests de la carrera TOCTOU de reconciliación en createOrderFromCart
 * (2026-09-29) + nombres en OrderUnavailableItemsError.
 *
 * Sin DB: prisma.$transaction invoca el callback con un tx stub en memoria
 * (mismo patrón de mocks que los tests de actions del admin). El webhook de
 * Wompi commiteando PAID entre la lectura y la escritura se simula con
 * `order.updateMany` (gateado por status) devolviendo count=0.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { tx, prisma } = vi.hoisted(() => {
  const tx = {
    cart: { findFirst: vi.fn() },
    order: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    orderItem: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    design: { updateMany: vi.fn(async () => ({ count: 0 })) },
    productVariant: {
      findUnique: vi.fn(async () => ({
        id: "v1",
        stock: 100,
        name: "Default",
        sku: "IMN-DEFAULT",
        product: { name: "Imán Nevera" },
      })),
    },
    $executeRaw: vi.fn(async () => 0),
  };
  const prisma = {
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    order: { findFirst: vi.fn(async () => null), update: vi.fn() },
  };
  return { tx, prisma };
});

vi.mock("@/lib/db", () => ({
  prisma,
  Prisma: {
    JsonNull: null,
    PrismaClientKnownRequestError: class extends Error {
      constructor(
        message: string,
        public code: string,
        public meta?: unknown,
      ) {
        super(message);
      }
    },
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/stage-guard", () => ({ assertTransactionalAllowed: vi.fn() }));
vi.mock("@/lib/catalog", () => ({ invalidateCatalogListings: vi.fn() }));
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
vi.mock("@/features/orders/emails", () => ({ sendOrderRefunded: vi.fn() }));

import { createOrderFromCart } from "./service";
import { OrderAlreadyPaidError, OrderUnavailableItemsError } from "./errors";

const INPUT = {
  cartId: "cart_1",
  customerId: null,
  shipping: {
    fullName: "Ana Prueba",
    email: "ana@example.co",
    phone: "3001234567",
    city: "Bogotá",
    department: "Cundinamarca",
    addressLine1: "Calle 1 # 2-3",
  },
  shippingSelection: {
    carrier: "coordinadora",
    carrierName: "Coordinadora",
    fleteCop: 5_000,
    deliveryDays: 2,
    contraentrega: false,
    quoteId: "q1",
  },
  billing: { wantsInvoice: false },
  paymentMethod: "WOMPI" as const,
};

function cartItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "ci_1",
    cartId: "cart_1",
    variantId: "v1",
    qty: 2,
    unitPrice: 10_000,
    designId: null,
    customDesign: null,
    templateId: null,
    metadata: null,
    design: null,
    variant: {
      id: "v1",
      sku: "IMN-DEFAULT",
      name: "Default",
      isActive: true,
      deletedAt: null,
      product: { isActive: true, deletedAt: null, name: "Imán Nevera" },
    },
    ...overrides,
  };
}

function seedCart(items = [cartItem()]) {
  tx.cart.findFirst.mockResolvedValue({
    id: "cart_1",
    sessionId: "sess_1",
    currency: "COP",
    items,
  });
}

// Orden PENDING idéntica al cart/INPUT (subtotal 20000 + envío 5000 = 25000).
function existingIdentical() {
  return {
    id: "ord_1",
    number: "LCM-2026-0001",
    total: 25_000,
    paymentMethod: "WOMPI",
    email: "ana@example.co",
    shippingCarrier: "coordinadora",
    couponId: null,
    items: [{ variantId: "v1", qty: 2, designId: null, unitPrice: 10_000 }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prisma.$transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx));
});

describe("createOrderFromCart — gate TOCTOU de reconciliación", () => {
  it("reconciliación: el gate devuelve count=0 → OrderAlreadyPaidError, sin borrar ni pisar nada", async () => {
    seedCart();
    // El cliente cambió algo (total viejo distinto) → camino de reconciliación.
    tx.order.findFirst.mockResolvedValue({ ...existingIdentical(), total: 24_000 });
    // El webhook commiteó PAID entre la lectura y esta escritura.
    tx.order.updateMany.mockResolvedValue({ count: 0 });

    await expect(createOrderFromCart(INPUT)).rejects.toMatchObject({
      name: "OrderAlreadyPaidError",
      orderId: "ord_1",
      orderNumber: "LCM-2026-0001",
    });
    // El gate va PRIMERO y gateado por estado…
    expect(tx.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "ord_1", status: "PENDING_PAYMENT" } }),
    );
    // …y con count=0 NO se toca la orden pagada.
    expect(tx.orderItem.deleteMany).not.toHaveBeenCalled();
    expect(tx.order.update).not.toHaveBeenCalled();
    expect(tx.order.create).not.toHaveBeenCalled();
  });

  it("refresh idempotente (sin cambios): el gate también protege la rotación del token", async () => {
    seedCart();
    tx.order.findFirst.mockResolvedValue(existingIdentical());
    tx.order.updateMany.mockResolvedValue({ count: 0 });

    await expect(createOrderFromCart(INPUT)).rejects.toBeInstanceOf(OrderAlreadyPaidError);
    expect(tx.order.update).not.toHaveBeenCalled();
  });

  it("gate con count=1: procede el swap de items sobre la MISMA orden", async () => {
    seedCart();
    tx.order.findFirst.mockResolvedValue({ ...existingIdentical(), total: 24_000 });
    tx.order.updateMany.mockResolvedValue({ count: 1 });
    tx.order.update.mockResolvedValue({
      id: "ord_1",
      number: "LCM-2026-0001",
      total: 25_000,
      subtotal: 20_000,
      shipping: 5_000,
      discount: 0,
      paymentMethod: "WOMPI",
    });

    const result = await createOrderFromCart(INPUT);
    expect(result.id).toBe("ord_1");
    expect(result.number).toBe("LCM-2026-0001");
    expect(result.total).toBe(25_000);
    expect(result.publicAccessToken).toMatch(/^[0-9a-f]{32}$/);
    expect(tx.orderItem.deleteMany).toHaveBeenCalledWith({ where: { orderId: "ord_1" } });
    // Los scalars ya se escribieron en el gate; el update solo recrea los items.
    expect(tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ord_1" },
        data: expect.objectContaining({
          items: expect.objectContaining({ create: expect.any(Array) }),
        }),
      }),
    );
  });
});

describe("createOrderFromCart — OrderUnavailableItemsError nombra el producto", () => {
  it("item archivado en carrera: el mensaje nombra el producto retirado", async () => {
    seedCart([
      cartItem({
        variant: {
          id: "v1",
          sku: "IMN-DEFAULT",
          name: "Default",
          isActive: false, // admin la despublicó entre el carrito y el pago
          deletedAt: null,
          product: { isActive: true, deletedAt: null, name: "Imán Nevera" },
        },
      }),
    ]);
    tx.order.findFirst.mockResolvedValue(null);

    await expect(createOrderFromCart(INPUT)).rejects.toMatchObject({
      name: "OrderUnavailableItemsError",
      message: "«Imán Nevera» ya no está disponible. Revisa tu carrito y confirma de nuevo.",
    });
    expect(tx.order.create).not.toHaveBeenCalled();
  });

  it("variante real (no default): el nombre incluye la variante", async () => {
    seedCart([
      cartItem({
        variant: {
          id: "v2",
          sku: "IMN-SET12",
          name: "Set 12 unidades",
          isActive: true,
          deletedAt: null,
          product: { isActive: false, deletedAt: null, name: "Imán Nevera" },
        },
      }),
    ]);
    tx.order.findFirst.mockResolvedValue(null);

    const err = await createOrderFromCart(INPUT).catch((e) => e);
    expect(err).toBeInstanceOf(OrderUnavailableItemsError);
    expect(err.message).toContain("«Imán Nevera (Set 12 unidades)»");
  });
});
