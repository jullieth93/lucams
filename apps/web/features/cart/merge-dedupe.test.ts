/*
 * Unit tests del dedupe POR CONTENIDO en los merges de carrito (Paquete H,
 * 2026-10-02): mergeAnonCartIntoCustomer (login) y mergeCartsAdopt (recuperación
 * de carrito abandonado).
 *
 * Antes ambos folds agrupaban solo por (variantId, designId): dos Designs
 * distintos pero IDÉNTICOS (cada pasada por el Estudio crea uno nuevo)
 * sobrevivían como dos líneas visualmente iguales que llegaban hasta el pedido
 * y los emails (reporte STG del desglose duplicado). Ahora el dup se decide con
 * sameLineContent: misma variante + misma identidad de contenido → sumar qty.
 *
 * Sin DB: prisma mockeado con estado en memoria (mismo patrón que
 * service-stock.test.ts); la $transaction corre el callback con el mismo mock.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

type Linea = {
  id: string;
  cartId: string;
  variantId: string;
  qty: number;
  unitPrice: number;
  designId: string | null;
  customDesign: unknown;
  design: {
    id: string;
    productId: string;
    canvasData: unknown;
    metadata: unknown;
    previewUrl: string | null;
    status: string;
  } | null;
};

type CartFixture = {
  id: string;
  sessionId: string;
  customerId: string | null;
  deletedAt: null;
  items: Linea[];
};

const state = vi.hoisted(() => ({
  carts: [] as CartFixture[],
  nextItemSeq: 1,
}));

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/db", () => {
  const prisma = {
    cart: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (typeof where.sessionId === "string") {
          return state.carts.find((c) => c.sessionId === where.sessionId) ?? null;
        }
        if (typeof where.customerId === "string") {
          return state.carts.find((c) => c.customerId === where.customerId) ?? null;
        }
        return null;
      }),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: { customerId?: string } }) => {
          const cart = state.carts.find((c) => c.id === where.id)!;
          if (data.customerId !== undefined) cart.customerId = data.customerId;
          return cart;
        },
      ),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        state.carts = state.carts.filter((c) => c.id !== where.id);
      }),
    },
    cartItem: {
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { qty?: number } }) => {
        for (const cart of state.carts) {
          const item = cart.items.find((i) => i.id === where.id);
          if (item) {
            if (typeof data.qty === "number") item.qty = data.qty;
            return item;
          }
        }
        return null;
      }),
      create: vi.fn(
        async ({
          data,
        }: {
          data: {
            cartId: string;
            variantId: string;
            qty: number;
            unitPrice: number;
            customDesign?: unknown;
            designId?: string;
          };
        }) => {
          const cart = state.carts.find((c) => c.id === data.cartId)!;
          const item: Linea = {
            id: `ci_new_${state.nextItemSeq++}`,
            cartId: data.cartId,
            variantId: data.variantId,
            qty: data.qty,
            unitPrice: data.unitPrice,
            designId: data.designId ?? null,
            customDesign: data.customDesign ?? null,
            design: null, // el fold no re-adjunta el objeto design; el test lo verifica por designId
          };
          cart.items.push(item);
          return item;
        },
      ),
      deleteMany: vi.fn(async ({ where }: { where: { cartId: string } }) => {
        const cart = state.carts.find((c) => c.id === where.cartId);
        if (cart) cart.items = [];
        return { count: 0 };
      }),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  return { prisma };
});

import { mergeAnonCartIntoCustomer, mergeCartsAdopt } from "./service";

function diseno(id: string, canvasData: unknown, productId = "prod_1"): Linea["design"] {
  return {
    id,
    productId,
    canvasData,
    metadata: null,
    previewUrl: `https://cdn/${id}.png`,
    status: "READY",
  };
}

function linea(over: Partial<Linea> & { cartId: string }): Linea {
  return {
    id: over.id ?? `ci_${over.cartId}_${Math.random().toString(36).slice(2, 8)}`,
    variantId: "var_1",
    qty: 1,
    unitPrice: 10_000,
    designId: over.design?.id ?? null,
    customDesign: null,
    design: null,
    ...over,
  };
}

function seedCart(
  over: Partial<CartFixture> & { sessionId: string; items?: Linea[] },
): CartFixture {
  const cart: CartFixture = {
    id: `cart_${over.sessionId}`,
    customerId: null,
    deletedAt: null,
    ...over,
    items: over.items ?? [],
  };
  // Re-atar cartId de las líneas sembradas.
  for (const it of cart.items) it.cartId = cart.id;
  state.carts.push(cart);
  return cart;
}

function itemsDe(cartId: string): Linea[] {
  return state.carts.find((c) => c.id === cartId)!.items;
}

beforeEach(() => {
  state.carts = [];
  state.nextItemSeq = 1;
});

describe("mergeAnonCartIntoCustomer — dedupe por contenido (Paquete H)", () => {
  it("mismo designId en ambos carritos, misma variante → suma qty (una línea)", async () => {
    const d = diseno("d1", { version: 2, color: "turquesa" });
    const cust = seedCart({
      sessionId: "sess_cust",
      customerId: "cust_1",
      items: [linea({ cartId: "", design: d, qty: 1 })],
    });
    seedCart({ sessionId: "sess_anon", items: [linea({ cartId: "", design: d, qty: 2 })] });

    const result = await mergeAnonCartIntoCustomer("sess_anon", "cust_1");
    expect(result).toBe("sess_cust");
    const items = itemsDe(cust.id);
    expect(items).toHaveLength(1);
    expect(items[0].qty).toBe(3);
    expect(items[0].designId).toBe("d1");
  });

  it("designs DISTINTOS pero idénticos (dos pasadas por el Estudio) → consolida sumando qty", async () => {
    // El bug del reporte STG: canvas igual, Design nuevo → antes dos líneas iguales.
    const dCust = diseno("d1", { version: 2, slots: [{ slotIndex: 0, assetId: "foto-A" }] });
    const dAnon = diseno("d2", { slots: [{ slotIndex: 0, assetId: "foto-A" }], version: 2 });
    const cust = seedCart({
      sessionId: "sess_cust",
      customerId: "cust_1",
      items: [linea({ cartId: "", design: dCust, qty: 1 })],
    });
    seedCart({ sessionId: "sess_anon", items: [linea({ cartId: "", design: dAnon, qty: 1 })] });

    await mergeAnonCartIntoCustomer("sess_anon", "cust_1");
    const items = itemsDe(cust.id);
    expect(items).toHaveLength(1);
    expect(items[0].qty).toBe(2);
    // Sobrevive la línea del customer (conserva su diseño/preview); el Design
    // del anon queda huérfano — mismo manejo que addPersonalizedToCart.
    expect(items[0].designId).toBe("d1");
  });

  it("designs realmente distintos del mismo producto/variante → líneas separadas", async () => {
    const dCust = diseno("d1", { slots: [{ assetId: "foto-A" }] });
    const dAnon = diseno("d2", { slots: [{ assetId: "foto-B" }] });
    const cust = seedCart({
      sessionId: "sess_cust",
      customerId: "cust_1",
      items: [linea({ cartId: "", design: dCust })],
    });
    seedCart({ sessionId: "sess_anon", items: [linea({ cartId: "", design: dAnon })] });

    await mergeAnonCartIntoCustomer("sess_anon", "cust_1");
    const items = itemsDe(cust.id);
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.designId).sort()).toEqual(["d1", "d2"]);
  });

  it("mismo contenido pero OTRA variante → líneas separadas (la variante es otra compra)", async () => {
    const canvas = { version: 2, color: "turquesa" };
    const dCust = diseno("d1", canvas);
    const dAnon = diseno("d2", { ...canvas });
    const cust = seedCart({
      sessionId: "sess_cust",
      customerId: "cust_1",
      items: [linea({ cartId: "", design: dCust, variantId: "var_1" })],
    });
    seedCart({
      sessionId: "sess_anon",
      items: [linea({ cartId: "", design: dAnon, variantId: "var_2" })],
    });

    await mergeAnonCartIntoCustomer("sess_anon", "cust_1");
    expect(itemsDe(cust.id)).toHaveLength(2);
  });

  it("sin personalización (catálogo simple): consolida por variante sumando qty", async () => {
    const cust = seedCart({
      sessionId: "sess_cust",
      customerId: "cust_1",
      items: [linea({ cartId: "", qty: 2 })],
    });
    seedCart({ sessionId: "sess_anon", items: [linea({ cartId: "", qty: 3 })] });

    await mergeAnonCartIntoCustomer("sess_anon", "cust_1");
    const items = itemsDe(cust.id);
    expect(items).toHaveLength(1);
    expect(items[0].qty).toBe(5);
  });

  it("la suma sigue topada a MAX_QTY_PER_ITEM (99)", async () => {
    const cust = seedCart({
      sessionId: "sess_cust",
      customerId: "cust_1",
      items: [linea({ cartId: "", qty: 60 })],
    });
    seedCart({ sessionId: "sess_anon", items: [linea({ cartId: "", qty: 60 })] });

    await mergeAnonCartIntoCustomer("sess_anon", "cust_1");
    expect(itemsDe(cust.id)[0].qty).toBe(99);
  });
});

describe("mergeCartsAdopt — dedupe por contenido (Paquete H)", () => {
  it("designs distintos pero idénticos → consolida en el carrito recuperado (target)", async () => {
    const dTarget = diseno("d1", { version: 2, slots: [{ assetId: "foto-A" }] });
    const dSource = diseno("d2", { version: 2, slots: [{ assetId: "foto-A" }] });
    const target = seedCart({
      sessionId: "sess_target",
      items: [linea({ cartId: "", design: dTarget, qty: 1 })],
    });
    seedCart({ sessionId: "sess_source", items: [linea({ cartId: "", design: dSource, qty: 2 })] });

    await mergeCartsAdopt("sess_source", "sess_target");
    const items = itemsDe(target.id);
    expect(items).toHaveLength(1);
    expect(items[0].qty).toBe(3);
    expect(items[0].designId).toBe("d1");
    // El source quedó borrado (fold con hard-delete, como siempre).
    expect(state.carts.find((c) => c.sessionId === "sess_source")).toBeUndefined();
  });

  it("designs distintos con contenido distinto → NO consolida", async () => {
    const dTarget = diseno("d1", { slots: [{ assetId: "A" }] });
    const dSource = diseno("d2", { slots: [{ assetId: "B" }] });
    const target = seedCart({
      sessionId: "sess_target",
      items: [linea({ cartId: "", design: dTarget })],
    });
    seedCart({ sessionId: "sess_source", items: [linea({ cartId: "", design: dSource })] });

    await mergeCartsAdopt("sess_source", "sess_target");
    expect(itemsDe(target.id)).toHaveLength(2);
  });

  it("sin personalización, misma variante → suma qty", async () => {
    const target = seedCart({ sessionId: "sess_target", items: [linea({ cartId: "", qty: 1 })] });
    seedCart({ sessionId: "sess_source", items: [linea({ cartId: "", qty: 4 })] });

    await mergeCartsAdopt("sess_source", "sess_target");
    const items = itemsDe(target.id);
    expect(items).toHaveLength(1);
    expect(items[0].qty).toBe(5);
  });
});
