/*
 * Unit tests for the personalization Server Actions (pre-launch audit 2026-09-04).
 *
 * F-08: uploadDesignAssetAction rate-limits by IP (ipKey) BEFORE the owner bucket — a
 * cookieless bot gets a fresh sessionId per request and rotated the ownerKey bucket.
 * F-30: INTERNAL error paths no longer return raw err.message to anonymous callers — only
 * customer-safe domain copies pass (StorageError allowlist / INCOMPLETE_SLOTS); anything
 * unexpected maps to a generic es-CO message and keeps the detail in the server log.
 *
 * Everything around the actions (rate-limit, service layer, prisma, storage, auth) is mocked;
 * the real rate-limit-keys hashing runs so the tests assert the actual bucket key format.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { state, MockStorageError } = vi.hoisted(() => {
  class MockStorageError extends Error {
    constructor(
      public code:
        "FILE_TOO_LARGE" | "INVALID_TYPE" | "UPLOAD_FAILED" | "DELETE_FAILED" | "EMPTY_FILE",
      message: string,
    ) {
      super(message);
      this.name = "StorageError";
    }
  }
  return {
    MockStorageError,
    state: {
      rateLimitCalls: [] as Array<{ key: string; limit: number; windowSeconds: number }>,
      rateLimitDeny: [] as string[],
      saveCanvasError: null as Error | null,
      finalizeError: null as Error | null,
      ticketsError: null as Error | null,
      uploadError: null as Error | null,
      assetCreateError: null as Error | null,
      uploadValidation: undefined as unknown,
      uploadCalls: 0,
      assetCreateCalls: 0,
      assetCreateArgs: [] as Array<Record<string, unknown>>,
      galleryAssets: [] as Array<Record<string, unknown>>,
      saveCanvasCalls: 0,
      finalizeCalls: 0,
      saveCanvasArgs: [] as Array<Record<string, unknown>>,
      createDraftArgs: [] as Array<Record<string, unknown>>,
      finalizeArgs: [] as Array<Record<string, unknown>>,
    },
  };
});

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-vercel-forwarded-for": "203.0.113.7" }),
}));
vi.mock("@/lib/auth", () => ({ getCurrentCustomer: async () => null }));
vi.mock("@/lib/cart-session", () => ({
  peekCartSession: async () => "sess_test",
  getOrCreateCartSession: async () => "sess_test",
}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: async (key: string, limit: number, windowSeconds: number) => {
    state.rateLimitCalls.push({ key, limit, windowSeconds });
    return {
      allowed: !state.rateLimitDeny.some((fragment) => key.includes(fragment)),
      count: 1,
      resetAt: new Date(),
    };
  },
}));
vi.mock("@/lib/storage", () => ({
  StorageError: MockStorageError,
  uploadCustomerPhoto: async () => {
    state.uploadCalls += 1;
    if (state.uploadError) throw state.uploadError;
    return {
      path: "sess_test/pending/uuid.jpg",
      signedUrl: "https://signed.example/upload",
      width: 100,
      height: 100,
      sizeBytes: 3,
      mimeType: "image/jpeg",
      exifStripped: true,
      validation: state.uploadValidation ?? undefined,
    };
  },
  refreshCustomerUploadSignedUrl: async (path: string) => `https://signed.example/fresh/${path}`,
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    designAsset: {
      create: async (args: { data: Record<string, unknown> }) => {
        state.assetCreateCalls += 1;
        state.assetCreateArgs.push(args.data);
        if (state.assetCreateError) throw state.assetCreateError;
        return { id: "asset_1" };
      },
      findMany: async () => state.galleryAssets,
    },
    product: { findUnique: async () => null },
  },
}));
vi.mock("./design-gallery", () => ({ getGalleryImageById: vi.fn(async () => null) }));
vi.mock("./service", () => ({
  createClientSlotUploadTickets: async () => {
    if (state.ticketsError) throw state.ticketsError;
    return [{ slotIndex: 0, url: "https://signed.example/slot0" }];
  },
  createDraftDesign: async (args: Record<string, unknown>) => {
    state.createDraftArgs.push(args);
    return { id: "design_d1" };
  },
  createNameDesign: vi.fn(),
  createLetterSetDesign: vi.fn(async () => ({ id: "design_ls1", letters: ["A"], language: "es" })),
  finalizeDesign: async (args: Record<string, unknown>) => {
    state.finalizeCalls += 1;
    state.finalizeArgs.push(args);
    if (state.finalizeError) throw state.finalizeError;
    return {
      previewUrl: "https://cdn.example/preview.png",
      status: "READY",
      productionUrls: ["p0"],
    };
  },
  getOwnedDesign: vi.fn(async () => null),
  saveCanvas: async (args: Record<string, unknown>) => {
    state.saveCanvasCalls += 1;
    state.saveCanvasArgs.push(args);
    if (state.saveCanvasError) throw state.saveCanvasError;
  },
}));

import {
  assignPredesignedToDesignAction,
  createDraftDesignAction,
  createLetterSetDesignAction,
  createNameDesignAction,
  finalizeDesignAction,
  saveCanvasAction,
  uploadDesignAssetAction,
} from "./actions";
import { createLetterSetDesign, createNameDesign, getOwnedDesign } from "./service";
import { getGalleryImageById } from "./design-gallery";

const VALID_LETTERSET_INPUT = {
  productId: "prod_1",
  variantId: "var_1",
  frameTheme: "arcoiris",
};

const VALID_NAME_INPUT = {
  productId: "prod_1",
  variantId: "var_1",
  name: "LUCIA",
};

describe("createNameDesignAction · opción de borde (Lucy 2026-09-09)", () => {
  beforeEach(() => {
    vi.mocked(createNameDesign).mockReset();
    vi.mocked(createNameDesign).mockResolvedValue({
      id: "design_n1",
      display: "LUCIA",
      letters: ["L", "U", "C", "I", "A"],
    });
  });

  it("acepta withBorder: false y lo pasa al service (se persiste en metadata)", async () => {
    const result = await createNameDesignAction({ ...VALID_NAME_INPUT, withBorder: false });
    expect(result).toMatchObject({ ok: true, designId: "design_n1" });
    expect(createNameDesign).toHaveBeenCalledWith(expect.objectContaining({ withBorder: false }));
  });

  it("sin withBorder defaultea a true (retrocompatible con clientes cacheados previos)", async () => {
    const result = await createNameDesignAction(VALID_NAME_INPUT);
    expect(result.ok).toBe(true);
    expect(createNameDesign).toHaveBeenCalledWith(expect.objectContaining({ withBorder: true }));
  });

  it("rechaza valores inválidos (string/number/null) sin tocar el service", async () => {
    for (const bad of ["sin", 0, 1, null]) {
      const result = await createNameDesignAction({ ...VALID_NAME_INPUT, withBorder: bad });
      expect(result).toMatchObject({ ok: false, message: "Datos inválidos." });
    }
    expect(createNameDesign).not.toHaveBeenCalled();
  });
});

describe("createLetterSetDesignAction · opción de borde (Lucy 2026-09-05)", () => {
  beforeEach(() => {
    vi.mocked(createLetterSetDesign).mockClear();
  });

  it("acepta withBorder: false y lo pasa al service", async () => {
    const result = await createLetterSetDesignAction({
      ...VALID_LETTERSET_INPUT,
      withBorder: false,
    });
    expect(result).toMatchObject({ ok: true, designId: "design_ls1" });
    expect(createLetterSetDesign).toHaveBeenCalledWith(
      expect.objectContaining({ withBorder: false }),
    );
  });

  it("sin withBorder defaultea a true (retrocompatible con clientes cacheados previos)", async () => {
    const result = await createLetterSetDesignAction(VALID_LETTERSET_INPUT);
    expect(result.ok).toBe(true);
    expect(createLetterSetDesign).toHaveBeenCalledWith(
      expect.objectContaining({ withBorder: true }),
    );
  });

  it("rechaza valores inválidos (string/number/null) sin tocar el service", async () => {
    for (const bad of ["sin", 0, 1, null]) {
      const result = await createLetterSetDesignAction({
        ...VALID_LETTERSET_INPUT,
        withBorder: bad,
      });
      expect(result).toMatchObject({ ok: false, message: "Datos inválidos." });
    }
    expect(createLetterSetDesign).not.toHaveBeenCalled();
  });
});

describe("createDraftDesignAction · templateId del boot (N-08)", () => {
  it("pasa el templateId elegido al service (deep-link ?template= resuelto en la página)", async () => {
    const result = await createDraftDesignAction({ productId: "prod_1", templateId: "tpl_1" });
    expect(result).toMatchObject({ ok: true, designId: "design_d1" });
    expect(state.createDraftArgs).toHaveLength(1);
    expect(state.createDraftArgs[0]).toMatchObject({
      productId: "prod_1",
      templateId: "tpl_1",
      sessionId: "sess_test",
    });
  });

  it("sin templateId crea el draft con la plantilla por defecto (undefined al service)", async () => {
    const result = await createDraftDesignAction({ productId: "prod_1" });
    expect(result).toMatchObject({ ok: true, designId: "design_d1" });
    expect(state.createDraftArgs[0]).toMatchObject({ productId: "prod_1", templateId: undefined });
  });

  it("rechaza un templateId con tipo inválido sin tocar el service", async () => {
    const result = await createDraftDesignAction({
      productId: "prod_1",
      templateId: 123 as unknown as string,
    });
    expect(result).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(state.createDraftArgs).toHaveLength(0);
  });
});

describe("saveCanvasAction · templateId del sidebar (N-08)", () => {
  it("reenvía el templateId al service (que lo valida contra el producto)", async () => {
    const result = await saveCanvasAction({
      designId: "design_1",
      canvasData: VALID_CANVAS_V1,
      templateId: "tpl_1",
    });
    expect(result).toMatchObject({ ok: true });
    expect(state.saveCanvasArgs[0]).toMatchObject({ designId: "design_1", templateId: "tpl_1" });
  });

  it("sin templateId guarda solo el canvas (templateId undefined al service)", async () => {
    const result = await saveCanvasAction({ designId: "design_1", canvasData: VALID_CANVAS_V1 });
    expect(result).toMatchObject({ ok: true });
    expect(state.saveCanvasArgs[0]).toMatchObject({ designId: "design_1", templateId: undefined });
  });

  it("rechaza un templateId con tipo inválido (VALIDATION, copy customer-safe)", async () => {
    const result = await saveCanvasAction({
      designId: "design_1",
      canvasData: VALID_CANVAS_V1,
      templateId: 42 as unknown as string,
    });
    expect(result).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(state.saveCanvasCalls).toBe(0);
  });
});

function makeUploadForm(): FormData {
  const fd = new FormData();
  fd.set(
    "file",
    new File([new Uint8Array([0xff, 0xd8, 0xff])], "foto.jpg", { type: "image/jpeg" }),
  );
  fd.set("rightsAccepted", "true");
  return fd;
}

function makeFinalizeForm(): FormData {
  const fd = new FormData();
  fd.set("designId", "design_1");
  fd.set("slotCount", "1");
  fd.set("preview", new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }), "preview.png");
  return fd;
}

const VALID_CANVAS_V1 = { version: 1, stage: { width: 1080, height: 1080 }, layers: [] };

beforeEach(() => {
  state.rateLimitCalls = [];
  state.rateLimitDeny = [];
  state.saveCanvasError = null;
  state.finalizeError = null;
  state.ticketsError = null;
  state.uploadError = null;
  state.assetCreateError = null;
  state.uploadValidation = undefined;
  state.uploadCalls = 0;
  state.assetCreateCalls = 0;
  state.assetCreateArgs = [];
  state.galleryAssets = [];
  state.saveCanvasCalls = 0;
  state.finalizeCalls = 0;
  state.saveCanvasArgs = [];
  state.createDraftArgs = [];
  state.finalizeArgs = [];
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.mocked(getOwnedDesign).mockReset();
  vi.mocked(getOwnedDesign).mockResolvedValue(null);
  vi.mocked(getGalleryImageById).mockReset();
  vi.mocked(getGalleryImageById).mockResolvedValue(null);
  // Deterministic non-prod limits (the actions branch on VERCEL_ENV === "production").
  vi.stubEnv("VERCEL_ENV", "development");
});

describe("uploadDesignAssetAction · rate-limit por IP (F-08)", () => {
  it("frena al bot sin cookies en el bucket de IP ANTES del de owner (nada se sube)", async () => {
    state.rateLimitDeny.push(":ip:");
    const result = await uploadDesignAssetAction(makeUploadForm());
    expect(result).toMatchObject({ ok: false, code: "RATE_LIMIT" });
    expect(state.rateLimitCalls).toHaveLength(1);
    expect(state.rateLimitCalls[0]!.key).toMatch(/^upload_design_asset:ip:/);
    expect(state.rateLimitCalls[0]).toMatchObject({ limit: 200, windowSeconds: 600 });
    expect(state.uploadCalls).toBe(0);
    expect(state.assetCreateCalls).toBe(0);
  });

  it("en el camino feliz corren las dos capas: primero :ip:, después :owner:", async () => {
    const result = await uploadDesignAssetAction(makeUploadForm());
    expect(result.ok).toBe(true);
    expect(state.rateLimitCalls.map((c) => c.key)).toEqual([
      expect.stringMatching(/^upload_design_asset:ip:/),
      "upload_design_asset:owner:sess_test",
    ]);
    expect(state.uploadCalls).toBe(1);
    expect(state.assetCreateCalls).toBe(1);
  });

  it("la capa de owner sigue activa cuando la IP está limpia", async () => {
    state.rateLimitDeny.push(":owner:");
    const result = await uploadDesignAssetAction(makeUploadForm());
    expect(result).toMatchObject({ ok: false, code: "RATE_LIMIT" });
    expect(state.rateLimitCalls).toHaveLength(2);
    expect(state.uploadCalls).toBe(0);
  });
});

describe("uploadDesignAssetAction · recomendación específica de calidad (Paquete C)", () => {
  it("serializa la recomendación del caso y qué checks fallaron al cliente", async () => {
    state.uploadValidation = {
      level: "warning-strong",
      resolution: {
        passed: false,
        level: "warning-strong",
        actualMinPx: 300,
        requiredPx: 591,
        ratio: 0.51,
        message: "Se va a ver pixelada al imprimir a tamaño real (5×5 cm).",
      },
      brightness: { passed: true, level: "ok", meanLuminance: 120 },
      blur: { passed: true, level: "ok", laplacianStdev: 40 },
      message: "Se va a ver pixelada al imprimir a tamaño real (5×5 cm).",
      recommendation: "Una foto más grande va a quedar mejor al imprimir.",
    };
    const result = await uploadDesignAssetAction(makeUploadForm());
    expect(result).toMatchObject({
      ok: true,
      validationLevel: "warning-strong",
      validationMessage: "Se va a ver pixelada al imprimir a tamaño real (5×5 cm).",
      validationRecommendation: "Una foto más grande va a quedar mejor al imprimir.",
      validationChecks: { resolution: false, brightness: true, blur: true },
    });
  });

  it("sin validación (validator opcional falló) no rompe la respuesta", async () => {
    const result = await uploadDesignAssetAction(makeUploadForm());
    expect(result).toMatchObject({
      ok: true,
      validationLevel: undefined,
      validationRecommendation: undefined,
      validationChecks: undefined,
    });
  });
});

describe("finalizeDesignAction · aceptación explícita de calidad (Paquete C)", () => {
  it("reenvía qualityAcknowledged=true al service cuando el checkbox viajó en el form", async () => {
    const fd = makeFinalizeForm();
    fd.set("qualityAcknowledged", "1");
    const result = await finalizeDesignAction(fd);
    expect(result.ok).toBe(true);
    expect(state.finalizeArgs).toHaveLength(1);
    expect(state.finalizeArgs[0]).toMatchObject({ qualityAcknowledged: true });
  });

  it("sin el flag en el form, el service recibe qualityAcknowledged=false", async () => {
    const result = await finalizeDesignAction(makeFinalizeForm());
    expect(result.ok).toBe(true);
    expect(state.finalizeArgs[0]).toMatchObject({ qualityAcknowledged: false });
  });
});

describe("F-30 · errores inesperados no devuelven err.message crudo al anónimo", () => {
  it("upload: StorageError INVALID_TYPE (dominio customer-safe) sí llega con su copy", async () => {
    state.uploadError = new MockStorageError(
      "INVALID_TYPE",
      "El archivo no es una imagen válida (jpg/png/webp/heic/heif).",
    );
    const result = await uploadDesignAssetAction(makeUploadForm());
    expect(result).toMatchObject({
      ok: false,
      code: "INTERNAL",
      message: "El archivo no es una imagen válida (jpg/png/webp/heic/heif).",
    });
  });

  it("upload: StorageError UPLOAD_FAILED (detalle Supabase interno) → copy genérico", async () => {
    state.uploadError = new MockStorageError(
      "UPLOAD_FAILED",
      "Error subiendo: The resource already exists",
    );
    const result = await uploadDesignAssetAction(makeUploadForm());
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("already exists");
    expect(JSON.stringify(result)).not.toContain("Error subiendo");
  });

  it("upload: un error de Prisma al persistir el asset → copy genérico", async () => {
    state.assetCreateError = new Error(
      "PrismaClientKnownRequestError: Unique constraint failed on the fields: (`sessionId`)",
    );
    const result = await uploadDesignAssetAction(makeUploadForm());
    expect(result).toMatchObject({ ok: false, code: "INTERNAL" });
    expect(JSON.stringify(result)).not.toContain("Prisma");
  });

  it("saveCanvas: error interno del service → copy genérico, no el crudo en inglés", async () => {
    state.saveCanvasError = new Error("Design is READY — only DRAFT can be edited");
    const result = await saveCanvasAction({ designId: "design_1", canvasData: VALID_CANVAS_V1 });
    expect(result).toMatchObject({ ok: false, code: "INTERNAL" });
    expect(JSON.stringify(result)).not.toContain("DRAFT");
  });

  it("finalize: INCOMPLETE_SLOTS conserva su código y su copy de dominio", async () => {
    state.finalizeError = new Error("INCOMPLETE_SLOTS: slots vacíos 2");
    const result = await finalizeDesignAction(makeFinalizeForm());
    expect(result).toMatchObject({
      ok: false,
      code: "INCOMPLETE_SLOTS",
      message: "INCOMPLETE_SLOTS: slots vacíos 2",
    });
  });

  it("finalize: error inesperado (Prisma/Supabase) → INTERNAL con copy genérico", async () => {
    state.finalizeError = new Error(
      "PrismaClientInitializationError: Can't reach database server at db.internal:5432",
    );
    const result = await finalizeDesignAction(makeFinalizeForm());
    expect(result).toMatchObject({ ok: false, code: "INTERNAL" });
    expect(JSON.stringify(result)).not.toContain("Prisma");
    expect(JSON.stringify(result)).not.toContain("db.internal");
  });

  it("finalize: fallo emitiendo tickets de subida → INTERNAL con copy genérico", async () => {
    state.finalizeError = new Error(
      "NEEDS_CLIENT_SLOTS: el servidor no pudo renderizar los 1 PNG de imprenta",
    );
    state.ticketsError = new Error(
      "No pudimos preparar la subida del slot 1: new row violates row-level security policy",
    );
    const result = await finalizeDesignAction(makeFinalizeForm());
    expect(result).toMatchObject({ ok: false, code: "INTERNAL" });
    expect(JSON.stringify(result)).not.toContain("row-level security");
    expect(JSON.stringify(result)).not.toContain("slot 1: new row");
  });
});

describe("assignPredesignedToDesignAction · dedupe por galleryImageId (2026-10-02)", () => {
  const SUPABASE = "https://supabase.example";
  const URL_A = `${SUPABASE}/storage/v1/object/public/gallery/diseno-a.png`;
  const URL_B = `${SUPABASE}/storage/v1/object/public/gallery/diseno-b.png`;

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(3),
        headers: new Headers({ "content-type": "image/png" }),
      })),
    );
    vi.mocked(getOwnedDesign).mockResolvedValue({ id: "design_1" } as never);
    vi.mocked(getGalleryImageById).mockResolvedValue({
      id: "gal_1",
      imageUrl: URL_A,
      imageUrlB: null,
    });
  });

  it("sin asset previo: sube la imagen y crea el asset sellado con galleryImageId", async () => {
    const result = await assignPredesignedToDesignAction({
      designId: "design_1",
      galleryImageId: "gal_1",
    });
    expect(result).toMatchObject({ ok: true, assetId: "asset_1" });
    expect(state.uploadCalls).toBe(1);
    expect(state.assetCreateCalls).toBe(1);
    expect(state.assetCreateArgs[0]).toMatchObject({
      designId: "design_1",
      galleryImageId: "gal_1",
    });
  });

  it("con asset previo: reusA sin fetch/upload/create y devuelve signedUrl fresca", async () => {
    state.galleryAssets = [
      {
        id: "asset_previo",
        storageUrl: "sess_test/previo.png",
        width: 800,
        height: 600,
        createdAt: new Date("2026-10-01"),
      },
    ];
    const result = await assignPredesignedToDesignAction({
      designId: "design_1",
      galleryImageId: "gal_1",
    });
    expect(result).toMatchObject({
      ok: true,
      assetId: "asset_previo",
      signedUrl: "https://signed.example/fresh/sess_test/previo.png",
      width: 800,
      height: 600,
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(state.uploadCalls).toBe(0);
    expect(state.assetCreateCalls).toBe(0);
  });

  it("par A/B: con ambos assets previos reusA los dos (orden createdAt); sin B, sube solo la B", async () => {
    vi.mocked(getGalleryImageById).mockResolvedValue({
      id: "gal_1",
      imageUrl: URL_A,
      imageUrlB: URL_B,
    });

    // Ambos existen → cero uploads.
    state.galleryAssets = [
      {
        id: "asset_a",
        storageUrl: "sess_test/a.png",
        width: 800,
        height: 600,
        createdAt: new Date("2026-10-01T00:00:00Z"),
      },
      {
        id: "asset_b",
        storageUrl: "sess_test/b.png",
        width: 800,
        height: 600,
        createdAt: new Date("2026-10-01T00:00:01Z"),
      },
    ];
    const both = await assignPredesignedToDesignAction({
      designId: "design_1",
      galleryImageId: "gal_1",
    });
    expect(both).toMatchObject({
      ok: true,
      assetId: "asset_a",
      assetB: { assetId: "asset_b" },
    });
    expect(state.assetCreateCalls).toBe(0);

    // Solo existe la A → la B se sube nueva (sellada con galleryImageId).
    state.galleryAssets = state.galleryAssets.slice(0, 1);
    state.assetCreateCalls = 0;
    state.uploadCalls = 0;
    const onlyA = await assignPredesignedToDesignAction({
      designId: "design_1",
      galleryImageId: "gal_1",
    });
    expect(onlyA).toMatchObject({
      ok: true,
      assetId: "asset_a",
      assetB: { assetId: "asset_1" },
    });
    expect(state.uploadCalls).toBe(1);
    expect(state.assetCreateCalls).toBe(1);
    expect(state.assetCreateArgs.at(-1)).toMatchObject({ galleryImageId: "gal_1" });
  });
});
