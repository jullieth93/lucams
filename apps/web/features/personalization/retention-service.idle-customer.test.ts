/*
 * Purga de DRAFTs IDLE de clientes LOGUEADOS (feedback Lucy 2026-09-18 · Ley 1581 art. 4 lit. f).
 *
 * La política original de retención excluía TODO diseño con customerId (lo "rige el ciclo de vida
 * de la cuenta"): un boceto de hace 2 años de una cuenta viva conservaba sus fotos crudas para
 * siempre, sin finalidad vigente. purgeIdleCustomerDesigns (retention-service.ts) cierra esa
 * brecha con las mismas guardas que la purga anónima: sin carrito VIVO (el soft-borrado no
 * blinda), sin pedido y sin cotización vigente.
 *
 * Lo que NO toca queda fijado acá: READY (cotizado o no), USED_IN_ORDER (lo rige
 * retention-delivered.ts), ARCHIVED (decisión explícita del cliente) y anónimos (los cubre la
 * pasada hermana, purgeAbandonedAnonymousDesigns).
 *
 * Sin DB, mismo enfoque que retention-service.quote-lifecycle.test.ts: fake de Prisma que EVALÚA
 * el `where` y lanza ante operadores no modelados (si la política cambia, el test se cae).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const removeMock = vi.hoisted(() =>
  vi.fn(async (_paths: string[]) => ({ error: null as { message: string } | null })),
);
const listMock = vi.hoisted(() =>
  vi.fn(async (_prefix: string) => ({
    data: [] as { name: string }[],
    error: null as { message: string } | null,
  })),
);

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/supabase/service", () => ({
  supabaseService: { storage: { from: () => ({ remove: removeMock, list: listMock }) } },
}));

// ─────────────────────────── filas en memoria ───────────────────────────

const NOW = new Date("2026-09-18T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY_MS);

type FakeQuote = { status: string; updatedAt: Date; deletedAt: Date | null };
type FakeDesign = {
  id: string;
  status: string;
  customerId: string | null;
  updatedAt: Date;
  cartItems: Array<{ cartDeletedAt: Date | null }>;
  orderItems: number;
  quotes: FakeQuote[];
};

function design(id: string, over: Partial<FakeDesign> = {}): FakeDesign {
  return {
    id,
    status: "DRAFT",
    customerId: `cus-${id}`,
    updatedAt: daysAgo(120), // idle ≥90d por defecto
    cartItems: [],
    orderItems: 0,
    quotes: [],
    ...over,
  };
}

const liveCart = [{ cartDeletedAt: null }];
const deadCart = [{ cartDeletedAt: daysAgo(100) }];

const CASES: Array<{ design: FakeDesign; purge: boolean }> = [
  // — el caso feliz: DRAFT logueado, 120 días sin tocarlo, nada lo reclama → purga —
  { design: design("idle-sin-nada"), purge: true },
  { design: design("idle-carrito-muerto", { cartItems: deadCart }), purge: true },
  {
    design: design("idle-cotizacion-apagada", {
      cartItems: deadCart,
      quotes: [{ status: "CLOSED", updatedAt: daysAgo(200), deletedAt: null }],
    }),
    purge: true,
  },

  // — guardas: actividad reciente, carrito vivo, pedido o cotización viva → conserva —
  { design: design("reciente", { updatedAt: daysAgo(30) }), purge: false },
  { design: design("en-carrito-vivo", { cartItems: liveCart }), purge: false },
  { design: design("con-pedido", { orderItems: 1 }), purge: false },
  {
    design: design("cotizacion-viva", {
      quotes: [{ status: "PENDING", updatedAt: daysAgo(5), deletedAt: null }],
    }),
    purge: false,
  },
  {
    design: design("cotizacion-cerrada-en-gracia", {
      quotes: [{ status: "CLOSED", updatedAt: daysAgo(10), deletedAt: null }],
    }),
    purge: false,
  },

  // — estados que esta pasada NUNCA toca —
  { design: design("ready-viejo", { status: "READY" }), purge: false },
  { design: design("usado-en-pedido", { status: "USED_IN_ORDER", orderItems: 1 }), purge: false },
  { design: design("archivado", { status: "ARCHIVED" }), purge: false },
  { design: design("anonimo", { customerId: null }), purge: false }, // lo cubre la pasada anónima
];

// ─────────────── fake de Prisma que EVALÚA el where en memoria ───────────────

let rows: FakeDesign[] = [];
const deletedIds: string[] = [];
const quoteItemUpdates: string[] = [];

class UnsupportedFilter extends Error {
  constructor(detail: string) {
    super(`El fake no modela este filtro (¿cambió la política?): ${detail}`);
  }
}

function matchesQuote(where: Record<string, unknown>, q: FakeQuote): boolean {
  return Object.entries(where).every(([key, value]) => {
    switch (key) {
      case "OR":
        return (value as Array<Record<string, unknown>>).some((w) => matchesQuote(w, q));
      case "deletedAt":
        if (value !== null) throw new UnsupportedFilter(`quote.deletedAt=${String(value)}`);
        return q.deletedAt === null;
      case "status": {
        const inList = (value as { in?: string[] }).in;
        if (!inList) throw new UnsupportedFilter(`quote.status=${JSON.stringify(value)}`);
        return inList.includes(q.status);
      }
      case "updatedAt": {
        const gte = (value as { gte?: Date }).gte;
        if (!gte) throw new UnsupportedFilter(`quote.updatedAt=${JSON.stringify(value)}`);
        return q.updatedAt.getTime() >= gte.getTime();
      }
      default:
        throw new UnsupportedFilter(`quote.${key}`);
    }
  });
}

function matchesDesign(where: Record<string, unknown>, d: FakeDesign): boolean {
  return Object.entries(where).every(([key, value]) => {
    switch (key) {
      case "status":
        return d.status === value;
      case "customerId": {
        const f = value as { not?: null; startsWith?: string };
        if (f.not !== null) throw new UnsupportedFilter(`customerId=${JSON.stringify(value)}`);
        if (d.customerId === null) return false;
        return f.startsWith ? d.customerId.startsWith(f.startsWith) : true;
      }
      case "updatedAt": {
        const lt = (value as { lt?: Date }).lt;
        if (!lt) throw new UnsupportedFilter(`updatedAt=${JSON.stringify(value)}`);
        return d.updatedAt.getTime() < lt.getTime();
      }
      case "cartItems": {
        const none = (value as { none?: { cart?: { deletedAt?: null } } }).none;
        if (!none?.cart || none.cart.deletedAt !== null) {
          throw new UnsupportedFilter(`cartItems=${JSON.stringify(value)}`);
        }
        return !d.cartItems.some((ci) => ci.cartDeletedAt === null);
      }
      case "orderItems": {
        const none = (value as { none?: Record<string, unknown> }).none;
        if (!none || Object.keys(none).length > 0) {
          throw new UnsupportedFilter(`orderItems=${JSON.stringify(value)}`);
        }
        return d.orderItems === 0;
      }
      case "quoteItems": {
        const none = (value as { none?: { quote?: Record<string, unknown> } }).none;
        if (!none?.quote) throw new UnsupportedFilter(`quoteItems=${JSON.stringify(value)}`);
        return !d.quotes.some((q) => matchesQuote(none.quote!, q));
      }
      default:
        throw new UnsupportedFilter(`design.${key}`);
    }
  });
}

vi.mock("@/lib/db", () => ({
  prisma: {
    design: {
      findMany: async ({ where, take }: { where: Record<string, unknown>; take: number }) =>
        rows
          .filter((d) => matchesDesign(where, d))
          .slice(0, take)
          .map((d) => ({
            id: d.id,
            previewUrl: `https://cdn.test/storage/v1/object/public/design-previews/${d.id}.png`,
            productionUrls: [],
            assets: [{ storageUrl: `uploads/${d.id}.jpg` }],
          })),
      deleteMany: async ({ where }: { where: { id: { in: string[] } } }) => {
        deletedIds.push(...where.id.in);
        rows = rows.filter((d) => !where.id.in.includes(d.id));
        return { count: where.id.in.length };
      },
    },
    designAsset: {
      deleteMany: async () => ({ count: 0 }),
    },
    quoteItem: {
      updateMany: async ({ where }: { where: { designId: { in: string[] } } }) => {
        quoteItemUpdates.push(...where.designId.in);
        return { count: where.designId.in.length };
      },
    },
    $transaction: async (ops: Array<Promise<unknown>>) => Promise.all(ops),
  },
}));

import { purgeIdleCustomerDesigns } from "./retention-service";

beforeEach(() => {
  rows = CASES.map((c) => ({ ...c.design }));
  deletedIds.length = 0;
  quoteItemUpdates.length = 0;
  removeMock.mockClear();
  removeMock.mockResolvedValue({ error: null });
  listMock.mockClear();
  listMock.mockResolvedValue({ data: [], error: null });
});

const runPurge = () => purgeIdleCustomerDesigns({ now: NOW });

describe("purga de DRAFTs idle de clientes logueados (feedback Lucy 2026-09-18)", () => {
  it.each(CASES.filter((c) => c.purge).map((c) => c.design.id))("PURGA %s", async (id) => {
    await runPurge();
    expect(deletedIds).toContain(id);
  });

  it.each(CASES.filter((c) => !c.purge).map((c) => c.design.id))("CONSERVA %s", async (id) => {
    await runPurge();
    expect(deletedIds).not.toContain(id);
  });

  it("borra las fotos crudas de lo purgado y de nada más", async () => {
    await runPurge();
    const removedUploads = removeMock.mock.calls.flatMap(
      (call) => (call as unknown as [string[]])[0],
    );
    for (const c of CASES) {
      expect(removedUploads.includes(`uploads/${c.design.id}.jpg`)).toBe(c.purge);
    }
  });

  it("respeta el override de días (con 30d purga solo los 3 idle sin guardas)", async () => {
    const res = await purgeIdleCustomerDesigns({ now: NOW, olderThanDays: 30 });
    // Cutoff estricto (lt): "reciente" (justo 30d) queda fuera; las guardas de carrito vivo,
    // pedido y cotización viva siguen protegiendo a los suyos.
    expect(res.designsPurged).toBe(3);
    expect(deletedIds.sort()).toEqual(
      ["idle-carrito-muerto", "idle-cotizacion-apagada", "idle-sin-nada"].sort(),
    );
  });

  it("si falla el borrado de los bytes, NO borra filas (reintento en el próximo ciclo)", async () => {
    removeMock.mockResolvedValue({ error: { message: "storage caído" } });

    const res = await runPurge();

    expect(deletedIds).toHaveLength(0);
    expect(res.designsPurged).toBe(0);
  });
});
