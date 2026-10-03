/*
 * cloneDesignForReorder (Paquete I, 2026-10-02) — clonado de un diseño USED_IN_ORDER para
 * "Volver a pedir". A diferencia de cloneDesignForEdit (comparte storageUrl), acá los BYTES se
 * COPIAN a paths propios del clon: el original entra en la ventana de la purga post-entrega
 * (retention-delivered.ts) y si el clon referenciara sus bytes, la purga lo rompería con su
 * propio pedido en vuelo.
 *
 * Cubre, sin DB ni Storage (mocks estilo retention-delivered.test.ts):
 *  - clon feliz: fila nueva con owner NUEVO, assets copiados con remap de assetId en el
 *    canvas, renders copiados a <cloneId>/…, promoción a READY al final, preview heredado.
 *  - gating: solo USED_IN_ORDER no purgado con renders vivos; READY/purgado/sin renders → null.
 *  - fallo de Storage a mitad: cleanup best-effort (borra lo copiado + la fila) y null.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  design: null as null | {
    id: string;
    status: string;
    purgedAt: Date | null;
    productId: string;
    templateId: string | null;
    canvasData: unknown;
    metadata: unknown;
    previewUrl: string | null;
    productionUrl: string | null;
    productionUrls: string[];
    moderationStatus: string;
    qualityAcknowledgedAt: Date | null;
  },
  assets: [] as Array<{
    id: string;
    designId: string;
    customerId: string | null;
    sessionId: string | null;
    storageUrl: string;
    mimeType: string;
    sizeBytes: number;
    width: number;
    height: number;
    exifStripped: boolean;
    malwareScanned: boolean;
    rightsAcceptedAt: Date | null;
    rightsPolicyVersion: string | null;
  }>,
  cloneId: "clone_1",
  createdDesign: null as null | Record<string, unknown>,
  createdAssets: [] as Array<Record<string, unknown>>,
  updates: [] as Array<Record<string, unknown>>,
  deletedAssetsFor: [] as string[],
  deletedDesigns: [] as string[],
  copyCalls: [] as Array<{ bucket: string; from: string; to: string }>,
  copyFailFrom: null as null | string, // path cuyo copy falla
  removed: [] as Array<{ bucket: string; paths: string[] }>,
}));

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/supabase/service", () => ({
  supabaseService: {
    storage: {
      from: (bucket: string) => ({
        copy: async (from: string, to: string) => {
          state.copyCalls.push({ bucket, from, to });
          return state.copyFailFrom === from
            ? { data: null, error: { message: "objeto no encontrado" } }
            : { data: { path: to }, error: null };
        },
        remove: async (paths: string[]) => {
          state.removed.push({ bucket, paths });
          return { error: null };
        },
      }),
    },
  },
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    design: {
      findUnique: vi.fn(async () => state.design),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        state.createdDesign = data;
        return { id: state.cloneId };
      }),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        state.updates.push(data);
        return { id: state.cloneId };
      }),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        state.deletedDesigns.push(where.id);
        return { id: where.id };
      }),
    },
    designAsset: {
      findMany: vi.fn(async () => state.assets),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        state.createdAssets.push(data);
        return { id: `clone_asset_${state.createdAssets.length}` };
      }),
      deleteMany: vi.fn(async ({ where }: { where: { designId: string } }) => {
        state.deletedAssetsFor.push(where.designId);
        return { count: 1 };
      }),
    },
  },
}));

import { cloneDesignForReorder } from "./service";

const OWNER = { customerId: "cust_nuevo", sessionId: null };

function seedOriginal(over: Partial<NonNullable<typeof state.design>> = {}) {
  state.design = {
    id: "orig_1",
    status: "USED_IN_ORDER",
    purgedAt: null,
    productId: "prod_1",
    templateId: "tpl_1",
    canvasData: { version: 2, slots: [{ slotIndex: 0, assetId: "asset_1" }] },
    metadata: { unitCount: 1 },
    previewUrl: "https://cdn.test/design-previews/orig_1/preview.png",
    productionUrl: null,
    productionUrls: ["orig_1/slot-01.png", "orig_1/slot-02.png"],
    moderationStatus: "APPROVED",
    qualityAcknowledgedAt: new Date("2026-09-01T00:00:00Z"),
    ...over,
  };
  state.assets = [
    {
      id: "asset_1",
      designId: "orig_1",
      customerId: "cust_viejo",
      sessionId: null,
      storageUrl: "cust_viejo/orig_1/foto-1.webp",
      mimeType: "image/webp",
      sizeBytes: 1234,
      width: 100,
      height: 100,
      exifStripped: true,
      malwareScanned: false,
      rightsAcceptedAt: new Date("2026-08-01T00:00:00Z"),
      rightsPolicyVersion: "v1",
    },
  ];
}

beforeEach(() => {
  state.design = null;
  state.assets = [];
  state.createdDesign = null;
  state.createdAssets = [];
  state.updates = [];
  state.deletedAssetsFor = [];
  state.deletedDesigns = [];
  state.copyCalls = [];
  state.copyFailFrom = null;
  state.removed = [];
});

describe("cloneDesignForReorder — clon feliz", () => {
  it("clona a READY con owner nuevo, assets y renders COPIADOS y canvas remapeado", async () => {
    seedOriginal();
    const clone = await cloneDesignForReorder("orig_1", OWNER);
    expect(clone).toEqual({ id: "clone_1" });

    // Fila creada como DRAFT (se promueve al final) con el owner NUEVO y el estado de
    // moderación/calidad heredado (contenido byte-idéntico al ya moderado).
    expect(state.createdDesign).toMatchObject({
      productId: "prod_1",
      templateId: "tpl_1",
      customerId: "cust_nuevo",
      sessionId: null,
      status: "DRAFT",
      previewUrl: "https://cdn.test/design-previews/orig_1/preview.png",
      moderationStatus: "APPROVED",
    });

    // Bytes copiados: la foto cruda y los DOS renders, a paths propios del clon.
    const uploadCopy = state.copyCalls.find((c) => c.bucket === "customer-uploads");
    expect(uploadCopy?.from).toBe("cust_viejo/orig_1/foto-1.webp");
    expect(uploadCopy?.to).toContain("cust_nuevo/clone_1/");
    const renderCopies = state.copyCalls.filter((c) => c.bucket === "production-assets");
    expect(renderCopies.map((c) => c.to)).toEqual(["clone_1/slot-01.png", "clone_1/slot-02.png"]);

    // El asset clonado apunta a la COPIA (no comparte storageUrl con el original) y
    // conserva la evidencia de consentimiento de derechos de imagen.
    expect(state.createdAssets).toHaveLength(1);
    expect(state.createdAssets[0]).toMatchObject({
      designId: "clone_1",
      customerId: "cust_nuevo",
      rightsPolicyVersion: "v1",
    });
    expect(state.createdAssets[0]!.storageUrl).toBe(uploadCopy!.to);

    // Promoción final: READY con productionUrls propios y canvas remapeado al nuevo assetId.
    const final = state.updates.at(-1)!;
    expect(final.status).toBe("READY");
    expect(final.productionUrls).toEqual(["clone_1/slot-01.png", "clone_1/slot-02.png"]);
    expect(final.productionUrl).toBeNull();
    const canvas = final.canvasData as { slots: Array<{ assetId: string }> };
    expect(canvas.slots[0]!.assetId).toBe("clone_asset_1");
    expect(canvas.slots[0]!.assetId).not.toBe("asset_1");
  });

  it("diseño legacy V1 (productionUrl single) también copia su render", async () => {
    seedOriginal({ productionUrls: [], productionUrl: "orig_1/produccion.png" });
    const clone = await cloneDesignForReorder("orig_1", OWNER);
    expect(clone).not.toBeNull();
    const final = state.updates.at(-1)!;
    expect(final.productionUrls).toEqual(["clone_1/produccion.png"]);
    expect(final.productionUrl).toBe("clone_1/produccion.png");
  });
});

describe("cloneDesignForReorder — gating por retención y estado", () => {
  it("rechaza un diseño purgado (purgedAt set) sin tocar Storage", async () => {
    seedOriginal({ purgedAt: new Date("2026-09-15T00:00:00Z"), productionUrls: [] });
    const clone = await cloneDesignForReorder("orig_1", OWNER);
    expect(clone).toBeNull();
    expect(state.copyCalls).toHaveLength(0);
    expect(state.createdDesign).toBeNull();
  });

  it("rechaza un diseño READY (el reorder solo clona USED_IN_ORDER)", async () => {
    seedOriginal({ status: "READY" });
    expect(await cloneDesignForReorder("orig_1", OWNER)).toBeNull();
    expect(state.createdDesign).toBeNull();
  });

  it("rechaza un diseño inexistente", async () => {
    expect(await cloneDesignForReorder("orig_1", OWNER)).toBeNull();
  });

  it("rechaza un USED_IN_ORDER sin renders vivos (nada que reimprimir)", async () => {
    seedOriginal({ productionUrls: [], productionUrl: null });
    expect(await cloneDesignForReorder("orig_1", OWNER)).toBeNull();
    expect(state.createdDesign).toBeNull();
  });

  it("rechaza sin dueño para el clon (ni customerId ni sessionId)", async () => {
    seedOriginal();
    expect(await cloneDesignForReorder("orig_1", { customerId: null, sessionId: null })).toBeNull();
  });
});

describe("cloneDesignForReorder — fallo de Storage a mitad", () => {
  it("devuelve null y limpia lo copiado + la fila del clon", async () => {
    seedOriginal();
    state.copyFailFrom = "orig_1/slot-01.png"; // falla el primer render, foto ya copiada

    const clone = await cloneDesignForReorder("orig_1", OWNER);

    expect(clone).toBeNull();
    // Cleanup: la foto copiada se borra del bucket de crudas y la fila clon se elimina.
    expect(state.removed.some((r) => r.bucket === "customer-uploads")).toBe(true);
    expect(state.deletedAssetsFor).toContain("clone_1");
    expect(state.deletedDesigns).toContain("clone_1");
    // Nunca se promovió a READY.
    expect(state.updates).toHaveLength(0);
  });
});
