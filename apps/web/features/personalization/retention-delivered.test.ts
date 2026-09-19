/*
 * Retención POST-ENTREGA de fotos del Estudio (feedback Lucy 2026-09-18 · Ley 1581 art. 4 lit. f).
 *
 * Cubre la POLÍTICA de purgeDeliveredDesignAssets (retention-delivered.ts):
 *  - Solo se purgan diseños USED_IN_ORDER con orden DELIVERED hace ≥90 días (Order.deliveredAt).
 *  - Se EXCLUYE cualquier diseño con retracto abierto (PENDING/APPROVED/RECEIVED), garantía abierta
 *    (PENDING/IN_REVIEW/APPROVED) u orden en curso/recién entregada (reimpresiones y remedios
 *    REPLACE las necesitan — el ZIP de imprenta lee productionUrls).
 *  - Se CONSERVAN la fila Design, previewUrl, canvasData y el snapshot del OrderItem: la purga solo
 *    borra bytes (customer-uploads + production-assets) y marca purgedAt — nunca design.deleteMany.
 *  - Idempotencia vía purgedAt: lo ya purgado no se recandidata; si el borrado de bytes falla NO se
 *    marca (reintento en la próxima corrida).
 *
 * Sin DB (mandato del grupo: nada de escrituras contra la Supabase compartida), mismo enfoque que
 * retention-service.quote-lifecycle.test.ts: un fake de Prisma que EVALÚA el `where` contra filas en
 * memoria y LANZA ante cualquier operador que no modele — si la política se reescribe, el test se
 * cae en vez de pasar por vacío.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// `remove` registra (bucket, paths) para afirmar QUÉ se borró de CADA bucket (lo purgado borra
// crudas + renders pero JAMÁS el preview público, que se conserva por política).
const removeCalls = vi.hoisted(() => [] as Array<{ bucket: string; paths: string[] }>);
const removeMock = vi.hoisted(() =>
  vi.fn(async (_paths: string[]) => ({ error: null as { message: string } | null })),
);
const listMock = vi.hoisted(() =>
  vi.fn(async (_prefix: string) => ({
    data: [] as { name: string }[],
    error: null as { message: string } | null,
  })),
);
const fromMock = vi.hoisted(() => (bucket: string) => ({
  remove: (paths: string[]) => {
    removeCalls.push({ bucket, paths });
    return removeMock(paths);
  },
  list: listMock,
}));

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/supabase/service", () => ({
  supabaseService: { storage: { from: fromMock } },
}));

// ─────────────────────────── filas en memoria ───────────────────────────

const NOW = new Date("2026-09-18T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY_MS);

type FakeOrder = { status: string; deliveredAt: Date | null; deletedAt: Date | null };
type FakeItem = { order: FakeOrder; retract: string | null; warranties: string[] };
type FakeDesign = {
  id: string;
  status: string;
  purgedAt: Date | null;
  items: FakeItem[];
};

function design(id: string, over: Partial<FakeDesign> = {}): FakeDesign {
  return {
    id,
    status: "USED_IN_ORDER",
    purgedAt: null,
    items: [
      {
        order: { status: "DELIVERED", deliveredAt: daysAgo(120), deletedAt: null },
        retract: null,
        warranties: [],
      },
    ],
    ...over,
  };
}

const deliveredLongAgo = { status: "DELIVERED", deliveredAt: daysAgo(120), deletedAt: null };
const item = (over: Partial<FakeItem> = {}): FakeItem => ({
  order: { ...deliveredLongAgo },
  retract: null,
  warranties: [],
  ...over,
});

/** Escenarios: el nombre dice la situación; `purge` es el veredicto esperado. */
const CASES: Array<{ design: FakeDesign; purge: boolean }> = [
  // — el caso feliz: entregado hace 120 días, nada abierto → purga —
  { design: design("entregado-ha-120d"), purge: true },
  {
    design: design("entregado-justo-90d", {
      items: [item({ order: { ...deliveredLongAgo, deliveredAt: daysAgo(90) } })],
    }),
    purge: true,
  },

  // — todavía dentro de la ventana → conserva —
  {
    design: design("entregado-ha-30d", {
      items: [item({ order: { ...deliveredLongAgo, deliveredAt: daysAgo(30) } })],
    }),
    purge: false,
  },
  {
    design: design("delivered-sin-fecha", {
      items: [item({ order: { ...deliveredLongAgo, deliveredAt: null } })],
    }),
    purge: false,
  },

  // — retracto abierto bloquea; terminal no —
  { design: design("retracto-pendiente", { items: [item({ retract: "PENDING" })] }), purge: false },
  { design: design("retracto-aprobado", { items: [item({ retract: "APPROVED" })] }), purge: false },
  { design: design("retracto-recibido", { items: [item({ retract: "RECEIVED" })] }), purge: false },
  {
    design: design("retracto-reembolsado", { items: [item({ retract: "REFUNDED" })] }),
    purge: true,
  },
  { design: design("retracto-rechazado", { items: [item({ retract: "REJECTED" })] }), purge: true },

  // — garantía abierta bloquea (REPLACE reimprime); terminal no —
  {
    design: design("garantia-pendiente", { items: [item({ warranties: ["PENDING"] })] }),
    purge: false,
  },
  {
    design: design("garantia-en-revision", { items: [item({ warranties: ["IN_REVIEW"] })] }),
    purge: false,
  },
  {
    design: design("garantia-aprobada", { items: [item({ warranties: ["APPROVED"] })] }),
    purge: false,
  },
  {
    design: design("garantia-resuelta", { items: [item({ warranties: ["RESOLVED"] })] }),
    purge: true,
  },
  {
    design: design("garantia-vieja-resuelta-y-nueva-abierta", {
      items: [item({ warranties: ["RESOLVED", "PENDING"] })],
    }),
    purge: false,
  },

  // — otra orden del mismo diseño todavía necesita los bytes → conserva —
  {
    design: design("reorder-en-produccion", {
      items: [
        item(),
        item({ order: { status: "FULFILLING", deliveredAt: null, deletedAt: null } }),
      ],
    }),
    purge: false,
  },
  {
    design: design("reorder-recien-entregado", {
      items: [
        item(),
        item({ order: { status: "DELIVERED", deliveredAt: daysAgo(10), deletedAt: null } }),
      ],
    }),
    purge: false,
  },
  {
    design: design("reembolsada-ha-200d", {
      items: [item({ order: { status: "REFUNDED", deliveredAt: null, deletedAt: null } })],
    }),
    purge: false, // ninguna orden DELIVERED ≥90d = no hay gatillo
  },

  // — ya purgado (idempotencia) y estados ajenos —
  { design: design("ya-purgado", { purgedAt: daysAgo(5) }), purge: false },
  { design: design("draft-viejo", { status: "DRAFT", items: [] }), purge: false },
  { design: design("ready-viejo", { status: "READY", items: [] }), purge: false },
];

// ─────────────── fake de Prisma que EVALÚA el where en memoria ───────────────

let rows: FakeDesign[] = [];
const markedPurged: string[] = [];
const deletedAssetDesignIds: string[] = [];

class UnsupportedFilter extends Error {
  constructor(detail: string) {
    super(`El fake no modela este filtro (¿cambió la política?): ${detail}`);
  }
}

function matchesDateOp(value: unknown, actual: Date | null): boolean {
  if (value === null) return actual === null; // `deliveredAt: null` = orden sin fecha de entrega
  const op = value as { lte?: Date; gt?: Date };
  if (op.lte) return actual !== null && actual.getTime() <= op.lte.getTime();
  if (op.gt) return actual !== null && actual.getTime() > op.gt.getTime();
  throw new UnsupportedFilter(`dateOp=${JSON.stringify(value)}`);
}

function matchesStatusOp(value: unknown, actual: string): boolean {
  if (typeof value === "string") return actual === value;
  const inList = (value as { in?: string[] }).in;
  if (inList) return inList.includes(actual);
  throw new UnsupportedFilter(`status=${JSON.stringify(value)}`);
}

function matchesOrder(where: Record<string, unknown>, o: FakeOrder): boolean {
  return Object.entries(where).every(([key, value]) => {
    switch (key) {
      case "OR":
        return (value as Array<Record<string, unknown>>).some((w) => matchesOrder(w, o));
      case "deletedAt":
        if (value !== null) throw new UnsupportedFilter(`order.deletedAt=${String(value)}`);
        return o.deletedAt === null;
      case "status":
        return matchesStatusOp(value, o.status);
      case "deliveredAt":
        return matchesDateOp(value, o.deliveredAt);
      default:
        throw new UnsupportedFilter(`order.${key}`);
    }
  });
}

function matchesItem(where: Record<string, unknown>, it: FakeItem): boolean {
  return Object.entries(where).every(([key, value]) => {
    switch (key) {
      case "order":
        return matchesOrder(value as Record<string, unknown>, it.order);
      case "retractRequest": {
        const st = (value as { status?: unknown }).status;
        if (st === undefined)
          throw new UnsupportedFilter(`retractRequest=${JSON.stringify(value)}`);
        return it.retract !== null && matchesStatusOp(st, it.retract);
      }
      case "warrantyClaims": {
        const some = (value as { some?: { status?: unknown } }).some;
        if (!some?.status) throw new UnsupportedFilter(`warrantyClaims=${JSON.stringify(value)}`);
        return it.warranties.some((w) => matchesStatusOp(some.status, w));
      }
      default:
        throw new UnsupportedFilter(`item.${key}`);
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
      case "purgedAt":
        if (value !== null) throw new UnsupportedFilter(`purgedAt=${String(value)}`);
        return d.purgedAt === null;
      case "orderItems": {
        const filter = value as { some?: Record<string, unknown>; none?: Record<string, unknown> };
        if (filter.some) return d.items.some((it) => matchesItem(filter.some!, it));
        if (filter.none) return !d.items.some((it) => matchesItem(filter.none!, it));
        throw new UnsupportedFilter(`orderItems=${JSON.stringify(value)}`);
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
            productionUrl: `prod/${d.id}/legacy.png`,
            productionUrls: [`prod/${d.id}/pieza-01.png`, `prod/${d.id}/pieza-02.png`],
            assets: [{ storageUrl: `uploads/${d.id}/foto.jpg` }],
          })),
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: { in: string[] } };
        data: { purgedAt: Date; productionUrl: null; productionUrls: string[] };
      }) => {
        markedPurged.push(...where.id.in);
        for (const d of rows) {
          if (where.id.in.includes(d.id)) d.purgedAt = data.purgedAt;
        }
        return { count: where.id.in.length };
      },
      // La purga post-entrega NUNCA borra la fila Design: si aparece un deleteMany acá, la
      // política se rompió (preview/canvas/historial se conservan).
      deleteMany: async () => {
        throw new Error("purgeDeliveredDesignAssets NO debe borrar filas Design");
      },
    },
    designAsset: {
      deleteMany: async ({ where }: { where: { designId: { in: string[] } } }) => {
        deletedAssetDesignIds.push(...where.designId.in);
        return { count: where.designId.in.length };
      },
    },
    $transaction: async (ops: Array<Promise<unknown>>) => Promise.all(ops),
  },
}));

import { purgeDeliveredDesignAssets } from "./retention-delivered";

beforeEach(() => {
  rows = CASES.map((c) => ({ ...c.design }));
  markedPurged.length = 0;
  deletedAssetDesignIds.length = 0;
  removeCalls.length = 0;
  removeMock.mockClear();
  removeMock.mockResolvedValue({ error: null });
  listMock.mockClear();
  listMock.mockResolvedValue({ data: [], error: null });
});

const runPurge = () => purgeDeliveredDesignAssets({ now: NOW });
const expectedPurged = () => CASES.filter((c) => c.purge).map((c) => c.design.id);

describe("purga post-entrega — selección de candidatos", () => {
  it.each(CASES.filter((c) => c.purge).map((c) => c.design.id))("PURGA %s", async (id) => {
    await runPurge();
    expect(markedPurged).toContain(id);
  });

  it.each(CASES.filter((c) => !c.purge).map((c) => c.design.id))("CONSERVA %s", async (id) => {
    await runPurge();
    expect(markedPurged).not.toContain(id);
  });
});

describe("purga post-entrega — qué se borra y qué se conserva", () => {
  it("borra las fotos crudas de customer-uploads SOLO de lo purgado", async () => {
    await runPurge();
    const uploads = removeCalls
      .filter((c) => c.bucket === "customer-uploads")
      .flatMap((c) => c.paths);
    for (const c of CASES) {
      expect(uploads.includes(`uploads/${c.design.id}/foto.jpg`)).toBe(c.purge);
    }
  });

  it("borra los renders de production-assets (productionUrls + legacy productionUrl + área _client)", async () => {
    listMock.mockResolvedValue({ data: [{ name: "slot-01.png" }], error: null });

    await runPurge();

    const production = removeCalls
      .filter((c) => c.bucket === "production-assets")
      .flatMap((c) => c.paths);
    for (const id of expectedPurged()) {
      expect(production).toContain(`prod/${id}/pieza-01.png`);
      expect(production).toContain(`prod/${id}/pieza-02.png`);
      expect(production).toContain(`prod/${id}/legacy.png`);
      expect(production).toContain(`${id}/_client/slot-01.png`);
    }
    // Nada de lo conservado perdió bytes de producción.
    for (const c of CASES.filter((x) => !x.purge)) {
      expect(production).not.toContain(`prod/${c.design.id}/pieza-01.png`);
    }
  });

  it("NUNCA toca el bucket de previews (previewUrl se conserva por política)", async () => {
    await runPurge();
    expect(removeCalls.some((c) => c.bucket === "design-previews")).toBe(false);
  });

  it("no borra la fila Design ni toca el snapshot del pedido: solo marca purgedAt y limpia punteros", async () => {
    const res = await runPurge();
    expect(res.designsPurged).toBe(expectedPurged().length);
    // design.deleteMany lanza en el fake — si corría, el test reventaba arriba.
    // Los DesignAsset de lo purgado sí se borran (sus bytes ya no existen).
    expect(deletedAssetDesignIds.sort()).toEqual(expectedPurged().sort());
  });

  it("idempotente: la segunda corrida no recandidata lo ya purgado", async () => {
    await runPurge();
    markedPurged.length = 0;
    removeCalls.length = 0;

    const res = await runPurge();

    expect(res.designsPurged).toBe(0);
    expect(markedPurged).toHaveLength(0);
    expect(removeCalls).toHaveLength(0);
  });

  it("si falla el borrado de las crudas NO marca purgedAt ni borra assets (reintento próximo ciclo)", async () => {
    removeMock.mockImplementation(async (paths: string[]) => {
      // Falla solo el batch de customer-uploads (los paths de crudas empiezan con "uploads/").
      return paths.every((p) => p.startsWith("uploads/"))
        ? { error: { message: "storage caído" } }
        : { error: null };
    });

    const res = await runPurge();

    expect(res.designsPurged).toBe(0);
    expect(markedPurged).toHaveLength(0);
    expect(deletedAssetDesignIds).toHaveLength(0);
  });

  it("si falla el borrado de los renders tampoco marca (son PII del cliente compuesta)", async () => {
    removeMock.mockImplementation(async (paths: string[]) => {
      return paths.every((p) => p.startsWith("uploads/"))
        ? { error: null }
        : { error: { message: "storage caído" } };
    });

    const res = await runPurge();

    expect(res.designsPurged).toBe(0);
    expect(markedPurged).toHaveLength(0);
  });
});
