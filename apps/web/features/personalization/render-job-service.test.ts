/*
 * Unit tests del worker de render asíncrono (ADR-131, 2026-10-13).
 *
 * La máquina de estados del RenderJob es lo que sostiene la promesa "el usuario nunca espera
 * 60s a ciegas ni recibe el 500/504 del render síncrono": claim atómico, progreso por unidad,
 * reintento acotado, NEEDS_KONVA permanente (conserva los PNG del cliente si existen) y
 * re-encolado al agotar el presupuesto. Prisma, Storage y los motores nativos van mockeados;
 * el estado vive en vi.hoisted porque las factories de vi.mock se izan sobre los imports.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

type FakeJob = {
  id: string;
  designId: string;
  status: string;
  totalUnits: number;
  doneUnits: number;
  paths: string[];
  attempts: number;
  error: string | null;
  calendarYear: number | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const { state, MockNeedsKonva } = vi.hoisted(() => {
  class MockNeedsKonva extends Error {
    constructor(reason: string) {
      super(`NEEDS_KONVA: ${reason}`);
      this.name = "RenderNeedsKonvaError";
    }
  }
  return {
    MockNeedsKonva,
    state: {
      job: null as null | {
        id: string;
        designId: string;
        status: string;
        totalUnits: number;
        doneUnits: number;
        paths: string[];
        attempts: number;
        error: string | null;
        calendarYear: number | null;
        startedAt: Date | null;
        finishedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
      },
      design: null as null | {
        id: string;
        productId: string;
        metadata: Record<string, unknown>;
        canvasData: Record<string, unknown>;
        productionUrls: string[];
      },
      assets: [] as { id: string; storageUrl: string }[],
      productSchema: undefined as Record<string, unknown> | undefined,
      uploads: [] as { bucket: string; path: string; bytes: Buffer }[],
      /** "none" | "konva" | "generic" — qué lanza el motor mockeado. */
      renderMode: "none" as "none" | "konva" | "generic",
      renderedSlotIndexes: [] as number[],
      capturedErrors: [] as string[],
    },
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/error-capture", () => ({
  captureServerError: async (args: { message: string }) => {
    state.capturedErrors.push(args.message);
  },
}));

type JobPatch = Record<string, unknown>;

function applyJobData(job: NonNullable<typeof state.job>, data: JobPatch) {
  for (const [k, v] of Object.entries(data)) {
    if (k === "attempts" && v && typeof v === "object" && "increment" in (v as object)) {
      job.attempts += (v as { increment: number }).increment;
    } else {
      (job as unknown as Record<string, unknown>)[k] = v;
    }
  }
  job.updatedAt = new Date();
}

vi.mock("@/lib/db", () => ({
  prisma: {
    renderJob: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const j = state.job;
        if (!j) return null;
        const designId = where.designId as string | undefined;
        if (designId && j.designId !== designId) return null;
        const statusIn = (where.status as { in?: string[] } | undefined)?.in;
        if (statusIn && !statusIn.includes(j.status)) return null;
        const or = where.OR as { status?: string; updatedAt?: { lt: Date } }[] | undefined;
        if (or) {
          const ok = or.some((c) => {
            if (c.status !== j.status) return false;
            if (c.updatedAt?.lt && !(j.updatedAt < c.updatedAt.lt)) return false;
            return true;
          });
          if (!ok) return null;
        }
        return { id: j.id, status: j.status };
      },
      findUnique: async ({ where }: { where: { designId?: string; id?: string } }) => {
        const j = state.job;
        if (!j) return null;
        if (where.designId && j.designId !== where.designId) return null;
        if (where.id && j.id !== where.id) return null;
        return j;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id?: string; status?: string };
        data: JobPatch;
      }) => {
        const j = state.job;
        if (!j || j.id !== where.id) return { count: 0 };
        if (where.status && j.status !== where.status) return { count: 0 };
        applyJobData(j, data);
        return { count: 1 };
      },
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { designId: string };
        create: JobPatch;
        update: JobPatch;
      }) => {
        if (state.job && state.job.designId === where.designId) {
          applyJobData(state.job, update);
          return state.job;
        }
        state.job = {
          id: "job_1",
          designId: "design_1",
          status: "PENDING",
          totalUnits: 1,
          doneUnits: 0,
          paths: [],
          attempts: 0,
          error: null,
          calendarYear: null,
          startedAt: null,
          finishedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...(create as Partial<NonNullable<typeof state.job>>),
        } as NonNullable<typeof state.job>;
        return state.job;
      },
    },
    design: {
      findUnique: async () => state.design,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(state.design as object, data);
        return state.design;
      },
    },
    designAsset: {
      findMany: async () => state.assets,
    },
    product: {
      findUnique: async () => ({
        personalizationSchema: state.productSchema,
        personalizationKind: "PHOTO_PACK",
        variants: [],
      }),
    },
  },
}));

vi.mock("@/lib/supabase/service", () => ({
  supabaseService: {
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, body: Buffer) => {
          state.uploads.push({ bucket, path, bytes: Buffer.from(body) });
          return { data: { path }, error: null };
        },
        download: async () => ({
          data: { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer },
          error: null,
        }),
      }),
    },
  },
}));

vi.mock("./production-render", () => ({
  RenderNeedsKonvaError: MockNeedsKonva,
  renderProductionSlots: async (opts: { slots: { slotIndex: number }[] }) => {
    if (state.renderMode === "konva") throw new MockNeedsKonva("forzado por el test");
    if (state.renderMode === "generic") throw new Error("storage cayó (forzado por el test)");
    for (const s of opts.slots) state.renderedSlotIndexes.push(s.slotIndex);
    return opts.slots.map((s) => Buffer.from(`rendered-${s.slotIndex}`));
  },
}));
vi.mock("./production-render-canvas", () => ({
  renderProductionSlotsCanvas: async (opts: { slots: { slotIndex: number }[] }) => {
    if (state.renderMode === "konva") throw new MockNeedsKonva("forzado por el test (canvas)");
    return opts.slots.map((s) => Buffer.from(`rendered-canvas-${s.slotIndex}`));
  },
  renderCalendarMonthPagesCanvas: async (opts: { slots: { slotIndex: number }[] }) =>
    opts.slots.map((s) => Buffer.from(`page-${s.slotIndex}`)),
}));
vi.mock("./bookmark-strips", () => ({
  composeFaceStrips: async (buffers: Buffer[]) =>
    // 1 tira por par de caras, como el módulo real.
    Array.from({ length: Math.floor(buffers.length / 2) }, (_, i) => Buffer.from(`strip-${i}`)),
}));
vi.mock("./blank-back-face", () => ({
  blankBackFacePng: async () => Buffer.from("blank-back"),
  expandMissingBackFaces: async (buffers: Buffer[]) => buffers,
  blankOutEmptyBackFaces: async (buffers: Buffer[]) => buffers,
}));

import {
  createOrResetRenderJob,
  getRenderJobProgress,
  processRenderJobs,
  renderJobTotalUnits,
  staticClientFallbackReason,
  RENDER_JOB_MAX_ATTEMPTS,
} from "./render-job-service";

function makeSlots(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    slotIndex: i,
    assetId: `asset_${i}`,
    assetUrl: "https://cdn.test/a.png",
    photoTransform: { offsetX: 0, offsetY: 0, scale: 1 },
  }));
}

/** Diseño V2 de 3 slots solo-foto listo para el worker. */
function seedDesign(slotCount = 3, productionUrls: string[] = []) {
  state.productSchema = { photoSlots: slotCount };
  state.design = {
    id: "design_1",
    productId: "prod_1",
    metadata: {},
    canvasData: {
      version: 2,
      slotCount,
      unitTemplate: {
        version: 1,
        stage: { width: 300, height: 300 },
        layers: [
          { id: "bg", type: "background", color: "#FFFFFF" },
          { id: "ph", type: "image-placeholder", x: 0, y: 0, width: 300, height: 300 },
        ],
      },
      slots: makeSlots(slotCount),
    },
    productionUrls,
  };
  state.assets = Array.from({ length: slotCount }, (_, i) => ({
    id: `asset_${i}`,
    storageUrl: `owner/design_1/${i}.png`,
  }));
}

function seedJob(overrides: Partial<FakeJob> = {}) {
  state.job = {
    id: "job_1",
    designId: "design_1",
    status: "PENDING",
    totalUnits: 3,
    doneUnits: 0,
    paths: [],
    attempts: 0,
    error: null,
    calendarYear: null,
    startedAt: null,
    finishedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  state.job = null;
  state.design = null;
  state.assets = [];
  state.productSchema = undefined;
  state.uploads = [];
  state.renderMode = "none";
  state.renderedSlotIndexes = [];
  state.capturedErrors = [];
});

describe("staticClientFallbackReason", () => {
  const baseSlot = {
    slotIndex: 0,
    assetId: "a",
    assetUrl: "u",
    photoTransform: { offsetX: 0, offsetY: 0, scale: 1 },
  };

  it("null para un canvas limpio", () => {
    expect(
      staticClientFallbackReason({ version: 2, slotCount: 1, slots: [baseSlot] } as never),
    ).toBeNull();
  });
  it("filtro en cualquier slot → fallback al cliente (fidelidad Konva)", () => {
    expect(
      staticClientFallbackReason({
        version: 2,
        slotCount: 2,
        slots: [baseSlot, { ...baseSlot, slotIndex: 1, filter: "vivid" }],
      } as never),
    ).toMatch(/filtro/);
  });
  it("foto rotada → fallback", () => {
    expect(
      staticClientFallbackReason({
        version: 2,
        slotCount: 1,
        slots: [
          { ...baseSlot, photoTransform: { offsetX: 0, offsetY: 0, scale: 1, rotation: 90 } },
        ],
      } as never),
    ).toMatch(/rotada/);
  });
  it("override de texto multilínea → fallback", () => {
    expect(
      staticClientFallbackReason({
        version: 2,
        slotCount: 1,
        slots: [{ ...baseSlot, textOverrides: { t: { text: "línea 1\nlínea 2" } } }],
      } as never),
    ).toMatch(/multilínea/);
  });
});

describe("renderJobTotalUnits", () => {
  it("un slot = una unidad salvo separadores 2-caras (unidad = tira)", () => {
    expect(renderJobTotalUnits({}, 12)).toBe(12);
    expect(renderJobTotalUnits({ facesPerUnit: 2 }, 12)).toBe(6);
    expect(renderJobTotalUnits({ facesPerUnit: 2 }, 5)).toBe(5); // impar no compone
  });
});

describe("createOrResetRenderJob", () => {
  it("crea el job PENDING con el totalUnits del producto", async () => {
    seedDesign(3);
    await createOrResetRenderJob({ designId: "design_1", productId: "prod_1", slotCount: 3 });
    expect(state.job).toMatchObject({ designId: "design_1", status: "PENDING", totalUnits: 3 });
  });

  it("resetea un job existente (re-finalize tras reopen): progreso, intentos y error a cero", async () => {
    seedDesign(3);
    seedJob({ status: "FAILED", attempts: 3, doneUnits: 2, paths: ["a", "b"], error: "x" });
    await createOrResetRenderJob({ designId: "design_1", productId: "prod_1", slotCount: 3 });
    expect(state.job).toMatchObject({
      status: "PENDING",
      attempts: 0,
      doneUnits: 0,
      paths: [],
      error: null,
    });
  });
});

describe("processRenderJobs — máquina de estados", () => {
  it("camino feliz: renderiza unidad por unidad, sube cada PNG y cierra DONE con productionUrls completo", async () => {
    seedDesign();
    seedJob();
    const res = await processRenderJobs({ onlyDesignId: "design_1" });
    expect(res).toMatchObject({ claimed: 1, done: 1, failed: 0, requeued: 0 });
    expect(state.job).toMatchObject({ status: "DONE", doneUnits: 3 });
    expect(state.uploads.map((u) => u.path)).toEqual([
      "design_1/slot-01.png",
      "design_1/slot-02.png",
      "design_1/slot-03.png",
    ]);
    // El diseño recibe la lista COMPLETA solo al DONE (nunca parcial).
    expect(state.design?.productionUrls).toEqual([
      "design_1/slot-01.png",
      "design_1/slot-02.png",
      "design_1/slot-03.png",
    ]);
    expect(state.renderedSlotIndexes).toEqual([0, 1, 2]);
  });

  it("reanuda desde doneUnits sin repetir unidades ya subidas (crash a la mitad)", async () => {
    seedDesign();
    seedJob({ doneUnits: 1, paths: ["design_1/slot-01.png"] });
    await processRenderJobs({ onlyDesignId: "design_1" });
    expect(state.renderedSlotIndexes).toEqual([1, 2]); // el slot 0 NO se re-renderiza
    expect(state.job).toMatchObject({ status: "DONE", doneUnits: 3 });
    expect(state.design?.productionUrls).toHaveLength(3);
  });

  it("NEEDS_KONVA sin PNG del cliente → FAILED terminal de inmediato (no gasta reintentos)", async () => {
    seedDesign();
    seedJob();
    state.renderMode = "konva";
    const res = await processRenderJobs({ onlyDesignId: "design_1" });
    expect(res.failed).toBe(1);
    expect(state.job).toMatchObject({ status: "FAILED", attempts: 0 });
    expect(state.job?.error).toMatch(/NEEDS_KONVA/);
  });

  it("NEEDS_KONVA con PNG del cliente ya subidos → DONE conservándolos (job de mejora)", async () => {
    seedDesign(3, ["design_1/slot-01.png", "design_1/slot-02.png", "design_1/slot-03.png"]);
    seedJob();
    state.renderMode = "konva";
    const res = await processRenderJobs({ onlyDesignId: "design_1" });
    expect(res.done).toBe(1);
    expect(state.job?.status).toBe("DONE");
    expect(state.uploads).toHaveLength(0); // no pisó nada
    expect(state.design?.productionUrls).toHaveLength(3); // intactos
  });

  it("error transitorio → vuelve a PENDING con attempts+1; tras MAX_ATTEMPTS queda FAILED y cae en ErrorLog", async () => {
    seedDesign();
    seedJob();
    state.renderMode = "generic";
    for (let i = 1; i <= RENDER_JOB_MAX_ATTEMPTS; i++) {
      const res = await processRenderJobs({ onlyDesignId: "design_1" });
      if (i < RENDER_JOB_MAX_ATTEMPTS) {
        expect(res.requeued).toBe(1);
        expect(state.job).toMatchObject({ status: "PENDING", attempts: i });
      } else {
        expect(res.failed).toBe(1);
        expect(state.job).toMatchObject({ status: "FAILED", attempts: RENDER_JOB_MAX_ATTEMPTS });
      }
    }
    expect(state.capturedErrors).toHaveLength(1); // solo el FAILED terminal escribe ErrorLog
    expect(state.capturedErrors[0]).toMatch(/storage cayó/);
    // FAILED es terminal: el claim global ya no lo recoge.
    const again = await processRenderJobs({});
    expect(again.claimed).toBe(0);
  });

  it("presupuesto agotado → re-encola PENDING SIN quemar intento (un job grande no muere por ticks)", async () => {
    seedDesign();
    seedJob();
    const res = await processRenderJobs({ onlyDesignId: "design_1", budgetMs: -1 });
    expect(res).toMatchObject({ claimed: 1, requeued: 1 });
    expect(state.job).toMatchObject({ status: "PENDING", doneUnits: 0, attempts: 0 });
  });

  it("separadores 2-caras: la unidad es la TIRA (tira-NN.png), una por par de slots", async () => {
    seedDesign(4);
    state.productSchema = { photoSlots: 4, facesPerUnit: 2 };
    seedJob({ totalUnits: 2 });
    const res = await processRenderJobs({ onlyDesignId: "design_1" });
    expect(res.done).toBe(1);
    expect(state.uploads.map((u) => u.path)).toEqual([
      "design_1/tira-01.png",
      "design_1/tira-02.png",
    ]);
    expect(state.job).toMatchObject({ status: "DONE", doneUnits: 2 });
    expect(state.design?.productionUrls).toEqual(["design_1/tira-01.png", "design_1/tira-02.png"]);
  });

  it("job reclamado por nadie cuando no hay elegibles (todo terminal) → claimed 0", async () => {
    seedDesign();
    seedJob({ status: "FAILED" });
    const res = await processRenderJobs({ onlyDesignId: "design_1" });
    expect(res.claimed).toBe(0);
  });
});

describe("getRenderJobProgress", () => {
  it("devuelve status y contadores para el polling del Estudio", async () => {
    seedJob({ doneUnits: 1 });
    const progress = await getRenderJobProgress("design_1");
    expect(progress).toMatchObject({ status: "PENDING", doneUnits: 1, totalUnits: 3 });
    expect(await getRenderJobProgress("otro")).toBeNull();
  });
});
