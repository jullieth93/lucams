/*
 * Unit tests del cableado de precio por volumen (WholesaleTier) en el SERVICE
 * de carrito (2026-10-02). Sin DB: prisma se mockea con estado en memoria
 * (mismo patrón que service-stock.test.ts).
 *
 * Regla de negocio: descuento por volumen PÚBLICO (todos los clientes,
 * invitados incluidos). El unitPrice del tier es ABSOLUTO y reemplaza el de la
 * línea; nunca sube el precio; niveles propios del producto > globales.
 *
 * Cubre:
 *  - addProductToCart: snapshot con tier en el alta; re-priceo de la línea
 *    existente cuando el ACUMULADO cruza el umbral; precedencia producto >
 *    global; tier más caro que el base no aplica.
 *  - updateCartItemQty: re-priceo al cruzar el umbral en ambos sentidos;
 *    sin tiers configurados el snapshot queda intacto (semántica legacy);
 *    línea personalizada por-ficha: el tier se aplica sobre el base con
 *    multiplicadores (precio × letras).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VolumeTierInput } from "./volume-pricing";

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
  design: {
    id: string;
    previewUrl: string | null;
    status: string;
    productId: string;
    metadata: unknown;
    canvasData: unknown;
  } | null;
  variant: {
    id: string;
    name: string;
    sku: string;
    price: number | null;
    stock: number;
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
  tiers: [] as VolumeTierInput[],
}));

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    product: {
      findFirst: vi.fn(async () => state.product),
    },
    // El service filtra en el WHERE (isActive, deletedAt, OR productId/null);
    // el mock devuelve el estado tal cual — el helper puro re-filtra a la
    // defensiva, así que los tests ejercitan ambas capas.
    wholesaleTier: {
      findMany: vi.fn(async () => state.tiers),
    },
    cart: {
      findFirst: vi.fn(async () => state.cart),
      findUnique: vi.fn(async () => null),
      update: vi.fn(async () => state.cart),
      create: vi.fn(async () => state.cart),
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
          const item = state.cart?.items.find((i) => i.id === where.id);
          if (item) {
            if (typeof data.qty === "number") item.qty = data.qty;
            if (typeof data.unitPrice === "number") item.unitPrice = data.unitPrice;
          }
          return item;
        },
      ),
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

import { addProductToCart, updateCartItemQty } from "./service";

const PRODUCT = { id: "prod_1", slug: "iman-nevera", name: "Imán Nevera", basePrice: 12_000 };

function makeVariant(
  id: string,
  stock: number,
  opts?: { price?: number | null; attributes?: unknown },
): CartItemFixture["variant"] {
  return {
    id,
    name: "Default",
    sku: "IMN-DEFAULT",
    price: opts?.price ?? null,
    stock,
    attributes: opts?.attributes ?? {},
    images: [],
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

function tier(partial: Partial<VolumeTierInput> & Pick<VolumeTierInput, "minQty" | "unitPrice">) {
  return {
    productId: null,
    isActive: true,
    deletedAt: null,
    ...partial,
  } satisfies VolumeTierInput;
}

function seedProduct(stock: number) {
  state.product = {
    id: PRODUCT.id,
    basePrice: PRODUCT.basePrice,
    name: PRODUCT.name,
    variants: [{ id: "var_1", price: null, stock }],
  };
}

function seedCart(
  items: Array<{
    qty: number;
    unitPrice?: number;
    stock?: number;
    attributes?: unknown;
    design?: CartItemFixture["design"];
  }>,
) {
  state.cart = {
    id: "cart_1",
    sessionId: "sess_1",
    customerId: null,
    currency: "COP",
    items: items.map((it, idx) => ({
      id: `ci_${idx + 1}`,
      cartId: "cart_1",
      variantId: "var_1",
      qty: it.qty,
      unitPrice: it.unitPrice ?? PRODUCT.basePrice,
      designId: it.design?.id ?? null,
      customDesign: null,
      templateId: null,
      metadata: null,
      design: it.design ?? null,
      variant: makeVariant("var_1", it.stock ?? 50, { attributes: it.attributes }),
    })),
  };
}

beforeEach(() => {
  state.product = null;
  state.cart = null;
  state.tiers = [];
});

describe("addProductToCart — precio por volumen", () => {
  it("alta con qty bajo el umbral: snapshot al base (el tier no aplica)", async () => {
    seedProduct(50);
    seedCart([]);
    state.tiers = [tier({ minQty: 10, unitPrice: 9_000 })];
    const detail = await addProductToCart({
      sessionId: "sess_1",
      customerId: null,
      productSlug: "iman-nevera",
      qty: 3,
    });
    expect(detail.items[0].unitPrice).toBe(12_000);
  });

  it("alta con qty en el umbral: el unitPrice del tier REEMPLAZA el base", async () => {
    seedProduct(50);
    seedCart([]);
    state.tiers = [tier({ minQty: 10, unitPrice: 9_000 })];
    const detail = await addProductToCart({
      sessionId: "sess_1",
      customerId: null,
      productSlug: "iman-nevera",
      qty: 10,
    });
    expect(detail.items[0].unitPrice).toBe(9_000);
    expect(detail.items[0].lineTotal).toBe(90_000);
  });

  it("el tier propio del producto GANA al global", async () => {
    seedProduct(50);
    seedCart([]);
    state.tiers = [
      tier({ minQty: 10, unitPrice: 8_000 }), // global, más barato
      tier({ productId: PRODUCT.id, minQty: 10, unitPrice: 9_500 }), // propio
    ];
    const detail = await addProductToCart({
      sessionId: "sess_1",
      customerId: null,
      productSlug: "iman-nevera",
      qty: 10,
    });
    expect(detail.items[0].unitPrice).toBe(9_500);
  });

  it("sumar qty a una línea existente cruza el umbral → re-pricea la línea", async () => {
    seedProduct(50);
    seedCart([{ qty: 6 }]); // snapshot legacy a base
    state.tiers = [tier({ minQty: 10, unitPrice: 9_000 })];
    const detail = await addProductToCart({
      sessionId: "sess_1",
      customerId: null,
      productSlug: "iman-nevera",
      qty: 4,
    });
    expect(detail.items[0].qty).toBe(10);
    expect(detail.items[0].unitPrice).toBe(9_000);
  });

  it("tier más caro que el base NO aplica (defensa anti-config errónea)", async () => {
    seedProduct(50);
    seedCart([]);
    state.tiers = [tier({ minQty: 10, unitPrice: 15_000 })];
    const detail = await addProductToCart({
      sessionId: "sess_1",
      customerId: null,
      productSlug: "iman-nevera",
      qty: 10,
    });
    expect(detail.items[0].unitPrice).toBe(12_000);
  });

  it("SIN tiers, sumar a una línea existente conserva su snapshot (no re-pricea al base vigente)", async () => {
    seedProduct(50);
    // Snapshot viejo (11_000) distinto del base actual (12_000): sin niveles
    // configurados, el acumulado NO debe tocar el precio exhibido.
    seedCart([{ qty: 2, unitPrice: 11_000 }]);
    state.tiers = [];
    const detail = await addProductToCart({
      sessionId: "sess_1",
      customerId: null,
      productSlug: "iman-nevera",
      qty: 1,
    });
    expect(detail.items[0].qty).toBe(3);
    expect(detail.items[0].unitPrice).toBe(11_000);
  });

  it("tiers inactivos / soft-eliminados no aplican aunque el mock los devuelva", async () => {
    seedProduct(50);
    seedCart([]);
    state.tiers = [
      tier({ minQty: 10, unitPrice: 9_000, isActive: false }),
      tier({ minQty: 5, unitPrice: 8_000, deletedAt: new Date("2026-09-01") }),
    ];
    const detail = await addProductToCart({
      sessionId: "sess_1",
      customerId: null,
      productSlug: "iman-nevera",
      qty: 10,
    });
    expect(detail.items[0].unitPrice).toBe(12_000);
  });
});

describe("updateCartItemQty — re-priceo por volumen", () => {
  it("subir la qty cruzando el umbral baja el unitPrice al del tier", async () => {
    seedCart([{ qty: 6, stock: 50 }]);
    state.tiers = [tier({ minQty: 10, unitPrice: 9_000 })];
    const detail = await updateCartItemQty("sess_1", "ci_1", 10);
    expect(detail.items[0].qty).toBe(10);
    expect(detail.items[0].unitPrice).toBe(9_000);
    expect(detail.items[0].lineTotal).toBe(90_000);
  });

  it("bajar la qty por debajo del umbral devuelve el unitPrice al base vigente", async () => {
    // La línea estaba en 12 unidades con precio de tier (9_000).
    seedCart([{ qty: 12, unitPrice: 9_000, stock: 50 }]);
    state.tiers = [tier({ minQty: 10, unitPrice: 9_000 })];
    const detail = await updateCartItemQty("sess_1", "ci_1", 3);
    expect(detail.items[0].unitPrice).toBe(12_000);
    expect(detail.items[0].lineTotal).toBe(36_000);
  });

  it("SIN tiers configurados el snapshot queda intacto (semántica legacy)", async () => {
    seedCart([{ qty: 2, unitPrice: 11_500, stock: 50 }]);
    state.tiers = [];
    const detail = await updateCartItemQty("sess_1", "ci_1", 5);
    expect(detail.items[0].unitPrice).toBe(11_500);
  });

  it("línea personalizada por-ficha: el tier se aplica sobre el base CON multiplicadores", async () => {
    // Variante por-ficha (5_000/ficha) + diseño de 3 letras → base 15_000.
    seedCart([
      {
        qty: 1,
        unitPrice: 15_000,
        stock: 50,
        attributes: { pricePerTile: true },
        design: {
          id: "design_1",
          previewUrl: null,
          status: "READY",
          productId: PRODUCT.id,
          metadata: { letters: ["L", "U", "C"] },
          canvasData: null,
        },
      },
    ]);
    // La variante del fixture vale null → cae a basePrice 12_000; la fijamos
    // por-ficha vía variant.price para el cálculo 3 × 5_000.
    state.cart!.items[0].variant.price = 5_000;
    state.tiers = [tier({ minQty: 2, unitPrice: 13_000 })];
    const detail = await updateCartItemQty("sess_1", "ci_1", 2);
    expect(detail.items[0].unitPrice).toBe(13_000);
  });

  it("línea por-ficha con diseño sin letras (inconsistente): conserva el snapshot", async () => {
    seedCart([
      {
        qty: 1,
        unitPrice: 15_000,
        stock: 50,
        attributes: { pricePerTile: true },
        design: {
          id: "design_1",
          previewUrl: null,
          status: "READY",
          productId: PRODUCT.id,
          metadata: {},
          canvasData: null,
        },
      },
    ]);
    state.cart!.items[0].variant.price = 5_000;
    state.tiers = [tier({ minQty: 2, unitPrice: 13_000 })];
    const detail = await updateCartItemQty("sess_1", "ci_1", 2);
    expect(detail.items[0].unitPrice).toBe(15_000);
  });
});
