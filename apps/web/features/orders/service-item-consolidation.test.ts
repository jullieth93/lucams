/*
 * Unit tests de la consolidación de líneas idénticas en createOrderFromCart
 * (Paquete H, 2026-10-02).
 *
 * Defensa en la puerta del pedido: aunque un carrito llegara con dos líneas
 * que son la MISMA compra (misma variante + mismo contenido de diseño, o sin
 * personalización), la Order nace con UNA línea de qty sumada — nunca dos
 * OrderItems visualmente idénticos (la causa en datos del desglose duplicado
 * en emails, reporte STG). Diseños realmente distintos siguen separados.
 *
 * Sin DB: mismo patrón de mocks que service-reconcile.test.ts.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { tx, prisma } = vi.hoisted(() => {
  const tx = {
    cart: { findFirst: vi.fn() },
    order: {
      findFirst: vi.fn(async () => null),
      updateMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    orderItem: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    design: { updateMany: vi.fn(async () => ({ count: 0 })) },
    productVariant: {
      findUnique: vi.fn(async () => ({
        id: "v1",
        stock: 500,
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
  CouponInvalidatedError: class CouponInvalidatedError extends Error {},
}));
vi.mock("@/features/orders/emails", () => ({ sendOrderRefunded: vi.fn() }));

import { createOrderFromCart } from "./service";

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
    qty: 1,
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

function diseno(id: string, canvasData: unknown) {
  return {
    id,
    productId: "prod_1",
    canvasData,
    metadata: null,
    previewUrl: `https://cdn/${id}.png`,
    productionUrl: `https://cdn/${id}-prod.png`,
    productionUrls: null,
  };
}

function seedCart(items: unknown[]) {
  tx.cart.findFirst.mockResolvedValue({
    id: "cart_1",
    sessionId: "sess_1",
    currency: "COP",
    items,
  });
}

function createdItems(): Array<Record<string, unknown>> {
  const call = tx.order.create.mock.calls[0]?.[0] as {
    data: { items: { create: Array<Record<string, unknown>> } };
  };
  return call.data.items.create;
}

beforeEach(() => {
  vi.clearAllMocks();
  prisma.$transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx));
  tx.order.findFirst.mockResolvedValue(null);
  tx.order.create.mockResolvedValue({
    id: "ord_1",
    number: "LCM-2026-0001",
    total: 0,
    subtotal: 0,
    shipping: 5_000,
    discount: 0,
    paymentMethod: "WOMPI",
  });
});

describe("createOrderFromCart — consolidación de líneas idénticas (Paquete H)", () => {
  it("dos líneas con Designs distintos pero idénticos → UN OrderItem con qty sumada", async () => {
    seedCart([
      cartItem({
        id: "ci_1",
        designId: "d1",
        design: diseno("d1", { slots: [{ assetId: "A" }] }),
        qty: 1,
      }),
      cartItem({
        id: "ci_2",
        designId: "d2",
        design: diseno("d2", { slots: [{ assetId: "A" }] }),
        qty: 2,
      }),
    ]);

    await createOrderFromCart(INPUT);

    const items = createdItems();
    expect(items).toHaveLength(1);
    expect(items[0].qty).toBe(3);
    // Sobrevive la primera línea (la más vieja): su diseño y su preview quedan
    // en el snapshot.
    expect(items[0].designId).toBe("d1");
    expect(items[0].designAssetUrl).toBe("https://cdn/d1.png");
  });

  it("diseños realmente distintos (misma variante) → dos OrderItems separados", async () => {
    seedCart([
      cartItem({ id: "ci_1", designId: "d1", design: diseno("d1", { slots: [{ assetId: "A" }] }) }),
      cartItem({ id: "ci_2", designId: "d2", design: diseno("d2", { slots: [{ assetId: "B" }] }) }),
    ]);

    await createOrderFromCart(INPUT);

    const items = createdItems();
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.designId)).toEqual(["d1", "d2"]);
  });

  it("líneas sin personalización de la misma variante → UN OrderItem con qty sumada", async () => {
    seedCart([cartItem({ id: "ci_1", qty: 2 }), cartItem({ id: "ci_2", qty: 3 })]);

    await createOrderFromCart(INPUT);

    const items = createdItems();
    expect(items).toHaveLength(1);
    expect(items[0].qty).toBe(5);
  });

  it("mismo contenido en OTRA variante → no consolida", async () => {
    const otraVariante = {
      id: "v2",
      sku: "IMN-SET12",
      name: "Set 12",
      isActive: true,
      deletedAt: null,
      product: { isActive: true, deletedAt: null, name: "Imán Nevera" },
    };
    seedCart([
      cartItem({ id: "ci_1", designId: "d1", design: diseno("d1", { color: "rosa" }) }),
      cartItem({
        id: "ci_2",
        variantId: "v2",
        designId: "d2",
        design: diseno("d2", { color: "rosa" }),
        variant: otraVariante,
      }),
    ]);

    await createOrderFromCart(INPUT);

    expect(createdItems()).toHaveLength(2);
  });

  it("los Designs absorbidos también se marcan USED_IN_ORDER", async () => {
    seedCart([
      cartItem({ id: "ci_1", designId: "d1", design: diseno("d1", { slots: [{ assetId: "A" }] }) }),
      cartItem({ id: "ci_2", designId: "d2", design: diseno("d2", { slots: [{ assetId: "A" }] }) }),
    ]);

    await createOrderFromCart(INPUT);

    expect(tx.design.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ["d1", "d2"] } } }),
    );
  });
});
