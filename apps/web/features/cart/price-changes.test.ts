/*
 * Unit tests de D-2 (ADR-211):
 *  - formatPriceChangesNotice: copy es-CO (tuteo) para 0, 1, 2–3 y >3 cambios.
 *  - syncCartPrices: detecta cambio de tarifa base y de escala mayorista,
 *    persiste el nuevo CartItem.unitPrice y refresca Cart.updatedAt en una tx.
 *  - mergeAnonCartIntoCustomer y mergeCartsAdopt: refrescan Cart.updatedAt y
 *    re-evalúan WholesaleTier al sumar cantidades en un merge.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VolumeTierInput } from "./volume-pricing";

type MockCartItem = {
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
    safetyStock: number;
    isActive: boolean;
    deletedAt: null;
    attributes: unknown;
    images: string[];
    product: {
      id: string;
      slug: string;
      name: string;
      basePrice: number;
      images: string[];
      isPersonalizable: boolean;
      isActive: boolean;
      publishedOnStorefront: boolean;
      fulfillmentMode: "MADE_TO_ORDER" | "PHYSICAL_STOCK";
      deletedAt: null;
      category: { isActive: boolean; deletedAt: null };
      personalizationKind: string;
      personalizationSchema: unknown;
    };
  };
};

type MockCart = {
  id: string;
  sessionId: string;
  customerId: string | null;
  currency: string;
  deletedAt: null;
  updatedAt: Date;
  items: MockCartItem[];
};

const state = vi.hoisted(() => ({
  carts: [] as MockCart[],
  tiers: [] as VolumeTierInput[],
  cartTouchCalls: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/db", () => {
  const prisma = {
    wholesaleTier: {
      findMany: vi.fn(async () => state.tiers),
    },
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
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: { updatedAt?: Date; customerId?: string };
        }) => {
          const cart = state.carts.find((c) => c.id === where.id)!;
          if (data.updatedAt) {
            cart.updatedAt = data.updatedAt;
            state.cartTouchCalls.push(cart.id);
          }
          if (data.customerId !== undefined) cart.customerId = data.customerId;
          return cart;
        },
      ),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        state.carts = state.carts.filter((c) => c.id !== where.id);
      }),
    },
    cartItem: {
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: { qty?: number; unitPrice?: number };
        }) => {
          for (const cart of state.carts) {
            const item = cart.items.find((i) => i.id === where.id);
            if (item) {
              if (typeof data.qty === "number") item.qty = data.qty;
              if (typeof data.unitPrice === "number") item.unitPrice = data.unitPrice;
              return item;
            }
          }
          return null;
        },
      ),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string; cartId?: string; qty?: number };
          data: { unitPrice?: number };
        }) => {
          let count = 0;
          for (const cart of state.carts) {
            if (where.cartId && cart.id !== where.cartId) continue;
            const item = cart.items.find((i) => i.id === where.id);
            if (item && (where.qty === undefined || item.qty === where.qty)) {
              if (typeof data.unitPrice === "number") item.unitPrice = data.unitPrice;
              count += 1;
            }
          }
          return { count };
        },
      ),
      create: vi.fn(
        async ({
          data,
        }: {
          data: {
            cartId: string;
            variantId: string;
            qty: number;
            unitPrice: number;
            designId?: string;
            customDesign?: unknown;
          };
        }) => {
          const cart = state.carts.find((c) => c.id === data.cartId)!;
          const template = state.carts
            .flatMap((c) => c.items)
            .find((i) => i.variantId === data.variantId)!;
          const created: MockCartItem = {
            ...template,
            id: `ci_created_${cart.items.length + 1}`,
            cartId: data.cartId,
            qty: data.qty,
            unitPrice: data.unitPrice,
          };
          cart.items.push(created);
          return created;
        },
      ),
      deleteMany: vi.fn(async ({ where }: { where: { cartId: string } }) => {
        const cart = state.carts.find((c) => c.id === where.cartId);
        if (cart) cart.items = [];
        return { count: 0 };
      }),
    },
    design: {
      findMany: vi.fn(async () => []),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  return { prisma };
});

import { formatPriceChangesNotice, sanitizePriceNotice } from "./price-changes";
import { mergeAnonCartIntoCustomer, mergeCartsAdopt, syncCartPrices } from "./service";
import { prisma } from "@/lib/db";

function makeItem(overrides: Partial<MockCartItem> & { currentPrice?: number } = {}): MockCartItem {
  const { currentPrice, ...rest } = overrides;
  return {
    id: "ci_1",
    cartId: "cart_1",
    variantId: "var_1",
    qty: 2,
    unitPrice: 3_000_000,
    designId: null,
    customDesign: null,
    templateId: null,
    metadata: {},
    design: null,
    variant: {
      id: "var_1",
      name: "Set 6 unidades",
      sku: "FI-POL-6",
      price: currentPrice ?? 3_000_000,
      stock: 50,
      safetyStock: 0,
      isActive: true,
      deletedAt: null,
      attributes: {},
      images: [],
      product: {
        id: "prod_1",
        slug: "fotoimanes-polaroid",
        name: "Fotoimanes Polaroid",
        basePrice: currentPrice ?? 3_000_000,
        images: [],
        isPersonalizable: false,
        isActive: true,
        publishedOnStorefront: true,
        fulfillmentMode: "MADE_TO_ORDER",
        deletedAt: null,
        category: { isActive: true, deletedAt: null },
        personalizationKind: "NONE",
        personalizationSchema: null,
      },
    },
    ...rest,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.carts = [];
  state.tiers = [];
  state.cartTouchCalls = [];
});

describe("formatPriceChangesNotice (D-2 · ADR-211)", () => {
  it("devuelve null cuando no hay cambios", () => {
    expect(formatPriceChangesNotice([])).toBeNull();
  });

  it("formatea aviso claro para 1 producto y para múltiples productos en tuteo es-CO", () => {
    const single = formatPriceChangesNotice([
      {
        itemId: "ci_1",
        productName: "Fotoimanes Polaroid",
        variantName: "Set 6",
        previousUnitPrice: 3_000_000,
        currentUnitPrice: 3_500_000,
        qty: 1,
      },
    ]);
    expect(single).toContain("Fotoimanes Polaroid");
    expect(single).toContain("30.000");
    expect(single).toContain("35.000");

    const multi = formatPriceChangesNotice([
      {
        itemId: "ci_1",
        productName: "Prod A",
        variantName: "V1",
        previousUnitPrice: 1_000_000,
        currentUnitPrice: 1_200_000,
        qty: 1,
      },
      {
        itemId: "ci_2",
        productName: "Prod B",
        variantName: "V2",
        previousUnitPrice: 2_000_000,
        currentUnitPrice: 1_800_000,
        qty: 2,
      },
    ]);
    expect(multi).toContain("2 productos");
    expect(multi).toContain("Prod A");
    expect(multi).toContain("Prod B");

    const four = formatPriceChangesNotice(
      ["A", "B", "C", "D"].map((l, idx) => ({
        itemId: `ci_${idx}`,
        productName: `Prod ${l}`,
        variantName: "V1",
        previousUnitPrice: 1_000_000,
        currentUnitPrice: 1_100_000,
        qty: 1,
      })),
    );
    expect(four).toContain("4 productos");
    expect(four).toContain("y 1 más");
  });

  it("sanitizePriceNotice descarta vacíos/espacios y acota longitud a 240 caracteres", () => {
    expect(sanitizePriceNotice(undefined)).toBeNull();
    expect(sanitizePriceNotice("   ")).toBeNull();
    expect(sanitizePriceNotice("  Aviso válido  ")).toBe("Aviso válido");
    const long = "a".repeat(300);
    const capped = sanitizePriceNotice(long)!;
    expect(capped.length).toBe(240);
    expect(capped.endsWith("…")).toBe(true);
  });
});

describe("syncCartPrices (D-2 · ADR-211)", () => {
  it("actualiza CartItem.unitPrice y Cart.updatedAt cuando cambió la tarifa vigente", async () => {
    const oldDate = new Date("2026-10-01T00:00:00Z");
    state.carts = [
      {
        id: "cart_1",
        sessionId: "sess_1",
        customerId: null,
        currency: "COP",
        deletedAt: null,
        updatedAt: oldDate,
        items: [makeItem({ unitPrice: 3_000_000, currentPrice: 3_500_000, qty: 2 })],
      },
    ];

    const res = await syncCartPrices("sess_1", null);
    expect(res).not.toBeNull();
    expect(res!.priceChanges).toHaveLength(1);
    expect(res!.priceChanges[0]).toMatchObject({
      itemId: "ci_1",
      previousUnitPrice: 3_000_000,
      currentUnitPrice: 3_500_000,
    });
    expect(res!.cart.subtotal).toBe(7_000_000);
    expect(state.carts[0]!.items[0]!.unitPrice).toBe(3_500_000);
    expect(state.cartTouchCalls).toContain("cart_1");
    expect(state.carts[0]!.updatedAt.getTime()).toBeGreaterThan(oldDate.getTime());
  });

  it("no escribe en DB cuando el precio del carrito ya coincide con la tarifa vigente", async () => {
    state.carts = [
      {
        id: "cart_1",
        sessionId: "sess_1",
        customerId: null,
        currency: "COP",
        deletedAt: null,
        updatedAt: new Date("2026-11-01T00:00:00Z"),
        items: [makeItem({ unitPrice: 3_000_000, currentPrice: 3_000_000, qty: 1 })],
      },
    ];

    const res = await syncCartPrices("sess_1", null);
    expect(res!.priceChanges).toEqual([]);
    expect(state.cartTouchCalls).toEqual([]);
  });

  it("re-cotiza aplicando WholesaleTier vigente y omite actualizaciones si el CAS por qty no coincide", async () => {
    state.tiers = [
      {
        productId: "prod_1",
        variantId: null,
        minQty: 5,
        unitPrice: 2_500_000,
        isActive: true,
        deletedAt: null,
      },
    ];
    state.carts = [
      {
        id: "cart_1",
        sessionId: "sess_1",
        customerId: null,
        currency: "COP",
        deletedAt: null,
        updatedAt: new Date("2026-10-01T00:00:00Z"),
        items: [makeItem({ unitPrice: 3_000_000, currentPrice: 3_000_000, qty: 5 })],
      },
    ];

    const res = await syncCartPrices("sess_1", null);
    expect(res!.priceChanges).toHaveLength(1);
    expect(res!.priceChanges[0]!.currentUnitPrice).toBe(2_500_000);

    // Simular carrera concurrente (item eliminado o qty cambiada en otra pestaña → CAS count = 0).
    state.carts[0]!.items[0]!.unitPrice = 3_000_000;
    vi.mocked(prisma.cartItem.updateMany).mockResolvedValueOnce({ count: 0 });
    const casMiss = await syncCartPrices("sess_1", null);
    expect(casMiss!.priceChanges).toEqual([]);
  });
});

describe("mergeAnonCartIntoCustomer y mergeCartsAdopt — refresco de updatedAt y WholesaleTier (D-2)", () => {
  it("re-evalúa WholesaleTier al cruzar umbral sumando qty en mergeAnonCartIntoCustomer y refresca updatedAt", async () => {
    const oldDate = new Date("2026-10-01T00:00:00Z");
    state.tiers = [
      {
        productId: "prod_1",
        variantId: null,
        minQty: 10,
        unitPrice: 2_400_000,
        isActive: true,
        deletedAt: null,
      },
    ];
    state.carts = [
      {
        id: "cart_cust",
        sessionId: "sess_cust",
        customerId: "cust_1",
        currency: "COP",
        deletedAt: null,
        updatedAt: oldDate,
        items: [makeItem({ id: "ci_cust", cartId: "cart_cust", qty: 6, unitPrice: 3_000_000 })],
      },
      {
        id: "cart_anon",
        sessionId: "sess_anon",
        customerId: null,
        currency: "COP",
        deletedAt: null,
        updatedAt: new Date(),
        items: [makeItem({ id: "ci_anon", cartId: "cart_anon", qty: 5, unitPrice: 3_000_000 })],
      },
    ];

    const surviving = await mergeAnonCartIntoCustomer("sess_anon", "cust_1");
    expect(surviving).toBe("sess_cust");
    const custCart = state.carts.find((c) => c.id === "cart_cust")!;
    expect(custCart.items[0]!.qty).toBe(11);
    expect(custCart.items[0]!.unitPrice).toBe(2_400_000);
    expect(state.cartTouchCalls).toContain("cart_cust");
    expect(custCart.updatedAt.getTime()).toBeGreaterThan(oldDate.getTime());
  });

  it("re-evalúa WholesaleTier y refresca updatedAt en mergeCartsAdopt", async () => {
    const oldDate = new Date("2026-10-01T00:00:00Z");
    state.tiers = [
      {
        productId: "prod_1",
        variantId: null,
        minQty: 5,
        unitPrice: 2_500_000,
        isActive: true,
        deletedAt: null,
      },
    ];
    state.carts = [
      {
        id: "cart_target",
        sessionId: "sess_target",
        customerId: null,
        currency: "COP",
        deletedAt: null,
        updatedAt: oldDate,
        items: [makeItem({ id: "ci_t", cartId: "cart_target", qty: 3, unitPrice: 3_000_000 })],
      },
      {
        id: "cart_src",
        sessionId: "sess_src",
        customerId: null,
        currency: "COP",
        deletedAt: null,
        updatedAt: new Date(),
        items: [makeItem({ id: "ci_s", cartId: "cart_src", qty: 2, unitPrice: 3_000_000 })],
      },
    ];

    await mergeCartsAdopt("sess_src", "sess_target");
    const targetCart = state.carts.find((c) => c.id === "cart_target")!;
    expect(targetCart.items[0]!.qty).toBe(5);
    expect(targetCart.items[0]!.unitPrice).toBe(2_500_000);
    expect(state.cartTouchCalls).toContain("cart_target");
    expect(targetCart.updatedAt.getTime()).toBeGreaterThan(oldDate.getTime());
  });
});
