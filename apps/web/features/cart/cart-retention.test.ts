/*
 * Retención de carritos (2026-10-12): los Cart/AbandonedCart nunca expiraban y un carrito
 * VIVO blindaba sus diseños para siempre (guard NO_LIVE_CART_ITEM de retention-service).
 *
 * FOCO:
 *  - purgeStaleCarts: hard-delete de carts VIVOS idle ≥60d (o vacíos ≥7d) SIN registro de
 *    abandono. NO toca soft-borrados, carts con actividad reciente ni carts con un
 *    AbandonedCart (link de recuperación potencialmente vivo). NO borra diseños: al caer el
 *    cart quedan libres para la purga normal.
 *  - purgeAbandonedCarts: borra registros AbandonedCart ≥90d (recuperados o no).
 *
 * Sin DB, mismo enfoque que retention-service.idle-ready.test.ts: fake de Prisma que EVALÚA
 * el `where` y lanza ante operadores no modelados (si la política cambia, el test se cae).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─────────────────────────── filas en memoria ───────────────────────────

const NOW = new Date("2026-10-12T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY_MS);

type FakeCart = {
  id: string;
  deletedAt: Date | null;
  updatedAt: Date;
  items: number;
  hasAbandoned: boolean;
};

function cart(id: string, over: Partial<FakeCart> = {}): FakeCart {
  return { id, deletedAt: null, updatedAt: daysAgo(90), items: 2, hasAbandoned: false, ...over };
}

const CASES: Array<{ cart: FakeCart; purge: boolean }> = [
  // — los casos felices —
  { cart: cart("idle-90d"), purge: true },
  { cart: cart("idle-61d", { updatedAt: daysAgo(61) }), purge: true },
  { cart: cart("vacio-10d", { updatedAt: daysAgo(10), items: 0 }), purge: true },
  { cart: cart("vacio-idle-90d", { items: 0 }), purge: true },

  // — guardas —
  { cart: cart("activo-30d", { updatedAt: daysAgo(30) }), purge: false },
  { cart: cart("vacio-reciente-3d", { updatedAt: daysAgo(3), items: 0 }), purge: false },
  { cart: cart("soft-borrado", { deletedAt: daysAgo(200) }), purge: false },
  { cart: cart("con-abandoned", { hasAbandoned: true }), purge: false },
  { cart: cart("vacio-con-abandoned", { items: 0, hasAbandoned: true }), purge: false },
];

// ─────────────── fake de Prisma que EVALÚA el where en memoria ───────────────

let carts: FakeCart[] = [];
let abandoned: Array<{ id: string; createdAt: Date }> = [];
const deletedCartIds: string[] = [];
const deletedAbandonedIds: string[] = [];

class UnsupportedFilter extends Error {
  constructor(detail: string) {
    super(`El fake no modela este filtro (¿cambió la política?): ${detail}`);
  }
}

function matchesCart(where: Record<string, unknown>, c: FakeCart): boolean {
  return Object.entries(where).every(([key, value]) => {
    switch (key) {
      case "deletedAt":
        if (value !== null) throw new UnsupportedFilter(`deletedAt=${String(value)}`);
        return c.deletedAt === null;
      case "abandoned":
        if (value !== null) throw new UnsupportedFilter(`abandoned=${String(value)}`);
        return !c.hasAbandoned;
      case "OR": {
        const branches = value as Array<Record<string, unknown>>;
        return branches.some((b) =>
          Object.entries(b).every(([bk, bv]) => {
            switch (bk) {
              case "updatedAt": {
                const lt = (bv as { lt?: Date }).lt;
                if (!lt) throw new UnsupportedFilter(`OR.updatedAt=${JSON.stringify(bv)}`);
                return c.updatedAt.getTime() < lt.getTime();
              }
              case "items": {
                const none = (bv as { none?: Record<string, unknown> }).none;
                if (!none || Object.keys(none).length > 0) {
                  throw new UnsupportedFilter(`OR.items=${JSON.stringify(bv)}`);
                }
                return c.items === 0;
              }
              default:
                throw new UnsupportedFilter(`OR.${bk}`);
            }
          }),
        );
      }
      default:
        throw new UnsupportedFilter(`cart.${key}`);
    }
  });
}

vi.mock("@/lib/db", () => ({
  prisma: {
    cart: {
      findMany: async ({ where, take }: { where: Record<string, unknown>; take: number }) =>
        carts
          .filter((c) => matchesCart(where, c))
          .slice(0, take)
          .map((c) => ({ id: c.id })),
      deleteMany: async ({ where }: { where: { id: { in: string[] } } }) => {
        deletedCartIds.push(...where.id.in);
        carts = carts.filter((c) => !where.id.in.includes(c.id));
        return { count: where.id.in.length };
      },
    },
    abandonedCart: {
      findMany: async ({ where, take }: { where: { createdAt: { lt: Date } }; take: number }) =>
        abandoned
          .filter((a) => a.createdAt.getTime() < where.createdAt.lt.getTime())
          .slice(0, take)
          .map((a) => ({ id: a.id })),
      deleteMany: async ({ where }: { where: { id: { in: string[] } } }) => {
        deletedAbandonedIds.push(...where.id.in);
        abandoned = abandoned.filter((a) => !where.id.in.includes(a.id));
        return { count: where.id.in.length };
      },
    },
  },
}));

import { purgeAbandonedCarts, purgeStaleCarts } from "./cart-retention";

beforeEach(() => {
  carts = CASES.map((c) => ({ ...c.cart }));
  abandoned = [
    { id: "ab-viejo-100d", createdAt: daysAgo(100) },
    { id: "ab-reciente-30d", createdAt: daysAgo(30) },
  ];
  deletedCartIds.length = 0;
  deletedAbandonedIds.length = 0;
});

describe("purgeStaleCarts (2026-10-12)", () => {
  it.each(CASES.filter((c) => c.purge).map((c) => c.cart.id))("PURGA %s", async (id) => {
    await purgeStaleCarts({ now: NOW });
    expect(deletedCartIds).toContain(id);
  });

  it.each(CASES.filter((c) => !c.purge).map((c) => c.cart.id))("CONSERVA %s", async (id) => {
    await purgeStaleCarts({ now: NOW });
    expect(deletedCartIds).not.toContain(id);
  });

  it("hard-delete (deleteMany sobre Cart; CartItem cae por CASCADE) y reporta el conteo", async () => {
    const res = await purgeStaleCarts({ now: NOW });
    expect(res.cartsPurged).toBe(4);
  });

  it("respeta el override de días", async () => {
    const res = await purgeStaleCarts({ now: NOW, staleDays: 20 });
    expect(deletedCartIds).toContain("activo-30d");
    expect(res.cartsPurged).toBe(5);
  });

  it("acota por batchSize", async () => {
    const res = await purgeStaleCarts({ now: NOW, batchSize: 2 });
    expect(res.cartsPurged).toBe(2);
  });
});

describe("purgeAbandonedCarts (2026-10-12)", () => {
  it("borra registros ≥90d y conserva los recientes", async () => {
    const res = await purgeAbandonedCarts({ now: NOW });

    expect(deletedAbandonedIds).toEqual(["ab-viejo-100d"]);
    expect(res.abandonedPurged).toBe(1);
  });

  it("sin registros viejos no llama deleteMany", async () => {
    abandoned = [{ id: "ab-reciente-30d", createdAt: daysAgo(30) }];
    const res = await purgeAbandonedCarts({ now: NOW });
    expect(res.abandonedPurged).toBe(0);
    expect(deletedAbandonedIds).toHaveLength(0);
  });
});
