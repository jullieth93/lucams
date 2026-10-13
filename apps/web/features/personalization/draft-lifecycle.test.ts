/*
 * Ciclo de vida de borradores (Fase 3, plan maduración 2026-10-13):
 *  1. Poda «últimos 3» (trimExcessDraftDesigns): al quedar 4 DRAFT del mismo
 *     dueño+producto se elimina el más viejo con sus assets; READY /
 *     USED_IN_ORDER / otros productos / borradores blindados por carrito vivo
 *     NUNCA se tocan; los bytes COMPARTIDOS con un diseño vivo (clon
 *     READY→DRAFT) no se borran (solo la fila).
 *  2. Reuso al entrar al Estudio (findReusableDraftDesign): retoma el DRAFT
 *     activo más reciente del dueño+producto (+ variante explícita si la URL la
 *     fija); ignora READY, otros productos/dueños, borradores fuera de la
 *     ventana de retención y los referenciados por carrito vivo/pedido.
 *  3. Borrado manual desde "Mis diseños" (deleteCustomerDraftDesign /
 *     emptyCustomerDraftDesigns).
 *
 * Sin DB, mismo enfoque que retention-service.idle-customer.test.ts: fake de
 * Prisma que EVALÚA el `where` y lanza ante operadores no modelados.
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

const NOW = new Date("2026-10-13T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const hoursAgo = (n: number) => new Date(NOW.getTime() - n * 60 * 60 * 1000);
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY_MS);

type FakeAsset = { storageUrl: string; designId: string | null };

type FakeDesign = {
  id: string;
  status: string;
  customerId: string | null;
  sessionId: string | null;
  productId: string;
  updatedAt: Date;
  metadata: Record<string, unknown> | null;
  /** Items de carrito que referencian el diseño (cartDeletedAt null = carrito vivo). */
  cartItems: Array<{ cartDeletedAt: Date | null }>;
  orderItems: number;
  /** storageUrl de las fotos crudas ligadas al diseño. */
  uploads: string[];
  draftPreviewUrl: string | null;
};

function design(id: string, over: Partial<FakeDesign> = {}): FakeDesign {
  return {
    id,
    status: "DRAFT",
    customerId: "cus-1",
    sessionId: null,
    productId: "prod-1",
    updatedAt: hoursAgo(1),
    metadata: { variantId: "var-1" },
    cartItems: [],
    orderItems: 0,
    uploads: [`uploads/${id}.jpg`],
    draftPreviewUrl: `https://cdn.test/storage/v1/object/public/design-previews/${id}/draft-preview.webp`,
    ...over,
  };
}

let rows: FakeDesign[] = [];
const deletedIds: string[] = [];
const deletedAssetDesignIds: string[] = [];

class UnsupportedFilter extends Error {
  constructor(detail: string) {
    super(`El fake no modela este filtro (¿cambió la política?): ${detail}`);
  }
}

function matchesDesign(where: Record<string, unknown>, d: FakeDesign): boolean {
  return Object.entries(where).every(([key, value]) => {
    switch (key) {
      case "id": {
        if (typeof value === "string") return d.id === value;
        const inList = (value as { in?: string[] }).in;
        if (!inList) throw new UnsupportedFilter(`id=${JSON.stringify(value)}`);
        return inList.includes(d.id);
      }
      case "status":
        return d.status === value;
      case "customerId":
        return d.customerId === value;
      case "sessionId":
        return d.sessionId === value;
      case "productId":
        return d.productId === value;
      case "updatedAt": {
        const f = value as { gte?: Date; lt?: Date };
        if (f.gte && d.updatedAt.getTime() < f.gte.getTime()) return false;
        if (f.lt && d.updatedAt.getTime() >= f.lt.getTime()) return false;
        if (!f.gte && !f.lt) throw new UnsupportedFilter(`updatedAt=${JSON.stringify(value)}`);
        return true;
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

/** Proyección según el `select` de cada consulta del módulo bajo test. */
function project(d: FakeDesign, select: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(select)) {
    switch (key) {
      case "id":
        out.id = d.id;
        break;
      case "metadata":
        out.metadata = d.metadata;
        break;
      case "cartItems":
        out.cartItems = d.cartItems
          .filter((ci) => ci.cartDeletedAt === null)
          .map(() => ({ id: `ci-${d.id}` }));
        break;
      case "orderItems":
        out.orderItems = Array.from({ length: d.orderItems }, (_, i) => ({ id: `oi-${i}` }));
        break;
      case "previewUrl":
        out.previewUrl = null;
        break;
      case "draftPreviewUrl":
        out.draftPreviewUrl = d.draftPreviewUrl;
        break;
      case "previewPagesCount":
        out.previewPagesCount = null;
        break;
      case "productionUrls":
        out.productionUrls = [];
        break;
      case "assets":
        out.assets = d.uploads.map((storageUrl) => ({ storageUrl }));
        break;
      default:
        throw new UnsupportedFilter(`select.${key}`);
    }
  }
  return out;
}

vi.mock("@/lib/db", () => ({
  prisma: {
    design: {
      findMany: async ({
        where,
        select,
        orderBy,
        take,
      }: {
        where: Record<string, unknown>;
        select?: Record<string, unknown>;
        orderBy?: { updatedAt?: string };
        take?: number;
      }) => {
        let found = rows.filter((d) => matchesDesign(where, d));
        if (orderBy?.updatedAt === "desc") {
          found = [...found].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
        } else if (orderBy) {
          throw new UnsupportedFilter(`orderBy=${JSON.stringify(orderBy)}`);
        }
        if (take) found = found.slice(0, take);
        return found.map((d) => (select ? project(d, select) : d));
      },
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const found = rows.filter((d) => matchesDesign(where, d));
        return found[0] ? { id: found[0]!.id } : null;
      },
      deleteMany: async ({ where }: { where: { id: { in: string[] } } }) => {
        deletedIds.push(...where.id.in);
        rows = rows.filter((d) => !where.id.in.includes(d.id));
        return { count: where.id.in.length };
      },
    },
    designAsset: {
      // Bytes compartidos: assets de OTROS diseños (designId notIn) con el mismo
      // storageUrl — el clon READY→DRAFT referencia las fotos del original.
      findMany: async ({
        where,
      }: {
        where: { storageUrl: { in: string[] }; designId: { notIn: string[] } };
      }) =>
        allAssets.filter(
          (a) =>
            where.storageUrl.in.includes(a.storageUrl) &&
            (a.designId === null || !where.designId.notIn.includes(a.designId)),
        ),
      deleteMany: async ({ where }: { where: { designId: { in: string[] } } }) => {
        deletedAssetDesignIds.push(...where.designId.in);
        allAssets = allAssets.filter((a) => !where.designId.in.includes(a.designId ?? ""));
        return { count: 0 };
      },
    },
    quoteItem: {
      updateMany: async () => ({ count: 0 }),
    },
    $transaction: async (ops: Array<Promise<unknown>>) => Promise.all(ops),
  },
}));

import {
  MAX_DRAFTS_PER_PRODUCT,
  deleteCustomerDraftDesign,
  emptyCustomerDraftDesigns,
  findReusableDraftDesign,
  trimExcessDraftDesigns,
} from "./draft-lifecycle";

let allAssets: FakeAsset[] = [];

function syncAssets() {
  allAssets = rows.flatMap((d) => d.uploads.map((storageUrl) => ({ storageUrl, designId: d.id })));
}

const OWNER = { customerId: "cus-1", sessionId: null };

function removedPaths(): string[] {
  return removeMock.mock.calls.flatMap((call) => (call as unknown as [string[]])[0]);
}

beforeEach(() => {
  deletedIds.length = 0;
  deletedAssetDesignIds.length = 0;
  removeMock.mockClear();
  removeMock.mockResolvedValue({ error: null });
  listMock.mockClear();
  listMock.mockResolvedValue({ data: [], error: null });
});

// ─────────────────────────── poda «últimos 3» ───────────────────────────

describe("trimExcessDraftDesigns — política «últimos N» (2026-10-13)", () => {
  it("con 4 DRAFT del mismo dueño+producto conserva los 3 más recientes y elimina el más viejo", async () => {
    rows = [
      design("nuevo", { updatedAt: hoursAgo(0) }),
      design("segundo", { updatedAt: hoursAgo(1) }),
      design("tercero", { updatedAt: hoursAgo(2) }),
      design("viejo", { updatedAt: hoursAgo(3) }),
    ];
    syncAssets();

    const res = await trimExcessDraftDesigns(OWNER, "prod-1");

    expect(MAX_DRAFTS_PER_PRODUCT).toBe(3);
    expect(res.trimmed).toBe(1);
    expect(deletedIds).toEqual(["viejo"]);
    expect(rows.map((d) => d.id).sort()).toEqual(["nuevo", "segundo", "tercero"].sort());
  });

  it("elimina los assets del borrador podado (fotos crudas + miniatura draft-preview)", async () => {
    rows = [
      design("d1", { updatedAt: hoursAgo(0) }),
      design("d2", { updatedAt: hoursAgo(1) }),
      design("d3", { updatedAt: hoursAgo(2) }),
      design("d4", { updatedAt: hoursAgo(3) }),
    ];
    syncAssets();

    await trimExcessDraftDesigns(OWNER, "prod-1");

    const removed = removedPaths();
    expect(removed).toContain("uploads/d4.jpg");
    expect(removed).toContain("d4/draft-preview.webp");
    expect(deletedAssetDesignIds).toEqual(["d4"]);
  });

  it("NUNCA toca READY ni USED_IN_ORDER, ni borradores de OTRO producto", async () => {
    rows = [
      design("draft-1", { updatedAt: hoursAgo(0) }),
      design("draft-2", { updatedAt: hoursAgo(1) }),
      design("draft-3", { updatedAt: hoursAgo(2) }),
      design("draft-4", { updatedAt: hoursAgo(3) }),
      design("listo", { status: "READY", updatedAt: hoursAgo(4) }),
      design("pedido", { status: "USED_IN_ORDER", orderItems: 1, updatedAt: hoursAgo(5) }),
      design("otro-producto", { productId: "prod-2", updatedAt: hoursAgo(6) }),
    ];
    syncAssets();

    await trimExcessDraftDesigns(OWNER, "prod-1");

    expect(deletedIds).toEqual(["draft-4"]);
    for (const id of ["listo", "pedido", "otro-producto"]) {
      expect(rows.some((d) => d.id === id)).toBe(true);
    }
  });

  it("un borrador blindado por carrito VIVO no cuenta para el techo ni se borra", async () => {
    rows = [
      design("en-carrito", {
        updatedAt: hoursAgo(0),
        cartItems: [{ cartDeletedAt: null }],
      }),
      design("d1", { updatedAt: hoursAgo(1) }),
      design("d2", { updatedAt: hoursAgo(2) }),
      design("d3", { updatedAt: hoursAgo(3) }),
    ];
    syncAssets();

    const res = await trimExcessDraftDesigns(OWNER, "prod-1");

    expect(res.trimmed).toBe(0);
    expect(deletedIds).toHaveLength(0);
    expect(rows).toHaveLength(4);
  });

  it("no borra bytes COMPARTIDOS con otro diseño vivo (clon READY→DRAFT), solo la fila", async () => {
    rows = [
      design("original-ready", { status: "READY", uploads: ["uploads/compartida.jpg"] }),
      design("d1", { updatedAt: hoursAgo(0) }),
      design("d2", { updatedAt: hoursAgo(1) }),
      design("d3", { updatedAt: hoursAgo(2) }),
      // Clon del original: su DesignAsset apunta al MISMO storageUrl.
      design("clon", { updatedAt: hoursAgo(3), uploads: ["uploads/compartida.jpg"] }),
    ];
    syncAssets();

    await trimExcessDraftDesigns(OWNER, "prod-1");

    expect(deletedIds).toEqual(["clon"]);
    // Los bytes compartidos NO se removieron (el original READY los sigue usando)…
    expect(removedPaths()).not.toContain("uploads/compartida.jpg");
    // …pero la miniatura propia del clon sí, y sus filas DesignAsset se borran.
    expect(removedPaths()).toContain("clon/draft-preview.webp");
    expect(deletedAssetDesignIds).toEqual(["clon"]);
  });

  it("con 3 o menos DRAFT no hace nada", async () => {
    rows = [design("d1"), design("d2", { updatedAt: hoursAgo(2) })];
    syncAssets();

    const res = await trimExcessDraftDesigns(OWNER, "prod-1");

    expect(res.trimmed).toBe(0);
    expect(deletedIds).toHaveLength(0);
    expect(removeMock).not.toHaveBeenCalled();
  });
});

// ─────────────────────────── reuso al entrar al Estudio ───────────────────────────

describe("findReusableDraftDesign — reuso del borrador activo al entrar al Estudio", () => {
  it("retoma el DRAFT más reciente del mismo dueño+producto", async () => {
    rows = [
      design("viejo", { updatedAt: hoursAgo(5) }),
      design("reciente", { updatedAt: hoursAgo(1) }),
    ];

    const found = await findReusableDraftDesign({ ...OWNER, productId: "prod-1", now: NOW });

    expect(found).toEqual({ id: "reciente" });
  });

  it("ignora READY, otros productos y otros dueños", async () => {
    rows = [
      design("listo", { status: "READY" }),
      design("otro-producto", { productId: "prod-2" }),
      design("otro-dueno", { customerId: "cus-2" }),
    ];

    const found = await findReusableDraftDesign({ ...OWNER, productId: "prod-1", now: NOW });

    expect(found).toBeNull();
  });

  it("un borrador fuera de la ventana de retención de su dueño NO se retoma (90d logueado / 30d anónimo)", async () => {
    rows = [design("stale", { updatedAt: daysAgo(45) })];

    // Logueado: 45d < 90d → sí se retoma.
    expect(await findReusableDraftDesign({ ...OWNER, productId: "prod-1", now: NOW })).toEqual({
      id: "stale",
    });
    // Anónimo: 45d > 30d → no.
    expect(
      await findReusableDraftDesign({
        customerId: null,
        sessionId: "ses-1",
        productId: "prod-1",
        now: NOW,
      }),
    ).toBeNull();
  });

  it("busca por sessionId cuando el dueño es anónimo", async () => {
    rows = [
      design("mio", { customerId: null, sessionId: "ses-1" }),
      design("ajeno", { customerId: null, sessionId: "ses-2" }),
    ];

    const found = await findReusableDraftDesign({
      customerId: null,
      sessionId: "ses-1",
      productId: "prod-1",
      now: NOW,
    });

    expect(found).toEqual({ id: "mio" });
  });

  it("no retoma borradores referenciados por un carrito vivo o un pedido", async () => {
    rows = [
      design("en-carrito", { cartItems: [{ cartDeletedAt: null }] }),
      design("con-pedido", { orderItems: 1, updatedAt: hoursAgo(2) }),
    ];

    expect(await findReusableDraftDesign({ ...OWNER, productId: "prod-1", now: NOW })).toBeNull();
  });

  it("con variante explícita: retoma el DRAFT de ESA variante (o legacy sin variante), nunca otra", async () => {
    rows = [
      design("otra-variante", { updatedAt: hoursAgo(1), metadata: { variantId: "var-2" } }),
      design("mi-variante", { updatedAt: hoursAgo(2), metadata: { variantId: "var-1" } }),
    ];
    expect(
      await findReusableDraftDesign({
        ...OWNER,
        productId: "prod-1",
        variantId: "var-1",
        now: NOW,
      }),
    ).toEqual({ id: "mi-variante" });

    rows = [design("otra-variante", { metadata: { variantId: "var-2" } })];
    expect(
      await findReusableDraftDesign({
        ...OWNER,
        productId: "prod-1",
        variantId: "var-1",
        now: NOW,
      }),
    ).toBeNull();

    rows = [design("legacy", { metadata: { kind: "PHOTO_PACK" } })];
    expect(
      await findReusableDraftDesign({
        ...OWNER,
        productId: "prod-1",
        variantId: "var-1",
        now: NOW,
      }),
    ).toEqual({ id: "legacy" });
  });

  it("sin variante explícita retoma el más reciente aunque sea de otra variante", async () => {
    rows = [design("otra-variante", { metadata: { variantId: "var-2" } })];

    expect(await findReusableDraftDesign({ ...OWNER, productId: "prod-1", now: NOW })).toEqual({
      id: "otra-variante",
    });
  });
});

// ─────────────────────────── borrado manual (Mis diseños) ───────────────────────────

describe("deleteCustomerDraftDesign — eliminar un borrador", () => {
  it("borra el DRAFT del dueño con sus assets", async () => {
    rows = [design("mio")];
    syncAssets();

    const ok = await deleteCustomerDraftDesign("mio", "cus-1");

    expect(ok).toBe(true);
    expect(deletedIds).toEqual(["mio"]);
    expect(removedPaths()).toContain("uploads/mio.jpg");
    expect(removedPaths()).toContain("mio/draft-preview.webp");
  });

  it("rechaza diseños ajenos o que no son DRAFT", async () => {
    rows = [design("ajeno", { customerId: "cus-2" }), design("listo", { status: "READY" })];
    syncAssets();

    expect(await deleteCustomerDraftDesign("ajeno", "cus-1")).toBe(false);
    expect(await deleteCustomerDraftDesign("listo", "cus-1")).toBe(false);
    expect(deletedIds).toHaveLength(0);
  });
});

describe("emptyCustomerDraftDesigns — «Vaciar borradores»", () => {
  it("elimina TODOS los DRAFT del cliente (de cualquier producto) y devuelve el conteo", async () => {
    rows = [
      design("d1"),
      design("d2", { productId: "prod-2" }),
      design("listo", { status: "READY" }),
      design("ajeno", { customerId: "cus-2" }),
      design("blindado", { cartItems: [{ cartDeletedAt: null }] }),
    ];
    syncAssets();

    const res = await emptyCustomerDraftDesigns("cus-1");

    expect(res.deleted).toBe(2);
    expect(deletedIds.sort()).toEqual(["d1", "d2"]);
    for (const id of ["listo", "ajeno", "blindado"]) {
      expect(rows.some((d) => d.id === id)).toBe(true);
    }
  });
});
