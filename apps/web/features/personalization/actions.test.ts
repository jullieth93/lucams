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
      uploadCalls: 0,
      assetCreateCalls: 0,
      saveCanvasCalls: 0,
      finalizeCalls: 0,
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
      validation: undefined,
    };
  },
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    designAsset: {
      create: async () => {
        state.assetCreateCalls += 1;
        if (state.assetCreateError) throw state.assetCreateError;
        return { id: "asset_1" };
      },
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
  createDraftDesign: vi.fn(),
  createNameDesign: vi.fn(),
  createLetterSetDesign: vi.fn(),
  finalizeDesign: async () => {
    state.finalizeCalls += 1;
    if (state.finalizeError) throw state.finalizeError;
    return {
      previewUrl: "https://cdn.example/preview.png",
      status: "READY",
      productionUrls: ["p0"],
    };
  },
  getOwnedDesign: async () => null,
  saveCanvas: async () => {
    state.saveCanvasCalls += 1;
    if (state.saveCanvasError) throw state.saveCanvasError;
  },
}));

import { finalizeDesignAction, saveCanvasAction, uploadDesignAssetAction } from "./actions";

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
  state.uploadCalls = 0;
  state.assetCreateCalls = 0;
  state.saveCanvasCalls = 0;
  state.finalizeCalls = 0;
  vi.unstubAllEnvs();
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
