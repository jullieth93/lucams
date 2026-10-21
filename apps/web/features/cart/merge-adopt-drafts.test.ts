/*
 * Unit tests — adopción de borradores anónimos al login (mergeAnonCartIntoCustomer).
 *
 * Antes solo se adoptaban los Designs referenciados por ítems del carrito
 * (adoptSessionDesigns): un borrador que nunca se agregó al carrito quedaba
 * HUÉRFANO tras el login — el Estudio resuelve el owner del logueado como
 * { customerId, sessionId: null }, así que getOwnedDesign no lo encontraba y
 * «Continuar donde quedaste» arrancaba vacío.
 *
 * Ahora adoptAnonDraftDesigns adopta TODOS los DRAFT con progreso real de la
 * sesión (designHasMeaningfulProgress) incluso cuando NO hay carrito anónimo,
 * con el mismo guard anti-adopción-ajena (sessionId exacto + customerId null).
 *
 * Sin DB: prisma mockeado con estado en memoria (mismo patrón que
 * merge-dedupe.test.ts / service-stock.test.ts).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

type DesignFixture = {
  id: string;
  sessionId: string | null;
  customerId: string | null;
  status: string;
  canvasData: unknown;
  metadata: unknown;
};

type CartFixture = {
  id: string;
  sessionId: string;
  customerId: string | null;
  deletedAt: null;
  items: {
    id: string;
    cartId: string;
    variantId: string;
    qty: number;
    unitPrice: number;
    designId: string | null;
    customDesign: unknown;
    design: unknown;
  }[];
};

const state = vi.hoisted(() => ({
  carts: [] as CartFixture[],
  designs: [] as DesignFixture[],
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
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    cartItem: {
      update: vi.fn(async () => null),
      create: vi.fn(async () => null),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    design: {
      findMany: vi.fn(
        async ({
          where,
        }: {
          where: { sessionId: string; customerId: string | null; status: string };
        }) =>
          state.designs.filter(
            (d) =>
              d.sessionId === where.sessionId &&
              d.customerId === where.customerId &&
              d.status === where.status,
          ),
      ),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: { in: string[] }; sessionId: string; customerId: null };
          data: { customerId?: string | null; sessionId?: string | null };
        }) => {
          let count = 0;
          for (const d of state.designs) {
            // Mismo guard que el where real: solo diseños de ESTA sesión y sin customer.
            if (
              where.id.in.includes(d.id) &&
              d.sessionId === where.sessionId &&
              d.customerId === where.customerId
            ) {
              if (data.customerId !== undefined) d.customerId = data.customerId;
              if (data.sessionId !== undefined) d.sessionId = data.sessionId;
              count++;
            }
          }
          return { count };
        },
      ),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  return { prisma };
});

import { mergeAnonCartIntoCustomer } from "./service";

const CANVAS_CON_PROGRESO = { version: 2, slots: [{ slotIndex: 0, assetId: "foto-A" }] };
const CANVAS_VACIO = { version: 2, slots: [{ slotIndex: 0 }] };

function seedDesign(over: Partial<DesignFixture> & { id: string }): DesignFixture {
  const design: DesignFixture = {
    sessionId: "sess_anon",
    customerId: null,
    status: "DRAFT",
    canvasData: CANVAS_CON_PROGRESO,
    metadata: null,
    ...over,
  };
  state.designs.push(design);
  return design;
}

function seedCart(over: Partial<CartFixture> & { sessionId: string }): CartFixture {
  const cart: CartFixture = {
    id: `cart_${over.sessionId}`,
    customerId: null,
    deletedAt: null,
    items: [],
    ...over,
  };
  state.carts.push(cart);
  return cart;
}

beforeEach(() => {
  state.carts = [];
  state.designs = [];
});

describe("mergeAnonCartIntoCustomer — adopción de borradores DRAFT al login", () => {
  it("SIN carrito anónimo: el borrador con progreso real se adopta igual (causa raíz del A2)", async () => {
    const draft = seedDesign({ id: "d_draft" });

    const result = await mergeAnonCartIntoCustomer("sess_anon", "cust_1");

    expect(result).toBe("sess_anon");
    expect(draft.customerId).toBe("cust_1");
    expect(draft.sessionId).toBeNull();
  });

  it("borrador VACÍO (sin progreso real) NO se adopta: sigue anónimo para la purga por edad", async () => {
    const draft = seedDesign({ id: "d_vacio", canvasData: CANVAS_VACIO });

    await mergeAnonCartIntoCustomer("sess_anon", "cust_1");

    expect(draft.customerId).toBeNull();
    expect(draft.sessionId).toBe("sess_anon");
  });

  it("borrador de OTRA sesión NO se adopta (guard anti-adopción-ajena)", async () => {
    const ajeno = seedDesign({ id: "d_ajeno", sessionId: "sess_otra" });

    await mergeAnonCartIntoCustomer("sess_anon", "cust_1");

    expect(ajeno.customerId).toBeNull();
    expect(ajeno.sessionId).toBe("sess_otra");
  });

  it("diseño que YA tiene customer NO se toca", async () => {
    const deOtro = seedDesign({ id: "d_de_otro", customerId: "cust_2" });

    await mergeAnonCartIntoCustomer("sess_anon", "cust_1");

    expect(deOtro.customerId).toBe("cust_2");
    expect(deOtro.sessionId).toBe("sess_anon");
  });

  it("diseño READY sin referencia en el carrito NO lo toca la adopción de borradores", async () => {
    const ready = seedDesign({ id: "d_ready", status: "READY" });

    await mergeAnonCartIntoCustomer("sess_anon", "cust_1");

    expect(ready.customerId).toBeNull();
    expect(ready.sessionId).toBe("sess_anon");
  });

  it("con carrito anónimo vacío: adopta el borrador y reasigna el carrito al customer", async () => {
    const draft = seedDesign({ id: "d_draft" });
    seedCart({ sessionId: "sess_anon" });

    const result = await mergeAnonCartIntoCustomer("sess_anon", "cust_1");

    expect(result).toBe("sess_anon");
    expect(draft.customerId).toBe("cust_1");
    expect(draft.sessionId).toBeNull();
  });

  it("con carrito del customer preexistente: adopta el borrador y devuelve la sesión del customer", async () => {
    const draft = seedDesign({ id: "d_draft" });
    seedCart({ sessionId: "sess_anon" });
    seedCart({ sessionId: "sess_cust", customerId: "cust_1" });

    const result = await mergeAnonCartIntoCustomer("sess_anon", "cust_1");

    expect(result).toBe("sess_cust");
    expect(draft.customerId).toBe("cust_1");
    expect(draft.sessionId).toBeNull();
  });

  it("carrito de la sesión pertenece a OTRO customer → nada se adopta (sesión tratada como ajena)", async () => {
    const draft = seedDesign({ id: "d_draft" });
    seedCart({ sessionId: "sess_anon", customerId: "cust_2" });

    await mergeAnonCartIntoCustomer("sess_anon", "cust_1");

    expect(draft.customerId).toBeNull();
    expect(draft.sessionId).toBe("sess_anon");
  });
});
