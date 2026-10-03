/*
 * Unit tests — invalidación de caché del SERVICE de REDIRECTS (B-8).
 *
 * Regresión B-8 (auditoría cableado cliente↔admin 2026-10-02): el lookup del
 * proxy migró de un Map in-memory por instancia a unstable_cache con tag
 * "redirects" (Data Cache compartida). Para que el cambio funcione, TODA
 * mutación de UrlRedirect debe emitir updateTag("redirects") — incluidas las
 * automáticas de catálogo (createSlugRenameRedirect,
 * archiveRedirectOccupyingPath), no solo las actions de /admin/redirects.
 *
 * Estrategia: prisma, next/cache (updateTag spy + unstable_cache passthrough
 * controlable) y los getters de catálogo mockeados; se ejerce el service
 * real. Mismo harness que app/admin/(panel)/ocasiones/actions.test.ts.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, updateTagSpy, cacheState } = vi.hoisted(() => ({
  mockPrisma: {
    urlRedirect: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
  updateTagSpy: vi.fn(),
  // "passthrough" = unstable_cache ejecuta el callback directo (comportamiento
  // normal en producción con incrementalCache). "e469" = simula el invariante
  // de Next 16 cuando NO hay incrementalCache (vitest/scripts standalone).
  cacheState: { mode: "passthrough" as "passthrough" | "e469" },
}));

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));
vi.mock("next/cache", () => ({
  updateTag: updateTagSpy,
  unstable_cache:
    (fn: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) => {
      if (cacheState.mode === "e469") {
        const err = new Error("Invariant: incrementalCache missing in unstable_cache");
        (err as { __NEXT_ERROR_CODE?: string }).__NEXT_ERROR_CODE = "E469";
        throw err;
      }
      return fn(...args);
    },
}));
vi.mock("@/features/products/public-service", () => ({
  getStorefrontProductBySlug: vi.fn(async () => null),
}));
vi.mock("@/lib/catalog", () => ({
  getCategoryBySlug: vi.fn(async () => null),
  getOcasionBySlug: vi.fn(async () => null),
}));

import {
  archiveRedirect,
  archiveRedirectOccupyingPath,
  createRedirect,
  createSlugRenameRedirect,
  lookupActiveRedirectCached,
  restoreRedirect,
  toggleRedirectActive,
  updateRedirect,
} from "./service";

const ACTOR = "admin-1";
let seq = 0;
function nextPath(suffix = "") {
  seq += 1;
  return `/b8-test/p${seq}${suffix}`;
}

beforeEach(() => {
  vi.clearAllMocks();
  cacheState.mode = "passthrough";
  mockPrisma.urlRedirect.findUnique.mockResolvedValue(null);
  mockPrisma.urlRedirect.findFirst.mockResolvedValue(null);
  mockPrisma.urlRedirect.create.mockImplementation(async ({ data }) => ({ id: "r1", ...data }));
  mockPrisma.urlRedirect.update.mockImplementation(async ({ data }) => ({ id: "r1", ...data }));
  mockPrisma.urlRedirect.updateMany.mockResolvedValue({ count: 1 });
});

describe("redirects/service — invalidación del tag 'redirects' (B-8)", () => {
  it("createRedirect emite updateTag('redirects') tras persistir", async () => {
    await createRedirect({ fromPath: nextPath(), toPath: "/productos", statusCode: 301 }, ACTOR);
    expect(mockPrisma.urlRedirect.create).toHaveBeenCalledTimes(1);
    expect(updateTagSpy).toHaveBeenCalledWith("redirects");
    expect(updateTagSpy).toHaveBeenCalledTimes(1);
  });

  it("createRedirect que REUSA un row archivado también invalida", async () => {
    mockPrisma.urlRedirect.findUnique.mockResolvedValue({
      id: "r-old",
      deletedAt: new Date(),
    });
    await createRedirect({ fromPath: nextPath(), toPath: "/productos", statusCode: 302 }, ACTOR);
    expect(mockPrisma.urlRedirect.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.urlRedirect.create).not.toHaveBeenCalled();
    expect(updateTagSpy).toHaveBeenCalledWith("redirects");
  });

  it("updateRedirect emite updateTag('redirects')", async () => {
    mockPrisma.urlRedirect.findFirst
      .mockResolvedValueOnce({ id: "r1", fromPath: "/b8-test/origen", isActive: true }) // existing
      .mockResolvedValue(null); // assertNoRedirectChain
    await updateRedirect({ id: "r1", toPath: "/productos", statusCode: 301 }, ACTOR);
    expect(updateTagSpy).toHaveBeenCalledWith("redirects");
  });

  it("toggleRedirectActive emite updateTag('redirects')", async () => {
    mockPrisma.urlRedirect.findFirst.mockResolvedValue({
      id: "r1",
      fromPath: "/b8-test/toggle",
      isActive: true,
    });
    await toggleRedirectActive("r1", ACTOR);
    expect(updateTagSpy).toHaveBeenCalledWith("redirects");
  });

  it("archiveRedirect emite updateTag('redirects')", async () => {
    await archiveRedirect("r1", ACTOR);
    expect(updateTagSpy).toHaveBeenCalledWith("redirects");
  });

  it("restoreRedirect emite updateTag('redirects')", async () => {
    await restoreRedirect("r1", ACTOR);
    expect(updateTagSpy).toHaveBeenCalledWith("redirects");
  });

  it("createSlugRenameRedirect (rename de catálogo) emite updateTag('redirects')", async () => {
    await createSlugRenameRedirect({
      fromPath: nextPath("-old"),
      toPath: nextPath("-new"),
      actorAdminId: ACTOR,
    });
    expect(updateTagSpy).toHaveBeenCalledWith("redirects");
  });

  it("archiveRedirectOccupyingPath (alta con slug liberado) emite updateTag('redirects')", async () => {
    await archiveRedirectOccupyingPath(nextPath(), ACTOR);
    expect(updateTagSpy).toHaveBeenCalledWith("redirects");
  });

  it("si la validación rechaza ANTES de escribir, NO se invalida", async () => {
    // /carrito es una página estática viva (LIVE_STATIC_PATHS) → rechazo temprano.
    await expect(
      createRedirect({ fromPath: "/carrito", toPath: "/productos", statusCode: 301 }, ACTOR),
    ).rejects.toMatchObject({ field: "fromPath" });
    expect(updateTagSpy).not.toHaveBeenCalled();
  });

  it("si la escritura falla NO se invalida (updateTag solo tras persistir)", async () => {
    mockPrisma.urlRedirect.update.mockRejectedValue(new Error("db down"));
    await expect(archiveRedirect("r1", ACTOR)).rejects.toThrow("db down");
    expect(updateTagSpy).not.toHaveBeenCalled();
  });
});

describe("lookupActiveRedirectCached — caché del proxy (B-8)", () => {
  it("delega en el lookup crudo y devuelve { toPath, statusCode }", async () => {
    mockPrisma.urlRedirect.findFirst.mockResolvedValue({
      toPath: "/productos",
      statusCode: 301,
    });
    const res = await lookupActiveRedirectCached(nextPath());
    expect(res).toEqual({ toPath: "/productos", statusCode: 301 });
    expect(mockPrisma.urlRedirect.findFirst).toHaveBeenCalledWith({
      where: { fromPath: expect.stringContaining("/b8-test/"), isActive: true, deletedAt: null },
      select: { toPath: true, statusCode: true },
    });
  });

  it("sin incrementalCache (invariante E469 de Next 16) degrada al lookup directo", async () => {
    cacheState.mode = "e469";
    mockPrisma.urlRedirect.findFirst.mockResolvedValue(null);
    const res = await lookupActiveRedirectCached(nextPath());
    expect(res).toBeNull();
    expect(mockPrisma.urlRedirect.findFirst).toHaveBeenCalledTimes(1);
  });

  it("un error que NO es E469 se propaga (el proxy decide el fallback)", async () => {
    mockPrisma.urlRedirect.findFirst.mockRejectedValue(new Error("db down"));
    await expect(lookupActiveRedirectCached(nextPath())).rejects.toThrow("db down");
  });
});
