/*
 * Reorder "Volver a pedir" (Paquete I, 2026-10-02) — service de features/orders/reorder.ts.
 *
 * Sin DB: prisma mockeado con el pedido en memoria; addProductToCart / addPersonalizedToCart /
 * cloneDesignForReorder mockeados (su lógica propia —precio vigente, stock, clonado de bytes—
 * se cubre en sus propios tests). Acá se prueba el DESPACHO por ítem y la AUTORIZACIÓN:
 *  - ownership: registrado propio/ajeno, token válido/inválido (anti-fuzzing antes de la DB).
 *  - caso 1: sin personalización → addProductToCart con la variante viva, precio VIGENTE.
 *  - caso 2: personalizado con fotos vivas → clon + addPersonalizedToCart (misma variante).
 *  - caso 3: purgado (>90 días) o Design borrado → requiereFotos con CTA al Estudio.
 *  - caso 4: producto retirado / stock agotado / variante archivada → noDisponibles.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { MockCartError, state } = vi.hoisted(() => {
  class MockCartError extends Error {
    constructor(
      public code: string,
      public detail?: string,
    ) {
      super(detail ?? code);
      this.name = "CartError";
    }
  }
  const state = {
    order: null as unknown,
    findFirstWhere: [] as Array<Record<string, unknown>>,
    addProductCalls: [] as Array<Record<string, unknown>>,
    addPersonalizedCalls: [] as Array<Record<string, unknown>>,
    cloneCalls: [] as Array<Record<string, unknown>>,
    addProductError: null as unknown,
    addPersonalizedError: null as unknown,
    cloneResult: { id: "clone_1" } as { id: string } | null,
    currentUnitPrice: 15_000,
  };
  return { MockCartError, state };
});

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    order: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        state.findFirstWhere.push(where);
        return state.order;
      }),
    },
  },
}));

vi.mock("@/features/cart/service", () => ({
  CartError: MockCartError,
  addProductToCart: vi.fn(async (opts: Record<string, unknown>) => {
    state.addProductCalls.push(opts);
    if (state.addProductError) throw state.addProductError;
    return {
      items: [{ variantId: opts.variantId, designId: null, unitPrice: state.currentUnitPrice }],
    };
  }),
  addPersonalizedToCart: vi.fn(async (opts: Record<string, unknown>) => {
    state.addPersonalizedCalls.push(opts);
    if (state.addPersonalizedError) throw state.addPersonalizedError;
    return {
      items: [
        { variantId: opts.variantId, designId: opts.designId, unitPrice: state.currentUnitPrice },
      ],
    };
  }),
}));

vi.mock("@/features/personalization/service", () => ({
  cloneDesignForReorder: vi.fn(async (designId: string, owner: Record<string, unknown>) => {
    state.cloneCalls.push({ designId, ...owner });
    return state.cloneResult;
  }),
}));

import { reorderGuestOrder, reorderRegisteredOrder } from "./reorder";

type ItemSeed = {
  id: string;
  designId: string | null;
  qty: number;
  unitPrice: number;
  design?: { id: string; status: string; purgedAt: Date | null } | null;
  templateSlug?: string | null;
  productSlug?: string;
  productName?: string;
  isActive?: boolean;
  deletedAt?: Date | null;
};

function seedOrder(items: ItemSeed[]) {
  state.order = {
    id: "order_1",
    number: "LC-0001",
    items: items.map((it, i) => ({
      id: it.id,
      variantId: `var_${i + 1}`,
      qty: it.qty,
      unitPrice: it.unitPrice,
      designId: it.designId,
      variant: {
        id: `var_${i + 1}`,
        name: "Default",
        product: {
          slug: it.productSlug ?? "iman-nevera",
          name: it.productName ?? `Producto ${i + 1}`,
          isActive: it.isActive ?? true,
          deletedAt: it.deletedAt ?? null,
        },
      },
      design: it.design === undefined ? null : it.design,
      template: it.templateSlug ? { slug: it.templateSlug } : null,
    })),
  };
}

const liveDesign = (id: string) => ({ id, status: "USED_IN_ORDER", purgedAt: null });

beforeEach(() => {
  state.order = null;
  state.findFirstWhere = [];
  state.addProductCalls = [];
  state.addPersonalizedCalls = [];
  state.cloneCalls = [];
  state.addProductError = null;
  state.addPersonalizedError = null;
  state.cloneResult = { id: "clone_1" };
  state.currentUnitPrice = 15_000;
});

describe("reorder — autorización", () => {
  it("registrado: busca por número + customerId propio (pedido ajeno → null)", async () => {
    state.order = null; // la DB no devuelve nada para el customerId filtrado
    const res = await reorderRegisteredOrder({
      orderNumber: "LC-0001",
      customerId: "cust_1",
      sessionId: "sess_1",
    });
    expect(res).toBeNull();
    expect(state.findFirstWhere[0]).toMatchObject({
      number: "LC-0001",
      customerId: "cust_1",
      deletedAt: null,
    });
    expect(state.addProductCalls).toHaveLength(0);
  });

  it("invitado: token con formato inválido → null SIN tocar la DB (anti-fuzzing)", async () => {
    const res = await reorderGuestOrder({
      token: "no-es-un-token",
      sessionId: "sess_1",
      customerId: null,
    });
    expect(res).toBeNull();
    expect(state.findFirstWhere).toHaveLength(0);
  });

  it("invitado: token válido sin pedido → null; con pedido → resumen", async () => {
    state.order = null;
    const token = "a".repeat(32);
    expect(await reorderGuestOrder({ token, sessionId: "sess_1", customerId: null })).toBeNull();
    expect(state.findFirstWhere[0]).toMatchObject({ deletedAt: null });
    expect(state.findFirstWhere[0]).toHaveProperty("publicAccessTokenHash");

    seedOrder([{ id: "it_1", designId: null, qty: 1, unitPrice: 12_000 }]);
    const res = await reorderGuestOrder({ token, sessionId: "sess_1", customerId: null });
    expect(res?.added).toHaveLength(1);
  });
});

describe("reorder — despacho por ítem", () => {
  it("caso 1 (sin personalización): addProductToCart con variante viva y precio VIGENTE", async () => {
    seedOrder([{ id: "it_1", designId: null, qty: 2, unitPrice: 10_000 }]);
    state.currentUnitPrice = 13_000; // el precio subió desde el pedido original

    const res = await reorderRegisteredOrder({
      orderNumber: "LC-0001",
      customerId: "cust_1",
      sessionId: "sess_1",
    });

    expect(state.addProductCalls[0]).toMatchObject({
      productSlug: "iman-nevera",
      qty: 2,
      variantId: "var_1",
      sessionId: "sess_1",
      customerId: "cust_1",
    });
    expect(res?.added[0]).toEqual({
      productName: "Producto 1",
      qty: 2,
      unitPrice: 13_000, // vigente, no el snapshot
      previousUnitPrice: 10_000,
    });
  });

  it("caso 2 (personalizado con fotos vivas): clona y agrega con la MISMA variante", async () => {
    seedOrder([
      {
        id: "it_1",
        designId: "design_1",
        qty: 1,
        unitPrice: 20_000,
        design: liveDesign("design_1"),
      },
    ]);

    const res = await reorderRegisteredOrder({
      orderNumber: "LC-0001",
      customerId: "cust_1",
      sessionId: "sess_1",
    });

    expect(state.cloneCalls[0]).toEqual({
      designId: "design_1",
      customerId: "cust_1",
      sessionId: "sess_1",
    });
    expect(state.addPersonalizedCalls[0]).toMatchObject({
      designId: "clone_1",
      qty: 1,
      variantId: "var_1",
    });
    expect(res?.added[0]?.productName).toBe("Producto 1");
    expect(res?.needsPhotos).toHaveLength(0);
  });

  it("caso 3 (purgado >90 días): NO se agrega; requiere fotos con CTA al Estudio (+template)", async () => {
    seedOrder([
      {
        id: "it_1",
        designId: "design_1",
        qty: 1,
        unitPrice: 20_000,
        design: { id: "design_1", status: "USED_IN_ORDER", purgedAt: new Date("2026-09-01") },
        templateSlug: "marco-corazon",
      },
    ]);

    const res = await reorderRegisteredOrder({
      orderNumber: "LC-0001",
      customerId: "cust_1",
      sessionId: "sess_1",
    });

    expect(state.cloneCalls).toHaveLength(0);
    expect(state.addPersonalizedCalls).toHaveLength(0);
    expect(res?.added).toHaveLength(0);
    expect(res?.needsPhotos).toEqual([
      { productName: "Producto 1", studioUrl: "/estudio/iman-nevera?template=marco-corazon" },
    ]);
  });

  it("caso 3b (Design borrado — designId apunta a null): también requiere fotos", async () => {
    seedOrder([{ id: "it_1", designId: "design_gone", qty: 1, unitPrice: 20_000, design: null }]);
    const res = await reorderRegisteredOrder({
      orderNumber: "LC-0001",
      customerId: "cust_1",
      sessionId: "sess_1",
    });
    expect(res?.needsPhotos).toEqual([
      { productName: "Producto 1", studioUrl: "/estudio/iman-nevera" },
    ]);
  });

  it("caso 4 (producto retirado): skip con aviso, sin clonar ni tocar el carrito", async () => {
    seedOrder([
      { id: "it_1", designId: null, qty: 1, unitPrice: 10_000, isActive: false },
      {
        id: "it_2",
        designId: "design_2",
        qty: 1,
        unitPrice: 20_000,
        design: liveDesign("design_2"),
        deletedAt: new Date("2026-08-01"),
      },
    ]);

    const res = await reorderRegisteredOrder({
      orderNumber: "LC-0001",
      customerId: "cust_1",
      sessionId: "sess_1",
    });

    expect(state.addProductCalls).toHaveLength(0);
    expect(state.cloneCalls).toHaveLength(0);
    expect(res?.unavailable).toHaveLength(2);
    expect(res?.unavailable[0]?.reason).toBe("Ya no está a la venta.");
  });

  it("stock agotado en la variante (CartError): va a noDisponibles con el copy del service", async () => {
    seedOrder([{ id: "it_1", designId: null, qty: 1, unitPrice: 10_000 }]);
    state.addProductError = new MockCartError(
      "STOCK_UNAVAILABLE",
      "«Producto 1» está agotado por ahora.",
    );

    const res = await reorderRegisteredOrder({
      orderNumber: "LC-0001",
      customerId: "cust_1",
      sessionId: "sess_1",
    });

    expect(res?.added).toHaveLength(0);
    expect(res?.unavailable).toEqual([
      { productName: "Producto 1", reason: "«Producto 1» está agotado por ahora." },
    ]);
  });

  it("variante archivada (addPersonalizedToCart NO_DEFAULT_VARIANT): noDisponibles", async () => {
    seedOrder([
      {
        id: "it_1",
        designId: "design_1",
        qty: 1,
        unitPrice: 20_000,
        design: liveDesign("design_1"),
      },
    ]);
    state.addPersonalizedError = new MockCartError("NO_DEFAULT_VARIANT");

    const res = await reorderRegisteredOrder({
      orderNumber: "LC-0001",
      customerId: "cust_1",
      sessionId: "sess_1",
    });

    expect(res?.added).toHaveLength(0);
    expect(res?.unavailable[0]?.reason).toBe("Ya no está disponible.");
  });

  it("el clon falla (Storage caído): noDisponibles con aviso de reintento", async () => {
    seedOrder([
      {
        id: "it_1",
        designId: "design_1",
        qty: 1,
        unitPrice: 20_000,
        design: liveDesign("design_1"),
      },
    ]);
    state.cloneResult = null;

    const res = await reorderRegisteredOrder({
      orderNumber: "LC-0001",
      customerId: "cust_1",
      sessionId: "sess_1",
    });

    expect(res?.added).toHaveLength(0);
    expect(res?.unavailable[0]?.reason).toContain("Intenta de nuevo");
  });

  it("pedido mixto: cada ítem cae en su bucket del resumen", async () => {
    seedOrder([
      { id: "it_1", designId: null, qty: 1, unitPrice: 10_000, productName: "Simple" },
      {
        id: "it_2",
        designId: "design_2",
        qty: 1,
        unitPrice: 20_000,
        productName: "Vivo",
        design: liveDesign("design_2"),
      },
      {
        id: "it_3",
        designId: "design_3",
        qty: 1,
        unitPrice: 20_000,
        productName: "Purgado",
        design: { id: "design_3", status: "USED_IN_ORDER", purgedAt: new Date() },
      },
      {
        id: "it_4",
        designId: null,
        qty: 1,
        unitPrice: 5_000,
        productName: "Retirado",
        isActive: false,
      },
    ]);

    const res = await reorderRegisteredOrder({
      orderNumber: "LC-0001",
      customerId: "cust_1",
      sessionId: "sess_1",
    });

    expect(res?.added.map((a) => a.productName)).toEqual(["Simple", "Vivo"]);
    expect(res?.needsPhotos.map((n) => n.productName)).toEqual(["Purgado"]);
    expect(res?.unavailable.map((u) => u.productName)).toEqual(["Retirado"]);
  });
});
