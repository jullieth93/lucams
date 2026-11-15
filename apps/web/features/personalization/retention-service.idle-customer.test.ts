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

const NOW = new Date("2026-09-18T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY_MS);

type FakeDesign = {
  id: string;
  status: string;
  customerId: string | null;
  updatedAt: Date;
  cartItems: Array<{ cartDeletedAt: Date | null }>;
  orderItems: number;
};

function design(id: string, over: Partial<FakeDesign> = {}): FakeDesign {
  return {
    id,
    status: "DRAFT",
    customerId: `cus-${id}`,
    updatedAt: daysAgo(120),
    cartItems: [],
    orderItems: 0,
    ...over,
  };
}

const liveCart = [{ cartDeletedAt: null }];
const deadCart = [{ cartDeletedAt: daysAgo(100) }];

const CASES: Array<{ design: FakeDesign; purge: boolean }> = [
  { design: design("idle-sin-nada"), purge: true },
  { design: design("idle-carrito-muerto", { cartItems: deadCart }), purge: true },
  { design: design("reciente", { updatedAt: daysAgo(30) }), purge: false },
  { design: design("en-carrito-vivo", { cartItems: liveCart }), purge: false },
  { design: design("con-pedido", { orderItems: 1 }), purge: false },
  { design: design("ready-viejo", { status: "READY" }), purge: false },
  { design: design("usado-en-pedido", { status: "USED_IN_ORDER", orderItems: 1 }), purge: false },
  { design: design("archivado", { status: "ARCHIVED" }), purge: false },
  { design: design("anonimo", { customerId: null }), purge: false },
];

let rows: FakeDesign[] = [];
const deletedIds: string[] = [];

class UnsupportedFilter extends Error {
  constructor(detail: string) {
    super(`El fake no modela este filtro: ${detail}`);
  }
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
            draftPreviewUrl: `https://cdn.test/storage/v1/object/public/design-previews/${d.id}/draft-preview.webp`,
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
    $transaction: async (ops: Array<Promise<unknown>>) => Promise.all(ops),
  },
}));

import { purgeIdleCustomerDesigns } from "./retention-service";

beforeEach(() => {
  rows = CASES.map((c) => ({ ...c.design }));
  deletedIds.length = 0;
  removeMock.mockClear();
  removeMock.mockResolvedValue({ error: null });
  listMock.mockClear();
  listMock.mockResolvedValue({ data: [], error: null });
});

const runPurge = () => purgeIdleCustomerDesigns({ now: NOW });

describe("purga de DRAFTs idle de clientes logueados", () => {
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

  it("respeta el override de días", async () => {
    const res = await purgeIdleCustomerDesigns({ now: NOW, olderThanDays: 30 });
    expect(res.designsPurged).toBe(2);
    expect(deletedIds.sort()).toEqual(["idle-carrito-muerto", "idle-sin-nada"].sort());
  });
});
