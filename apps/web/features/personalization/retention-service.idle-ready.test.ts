/*
 * Purga de diseños READY ABANDONADOS (ADR-130, 2026-10-08 — diagnóstico degradación STG).
 *
 * Hasta ADR-130 ninguna retención cubría un READY que nunca llegó a pedido: «Ver diseño»
 * genera renders 300-DPI en production-assets (~2.6 MB/unidad) y esos bytes se quedaban
 * para siempre si el cliente no ordenaba (fuga medida en STG: 575 renders / 1.5 GB, 2× la
 * cuota Free de Storage). purgeIdleReadyDesigns (retention-service.ts) la cierra con las
 * mismas guardas conservadoras de las pasadas hermanas: idle ≥90d, sin carrito VIVO (el
 * soft-borrado no blinda), sin pedido y sin cotización vigente.
 *
 * Lo que NO toca queda fijado acá: DRAFT (los cubren purgeAbandonedAnonymousDesigns y
 * purgeIdleCustomerDesigns), USED_IN_ORDER (lo rige retention-delivered.ts), ARCHIVED
 * (decisión explícita del cliente) y READY reciente o reclamado por carrito/pedido/cotización.
 * Aplica a anónimos y logueados por igual (customerId indistinto en el where).
 *
 * Sin DB, mismo enfoque que retention-service.idle-customer.test.ts: fake de Prisma que EVALÚA
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

const NOW = new Date("2026-10-08T12:00:00.000Z");
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
    status: "READY",
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
  // — los casos felices: READY idle 120d que nadie reclama → purga (logueado o anónimo) —
  { design: design("ready-idle-logueado"), purge: true },
  { design: design("ready-idle-anonimo", { customerId: null }), purge: true },
  { design: design("ready-carrito-muerto", { cartItems: deadCart }), purge: true },
  {
    design: design("ready-cotizacion-apagada", {
      quotes: [{ status: "DISCARDED", updatedAt: daysAgo(200), deletedAt: null }],
    }),
    purge: true,
  },

  // — guardas: actividad reciente, carrito vivo, pedido o cotización viva → conserva —
  { design: design("ready-reciente", { updatedAt: daysAgo(10) }), purge: false },
  { design: design("ready-en-carrito-vivo", { cartItems: liveCart }), purge: false },
  { design: design("ready-con-pedido", { orderItems: 1 }), purge: false },
  {
    design: design("ready-cotizacion-viva", {
      quotes: [{ status: "PENDING", updatedAt: daysAgo(5), deletedAt: null }],
    }),
    purge: false,
  },
  {
    design: design("ready-cotizacion-cerrada-en-gracia", {
      quotes: [{ status: "CLOSED", updatedAt: daysAgo(10), deletedAt: null }],
    }),
    purge: false,
  },

  // — estados que esta pasada NUNCA toca —
  { design: design("draft-viejo", { status: "DRAFT" }), purge: false },
  { design: design("usado-en-pedido", { status: "USED_IN_ORDER", orderItems: 1 }), purge: false },
  { design: design("archivado", { status: "ARCHIVED" }), purge: false },
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
            productionUrls: [`prod/${d.id}-1.png`, `prod/${d.id}-2.png`],
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

import { purgeIdleReadyDesigns } from "./retention-service";

beforeEach(() => {
  rows = CASES.map((c) => ({ ...c.design }));
  deletedIds.length = 0;
  quoteItemUpdates.length = 0;
  removeMock.mockClear();
  removeMock.mockResolvedValue({ error: null });
  listMock.mockClear();
  listMock.mockResolvedValue({ data: [], error: null });
});

const runPurge = () => purgeIdleReadyDesigns({ now: NOW });

describe("purga de READYs abandonados (ADR-130, 2026-10-08)", () => {
  it.each(CASES.filter((c) => c.purge).map((c) => c.design.id))("PURGA %s", async (id) => {
    await runPurge();
    expect(deletedIds).toContain(id);
  });

  it.each(CASES.filter((c) => !c.purge).map((c) => c.design.id))("CONSERVA %s", async (id) => {
    await runPurge();
    expect(deletedIds).not.toContain(id);
  });

  it("borra fotos crudas, previews y renders 300-DPI de lo purgado y de nada más", async () => {
    await runPurge();
    const removedByBucket = new Map<string, string[]>();
    for (const call of removeMock.mock.calls) {
      // El mock de storage.from() comparte removeMock entre buckets; el orden de
      // llamadas de purgeDesignBatch es uploads → previews → producción.
      removedByBucket.set("flat", [
        ...(removedByBucket.get("flat") ?? []),
        ...(call as unknown as [string[]])[0],
      ]);
    }
    const removed = removedByBucket.get("flat") ?? [];
    for (const c of CASES) {
      expect(removed.includes(`uploads/${c.design.id}.jpg`)).toBe(c.purge);
      expect(removed.includes(`${c.design.id}.png`)).toBe(c.purge); // preview path
      expect(removed.includes(`prod/${c.design.id}-1.png`)).toBe(c.purge); // render 300-DPI
    }
  });

  it("respeta el override de días (con 30d también purga ready-reciente… no: 10d sigue fuera)", async () => {
    const res = await purgeIdleReadyDesigns({ now: NOW, olderThanDays: 30 });
    // Con 30d: purga los 4 idle de 120d; "ready-reciente" (10d) sigue protegido por recencia.
    expect(res.designsPurged).toBe(4);
    expect(deletedIds).not.toContain("ready-reciente");
  });

  it("si falla el borrado de los bytes, NO borra filas (reintento en el próximo ciclo)", async () => {
    removeMock.mockResolvedValue({ error: { message: "storage caído" } });

    const res = await runPurge();

    expect(deletedIds).toHaveLength(0);
    expect(res.designsPurged).toBe(0);
  });

  it("honra la env var PURGE_IDLE_READY_AFTER_DAYS cuando no hay override explícito", async () => {
    process.env.PURGE_IDLE_READY_AFTER_DAYS = "200";
    try {
      const res = await runPurge();
      // Con 200d NADIE es elegible (los más viejos tienen 120d).
      expect(res.designsPurged).toBe(0);
    } finally {
      delete process.env.PURGE_IDLE_READY_AFTER_DAYS;
    }
  });
});
