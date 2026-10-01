/*
 * Unit tests del blindaje de qty contra stock en el carrito (2026-09-29).
 *
 * Sin DB: prisma se mockea con estado en memoria (mismo patrón que los tests
 * de actions del admin). Semántica CLAMP: el tope efectivo es min(99, stock) —
 * sumar/pedir más allá del tope se TOPA al tope (como el clamp legacy a 99).
 * Solo se rechaza cuando NO hay margen: stock 0 ("está agotado por ahora") o
 * la línea ya está en el tope y se intenta sumar más ("Solo quedan N…").
 * Cubre:
 *  - addProductToCart: clamp al stock (qty pedida y acumulado), rechazo sin
 *    margen con copy que nombra producto y unidades.
 *  - updateCartItemQty: clamp al stock en el set absoluto; el tope 99 queda
 *    secundario; rechazo solo con la variante agotada.
 *  - El DTO expone `stock` por línea (badge "Solo quedan N" + cap del stepper).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

type CartItemFixture = {
  id: string;
  cartId: string;
  variantId: string;
  qty: number;
  unitPrice: number;
  designId: string | null;
  customDesign: unknown;
  templateId: string | null;
  metadata: unknown;
  design: null;
  variant: {
    id: string;
    name: string;
    sku: string;
    price: number | null;
    stock: number;
    attributes: unknown;
    product: {
      id: string;
      slug: string;
      name: string;
      basePrice: number;
      images: string[];
      isPersonalizable: boolean;
      isActive: boolean;
      deletedAt: null;
      personalizationKind: string;
      personalizationSchema: unknown;
    };
  };
};

const state = vi.hoisted(() => ({
  product: null as null | {
    id: string;
    basePrice: number;
    name: string;
    variants: Array<{ id: string; price: number | null; stock: number }>;
  },
  cart: null as null | {
    id: string;
    sessionId: string;
    customerId: string | null;
    currency: string;
    items: CartItemFixture[];
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    product: {
      findFirst: vi.fn(async () => state.product),
    },
    cart: {
      findFirst: vi.fn(async () => state.cart),
      findUnique: vi.fn(async () => null),
      update: vi.fn(async () => state.cart),
      create: vi.fn(async () => state.cart),
    },
    cartItem: {
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { qty?: number } }) => {
        const item = state.cart?.items.find((i) => i.id === where.id);
        if (item && typeof data.qty === "number") item.qty = data.qty;
        return item;
      }),
      create: vi.fn(
        async ({
          data,
        }: {
          data: { cartId: string; variantId: string; qty: number; unitPrice: number };
        }) => {
          const variant = state.product?.variants.find((v) => v.id === data.variantId);
          const item: CartItemFixture = {
            id: `ci_${state.cart!.items.length + 1}`,
            cartId: data.cartId,
            variantId: data.variantId,
            qty: data.qty,
            unitPrice: data.unitPrice,
            designId: null,
            customDesign: null,
            templateId: null,
            metadata: null,
            design: null,
            variant: makeVariant(variant?.id ?? data.variantId, variant?.stock ?? 0),
          };
          state.cart!.items.push(item);
          return item;
        },
      ),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        if (state.cart) state.cart.items = state.cart.items.filter((i) => i.id !== where.id);
      }),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
  },
}));

import { addProductToCart, CartError, updateCartItemQty } from "./service";

const PRODUCT = { id: "prod_1", slug: "iman-nevera", name: "Imán Nevera", basePrice: 12_000 };

function makeVariant(id: string, stock: number): CartItemFixture["variant"] {
  return {
    id,
    name: "Default",
    sku: "IMN-DEFAULT",
    price: null,
    stock,
    attributes: {},
    product: {
      id: PRODUCT.id,
      slug: PRODUCT.slug,
      name: PRODUCT.name,
      basePrice: PRODUCT.basePrice,
      images: [],
      isPersonalizable: false,
      isActive: true,
      deletedAt: null,
      personalizationKind: "NONE",
      personalizationSchema: null,
    },
  };
}

function seedProduct(stock: number) {
  state.product = {
    id: PRODUCT.id,
    basePrice: PRODUCT.basePrice,
    name: PRODUCT.name,
    variants: [{ id: "var_1", price: null, stock }],
  };
}

function seedCart(items: Array<{ qty: number; variantId?: string; stock?: number }>) {
  state.cart = {
    id: "cart_1",
    sessionId: "sess_1",
    customerId: null,
    currency: "COP",
    items: items.map((it, idx) => ({
      id: `ci_${idx + 1}`,
      cartId: "cart_1",
      variantId: it.variantId ?? "var_1",
      qty: it.qty,
      unitPrice: 12_000,
      designId: null,
      customDesign: null,
      templateId: null,
      metadata: null,
      design: null,
      variant: makeVariant(
        it.variantId ?? "var_1",
        it.stock ?? state.product?.variants[0]?.stock ?? 0,
      ),
    })),
  };
}

beforeEach(() => {
  state.product = null;
  state.cart = null;
});

describe("addProductToCart — validación de qty contra stock", () => {
  it("clampea la qty pedida al stock disponible (no rechaza mientras haya margen)", async () => {
    seedProduct(3);
    seedCart([]);
    const detail = await addProductToCart({
      sessionId: "sess_1",
      customerId: null,
      productSlug: "iman-nevera",
      qty: 4,
    });
    // 4 pedidas con stock 3 → entran 3 (clamp, como el legacy con 99).
    expect(detail.items[0].qty).toBe(3);
  });

  it("clampea el ACUMULADO con lo que ya está en el carrito", async () => {
    seedProduct(3);
    seedCart([{ qty: 2 }]);
    const detail = await addProductToCart({
      sessionId: "sess_1",
      customerId: null,
      productSlug: "iman-nevera",
      qty: 2,
    });
    // 2 en carrito + 2 pedidas con stock 3 → queda en 3 (tope).
    expect(detail.items[0].qty).toBe(3);
  });

  it("rechaza cuando la línea YA está en el tope de stock y se intenta sumar más", async () => {
    seedProduct(3);
    seedCart([{ qty: 3 }]);
    await expect(
      addProductToCart({
        sessionId: "sess_1",
        customerId: null,
        productSlug: "iman-nevera",
        qty: 1,
      }),
    ).rejects.toMatchObject({
      name: "CartError",
      code: "STOCK_UNAVAILABLE",
      detail: "Solo quedan 3 unidades de «Imán Nevera» y ya tienes 3 en tu carrito.",
    });
    // No tocó la línea existente.
    expect(state.cart!.items[0].qty).toBe(3);
  });

  it("acepta justo hasta el stock disponible (2 en carrito + 1 nueva con stock 3)", async () => {
    seedProduct(3);
    seedCart([{ qty: 2 }]);
    const detail = await addProductToCart({
      sessionId: "sess_1",
      customerId: null,
      productSlug: "iman-nevera",
      qty: 1,
    });
    expect(detail.items[0].qty).toBe(3);
  });

  it("stock agotado (0): copy de agotado con nombre, no el genérico", async () => {
    seedProduct(0);
    seedCart([]);
    await expect(
      addProductToCart({
        sessionId: "sess_1",
        customerId: null,
        productSlug: "iman-nevera",
        qty: 1,
      }),
    ).rejects.toMatchObject({
      code: "STOCK_UNAVAILABLE",
      detail: "«Imán Nevera» está agotado por ahora.",
    });
  });

  it("el tope 99 queda como límite secundario: stock alto no estorba", async () => {
    seedProduct(150);
    seedCart([]);
    const detail = await addProductToCart({
      sessionId: "sess_1",
      customerId: null,
      productSlug: "iman-nevera",
      qty: 99,
    });
    expect(detail.items[0].qty).toBe(99);
    expect(detail.items[0].stock).toBe(150);
  });

  it("clamp legacy: con stock alto, sumar más allá de 99 se topa en 99", async () => {
    seedProduct(150);
    seedCart([{ qty: 90 }]);
    const detail = await addProductToCart({
      sessionId: "sess_1",
      customerId: null,
      productSlug: "iman-nevera",
      qty: 50,
    });
    // 90 + 50 = 140 → clamp a 99 (min(99, stock=150)).
    expect(detail.items[0].qty).toBe(99);
  });

  it("qty > 99 sigue siendo QTY_INVALID aunque haya stock", async () => {
    seedProduct(200);
    seedCart([]);
    await expect(
      addProductToCart({
        sessionId: "sess_1",
        customerId: null,
        productSlug: "iman-nevera",
        qty: 100,
      }),
    ).rejects.toMatchObject({ code: "QTY_INVALID" });
  });
});

describe("updateCartItemQty — validación de qty contra stock", () => {
  it("clampea al stock disponible cuando se pide de más", async () => {
    seedCart([{ qty: 1, stock: 2 }]);
    const detail = await updateCartItemQty("sess_1", "ci_1", 3);
    expect(detail.items[0].qty).toBe(2);
  });

  it("acepta qty == stock", async () => {
    seedCart([{ qty: 1, stock: 4 }]);
    const detail = await updateCartItemQty("sess_1", "ci_1", 4);
    expect(detail.items[0].qty).toBe(4);
  });

  it("tope 99 secundario: con stock 150, qty 100 es QTY_INVALID (no stock)", async () => {
    seedCart([{ qty: 1, stock: 150 }]);
    await expect(updateCartItemQty("sess_1", "ci_1", 100)).rejects.toMatchObject({
      code: "QTY_INVALID",
    });
  });

  it("qty 0 sigue quitando la línea (sin validar stock)", async () => {
    seedCart([{ qty: 1, stock: 0 }]);
    const detail = await updateCartItemQty("sess_1", "ci_1", 0);
    expect(detail.items).toHaveLength(0);
  });

  it("variante agotada con la línea en vuelo: rechaza con copy customer-safe (sin internals)", async () => {
    seedCart([{ qty: 1, stock: 0 }]);
    const err = await updateCartItemQty("sess_1", "ci_1", 2).catch((e) => e);
    expect(err).toBeInstanceOf(CartError);
    expect(err).toMatchObject({
      code: "STOCK_UNAVAILABLE",
      detail: "«Imán Nevera» está agotado por ahora.",
    });
    expect(err.detail).not.toContain("var_1");
  });
});
