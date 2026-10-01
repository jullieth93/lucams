/*
 * Unit tests — firma bajo demanda de piezas de producción (T4, ADR-063 T2 revisitado).
 *
 * Regresión: la página de la cola de moderación firmaba en lote TODOS los productionUrls de
 * la grilla (PNGs 2-5 MB × hasta 24 por diseño) en cada render. Ahora la grilla muestra el
 * previewUrl y getDesignProductionSignedUrlsAction firma SOLO las rutas del diseño que Lucy
 * abre en el modal "Ver piezas reales". Estos tests fijan ese contrato:
 *   1. RBAC MANAGER_UP (mismo gate que aprobar/rechazar).
 *   2. Se firman exactamente los paths de ESE designId (ni más ni menos).
 *   3. Paths que Storage no logra firmar se omiten del resultado (no rompen el modal).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockService, mockStorage, guardSpy } = vi.hoisted(() => ({
  mockService: {
    getDesignProductionPaths: vi.fn(),
    approveDesign: vi.fn(),
    rejectDesign: vi.fn(),
  },
  mockStorage: { getProductionAssetSignedUrls: vi.fn() },
  guardSpy: vi.fn(async (_opts: { roles: readonly string[] }) => ({
    user: { id: "user1" },
    admin: { id: "admin1", role: "MANAGER" },
  })),
}));

vi.mock("@/features/moderation/service", () => ({
  getDesignProductionPaths: mockService.getDesignProductionPaths,
  approveDesign: mockService.approveDesign,
  rejectDesign: mockService.rejectDesign,
}));
vi.mock("@/features/moderation/emails", () => ({ sendDesignRejectedEmails: vi.fn() }));
vi.mock("@/lib/storage", () => ({
  getProductionAssetSignedUrls: mockStorage.getProductionAssetSignedUrls,
}));
vi.mock("@/lib/admin-rbac-guard", () => ({ requireAdminAction: guardSpy }));
vi.mock("@/lib/admin-audit", () => ({ recordAdminAction: vi.fn(async () => {}) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { getDesignProductionSignedUrlsAction } from "./actions";

const PATHS = ["design-1/slot-01.png", "design-1/slot-02.png", "design-1/slot-03.png"];

beforeEach(() => {
  vi.clearAllMocks();
  mockService.getDesignProductionPaths.mockResolvedValue(PATHS);
  mockStorage.getProductionAssetSignedUrls.mockImplementation(
    async (paths: string[]) =>
      new Map(
        paths.map((p) => [
          p,
          `https://sb.test/storage/v1/object/sign/production-assets/${p}?token=abc`,
        ]),
      ),
  );
});

describe("getDesignProductionSignedUrlsAction (firma bajo demanda, T4)", () => {
  it("exige rol MANAGER_UP antes de tocar Storage", async () => {
    await getDesignProductionSignedUrlsAction("design-1");
    const roles = guardSpy.mock.calls[0]![0].roles as readonly string[];
    expect(roles).toContain("MANAGER");
    expect(roles).toContain("SUPERADMIN");
    expect(roles).not.toContain("FULFILLMENT");
  });

  it("firma SOLO los paths del designId pedido y devuelve {path, url} por pieza", async () => {
    const pieces = await getDesignProductionSignedUrlsAction("design-1");
    expect(mockService.getDesignProductionPaths).toHaveBeenCalledWith("design-1");
    // La firma se hace con exactamente los paths de ese diseño — no los de la grilla.
    expect(mockStorage.getProductionAssetSignedUrls).toHaveBeenCalledWith(PATHS);
    expect(pieces).toHaveLength(3);
    expect(pieces[0]).toEqual({
      path: PATHS[0],
      url: expect.stringContaining(PATHS[0]!),
    });
  });

  it("omite los paths que Storage no logra firmar (no rompe el modal)", async () => {
    mockStorage.getProductionAssetSignedUrls.mockResolvedValue(
      new Map([[PATHS[1]!, "https://sb.test/signed/slot-02.png"]]),
    );
    const pieces = await getDesignProductionSignedUrlsAction("design-1");
    expect(pieces).toEqual([{ path: PATHS[1], url: "https://sb.test/signed/slot-02.png" }]);
  });

  it("designId vacío o diseño sin piezas → [] sin llamar a Storage", async () => {
    expect(await getDesignProductionSignedUrlsAction("   ")).toEqual([]);
    expect(mockStorage.getProductionAssetSignedUrls).not.toHaveBeenCalled();

    mockService.getDesignProductionPaths.mockResolvedValue([]);
    expect(await getDesignProductionSignedUrlsAction("design-1")).toEqual([]);
  });
});
