/*
 * Retención de fotos de invitados que pasaron por una COTIZACIÓN
 * (auditoría 2026-07-21 · C-gap2 · Ley 1581 art. 5 — minimización).
 *
 * Regresión del hallazgo: la purga blindaba el diseño con `cartItems: { none: {} }`, y la cotización
 * de Etapa 1 vacía el carrito con `clearCartAfterPaid`, que SOFT-borra el Cart y deja vivos sus
 * CartItem → la foto de todo invitado que cotizó quedaba retenida para siempre.
 *
 * Sin DB (mandato del grupo: nada de escrituras contra la Supabase compartida). Se sustituye Prisma
 * por un fake que EVALÚA el `where` contra filas en memoria — así el test mide la POLÍTICA y no la
 * forma del objeto. El fake solo entiende los operadores que usa retention-service y LANZA ante
 * cualquier otro: si la política se reescribe con operadores nuevos, el test se cae en vez de pasar
 * por vacío (limitación conocida: el fake es una réplica reducida de Prisma; el barrido real contra
 * Postgres lo cubre retention-service.integration.test.ts).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const removeMock = vi.hoisted(() =>
  vi.fn(async (_paths: string[]) => ({ error: null as { message: string } | null })),
);
/*
 * `list` existe porque la purga tiene que descubrir el área de paso `{designId}/_client/` (ADR-081):
 * esos PNG no viven en ninguna columna, así que la única forma de encontrarlos es listar el prefijo.
 * Por defecto devuelve vacío —el caso normal— y un caso concreto lo puebla para comprobar que sí se
 * borran.
 */
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

const NOW = new Date("2026-07-24T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY_MS);

type FakeQuote = {
  status: "PENDING" | "CONTACTED" | "CLOSED" | "DISCARDED";
  updatedAt: Date;
  deletedAt: Date | null;
};

type FakeDesign = {
  id: string;
  status: "DRAFT" | "READY" | "USED_IN_ORDER" | "ARCHIVED";
  customerId: string | null;
  sessionId: string;
  updatedAt: Date;
  /** Un CartItem por entrada; `cartDeletedAt` = soft-delete del Cart que lo contiene. */
  cartItems: Array<{ cartDeletedAt: Date | null }>;
  orderItems: number;
  quotes: FakeQuote[];
};

function design(id: string, over: Partial<FakeDesign> = {}): FakeDesign {
  return {
    id,
    status: "DRAFT",
    customerId: null,
    sessionId: `sess-${id}`,
    updatedAt: daysAgo(200),
    cartItems: [],
    orderItems: 0,
    quotes: [],
    ...over,
  };
}

const deadCart = [{ cartDeletedAt: daysAgo(180) }];
const liveCart = [{ cartDeletedAt: null }];

/** Escenarios: el nombre dice la situación; `purge` es el veredicto esperado. */
const CASES: Array<{ design: FakeDesign; purge: boolean }> = [
  // — comportamiento previo, intacto —
  { design: design("draft-abandonado"), purge: true },
  { design: design("draft-reciente", { updatedAt: daysAgo(5) }), purge: false },
  { design: design("draft-con-dueno", { customerId: "cus_1" }), purge: false },
  { design: design("draft-en-carrito-vivo", { cartItems: liveCart }), purge: false },
  { design: design("draft-con-pedido", { orderItems: 1 }), purge: false },
  { design: design("ready-nunca-cotizado", { status: "READY" }), purge: false },

  // — el hallazgo: carrito MUERTO ya no blinda —
  { design: design("draft-en-carrito-muerto", { cartItems: deadCart }), purge: true },

  // — cotización viva: la foto se conserva —
  {
    design: design("draft-cotizacion-pendiente", {
      cartItems: deadCart,
      quotes: [{ status: "PENDING", updatedAt: daysAgo(2), deletedAt: null }],
    }),
    purge: false,
  },
  {
    design: design("ready-cotizacion-contactada", {
      status: "READY",
      cartItems: deadCart,
      quotes: [{ status: "CONTACTED", updatedAt: daysAgo(10), deletedAt: null }],
    }),
    purge: false,
  },
  {
    design: design("ready-cerrada-dentro-de-gracia", {
      status: "READY",
      cartItems: deadCart,
      quotes: [{ status: "CLOSED", updatedAt: daysAgo(30), deletedAt: null }],
    }),
    purge: false,
  },
  {
    design: design("ready-dos-cotizaciones-una-viva", {
      status: "READY",
      cartItems: deadCart,
      quotes: [
        { status: "CLOSED", updatedAt: daysAgo(200), deletedAt: null },
        { status: "PENDING", updatedAt: daysAgo(5), deletedAt: null },
      ],
    }),
    purge: false,
  },
  {
    design: design("ready-cerrada-vieja-pero-con-pedido", {
      status: "READY",
      cartItems: deadCart,
      orderItems: 1,
      quotes: [{ status: "CLOSED", updatedAt: daysAgo(200), deletedAt: null }],
    }),
    purge: false,
  },

  // — cotización apagada y vencida: la foto se purga —
  {
    design: design("ready-cerrada-vieja", {
      status: "READY",
      cartItems: deadCart,
      quotes: [{ status: "CLOSED", updatedAt: daysAgo(200), deletedAt: null }],
    }),
    purge: true,
  },
  {
    design: design("ready-descartada-vieja", {
      status: "READY",
      cartItems: deadCart,
      quotes: [{ status: "DISCARDED", updatedAt: daysAgo(120), deletedAt: null }],
    }),
    purge: true,
  },
  {
    design: design("ready-cotizacion-borrada", {
      status: "READY",
      cartItems: deadCart,
      quotes: [{ status: "PENDING", updatedAt: daysAgo(200), deletedAt: daysAgo(200) }],
    }),
    purge: true,
  },
  {
    design: design("ready-pendiente-fosilizada", {
      status: "READY",
      cartItems: deadCart,
      quotes: [{ status: "PENDING", updatedAt: daysAgo(400), deletedAt: null }],
    }),
    purge: true,
  },
];

// ─────────────── fake de Prisma que EVALÚA el where en memoria ───────────────

let rows: FakeDesign[] = [];
const deletedIds: string[] = [];
const quoteItemUpdates: Array<{ ids: string[] }> = [];

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
      case "AND":
        return (value as Array<Record<string, unknown>>).every((w) => matchesDesign(w, d));
      case "status":
        return d.status === value;
      case "customerId":
        if (value !== null) throw new UnsupportedFilter(`customerId=${String(value)}`);
        return d.customerId === null;
      case "updatedAt": {
        const lt = (value as { lt?: Date }).lt;
        if (!lt) throw new UnsupportedFilter(`updatedAt=${JSON.stringify(value)}`);
        return d.updatedAt.getTime() < lt.getTime();
      }
      case "sessionId": {
        const prefix = (value as { startsWith?: string }).startsWith;
        if (!prefix) throw new UnsupportedFilter(`sessionId=${JSON.stringify(value)}`);
        return d.sessionId.startsWith(prefix);
      }
      case "cartItems": {
        const none = (value as { none?: Record<string, unknown> }).none;
        if (!none) throw new UnsupportedFilter(`cartItems=${JSON.stringify(value)}`);
        // `{ none: {} }` = cualquier CartItem bloquea (comportamiento viejo).
        if (Object.keys(none).length === 0) return d.cartItems.length === 0;
        const cart = none.cart as { deletedAt?: null } | undefined;
        if (!cart || !("deletedAt" in cart) || cart.deletedAt !== null) {
          throw new UnsupportedFilter(`cartItems.none=${JSON.stringify(none)}`);
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
        const filter = value as {
          none?: { quote?: Record<string, unknown> };
          some?: Record<string, unknown>;
        };
        if (filter.some) {
          if (Object.keys(filter.some).length > 0) {
            throw new UnsupportedFilter(`quoteItems.some=${JSON.stringify(filter.some)}`);
          }
          return d.quotes.length > 0;
        }
        if (!filter.none) throw new UnsupportedFilter(`quoteItems=${JSON.stringify(value)}`);
        if (Object.keys(filter.none).length === 0) return d.quotes.length === 0;
        const quoteWhere = filter.none.quote;
        if (!quoteWhere)
          throw new UnsupportedFilter(`quoteItems.none=${JSON.stringify(filter.none)}`);
        return !d.quotes.some((q) => matchesQuote(quoteWhere, q));
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
      findMany: async () => [],
      deleteMany: async () => ({ count: 0 }),
    },
    quoteItem: {
      updateMany: async ({ where }: { where: { designId: { in: string[] } } }) => {
        quoteItemUpdates.push({ ids: where.designId.in });
        return { count: where.designId.in.length };
      },
    },
    $transaction: async (ops: Array<Promise<unknown>>) => Promise.all(ops),
  },
}));

import { purgeAbandonedAnonymousDesigns } from "./retention-service";

beforeEach(() => {
  rows = CASES.map((c) => ({ ...c.design }));
  deletedIds.length = 0;
  quoteItemUpdates.length = 0;
  removeMock.mockClear();
  removeMock.mockResolvedValue({ error: null });
  listMock.mockClear();
  listMock.mockResolvedValue({ data: [], error: null });
});

const runPurge = () => purgeAbandonedAnonymousDesigns({ now: NOW });

describe("purga de diseños anónimos — ciclo de vida de la cotización", () => {
  it.each(CASES.filter((c) => c.purge).map((c) => c.design.id))("PURGA %s", async (id) => {
    await runPurge();
    expect(deletedIds).toContain(id);
  });

  it.each(CASES.filter((c) => !c.purge).map((c) => c.design.id))("CONSERVA %s", async (id) => {
    await runPurge();
    expect(deletedIds).not.toContain(id);
  });

  it("borra los bytes de las fotos crudas de lo purgado y de nada más", async () => {
    await runPurge();

    const removedUploads = removeMock.mock.calls.flatMap(
      (call) => (call as unknown as [string[]])[0],
    );
    for (const c of CASES) {
      expect(removedUploads.includes(`uploads/${c.design.id}.jpg`)).toBe(c.purge);
    }
  });

  it("limpia el preview colgado en la cotización (sus bytes ya no existen)", async () => {
    await runPurge();

    const cleaned = quoteItemUpdates.flatMap((u) => u.ids);
    expect(cleaned).toContain("ready-cerrada-vieja");
    expect(cleaned).not.toContain("ready-cerrada-dentro-de-gracia");
  });

  it("cuenta lo purgado (diseños + fotos) para el heartbeat del cron", async () => {
    const res = await runPurge();

    const expected = CASES.filter((c) => c.purge).length;
    expect(res.designsPurged).toBe(expected);
    expect(res.assetsPurged).toBe(expected); // una foto por diseño en el fixture
  });

  /*
   * ADR-081 — los snapshots que el cliente sube DIRECTO a Storage viven bajo `{designId}/_client/` y
   * no se persisten en ninguna columna: `Design.productionUrls` solo guarda los archivos definitivos.
   * Si el cliente abandona después de subirlos, nadie más los conoce. Y son el render de SUS fotos,
   * o sea datos personales: dejarlos en el bucket para siempre contradice el principio de
   * temporalidad de la Ley 1581 (Decreto 1074 de 2015, art. 2.2.2.25.2.8).
   */
  it("borra también el área de paso de los snapshots del cliente", async () => {
    listMock.mockResolvedValue({ data: [{ name: "slot-01.png" }], error: null });

    await runPurge();

    const borrados = removeMock.mock.calls.flatMap(([paths]) => paths);
    const purgado = CASES.find((c) => c.purge)!.design.id;
    expect(borrados).toContain(`${purgado}/_client/slot-01.png`);
  });

  it("si falla el borrado de los bytes, NO borra filas (se reintenta el próximo ciclo)", async () => {
    removeMock.mockResolvedValue({ error: { message: "storage caído" } });

    const res = await runPurge();

    expect(deletedIds).toHaveLength(0);
    expect(quoteItemUpdates).toHaveLength(0);
    expect(res.designsPurged).toBe(0);
  });
});
