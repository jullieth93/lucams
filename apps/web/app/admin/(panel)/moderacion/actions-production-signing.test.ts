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

const {
  mockService,
  mockStorage,
  guardSpy,
  auditSpy,
  revalidateSpy,
  redirectSpy,
  MockModerationGuardError,
} = vi.hoisted(() => {
  class GuardErr extends Error {
    readonly code: "NOT_FOUND" | "ORDER_ALREADY_SHIPPED";
    readonly orderNumber?: string;
    constructor(
      code: "NOT_FOUND" | "ORDER_ALREADY_SHIPPED",
      message: string,
      orderNumber?: string,
    ) {
      super(message);
      this.name = "ModerationGuardError";
      this.code = code;
      this.orderNumber = orderNumber;
    }
  }
  return {
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
    auditSpy: vi.fn(async () => {}),
    revalidateSpy: vi.fn(),
    redirectSpy: vi.fn((url: string) => {
      throw new Error(`REDIRECT:${url}`);
    }),
    MockModerationGuardError: GuardErr,
  };
});

vi.mock("@/features/moderation/service", () => ({
  ModerationGuardError: MockModerationGuardError,
  getDesignProductionPaths: mockService.getDesignProductionPaths,
  approveDesign: mockService.approveDesign,
  rejectDesign: mockService.rejectDesign,
}));
vi.mock("@/features/moderation/emails", () => ({ sendDesignRejectedEmails: vi.fn() }));
vi.mock("@/lib/storage", () => ({
  getProductionAssetSignedUrls: mockStorage.getProductionAssetSignedUrls,
}));
vi.mock("@/lib/admin-rbac-guard", () => ({ requireAdminAction: guardSpy }));
vi.mock("@/lib/admin-audit", () => ({ recordAdminAction: auditSpy }));
vi.mock("next/cache", () => ({ revalidatePath: revalidateSpy }));
vi.mock("next/navigation", () => ({ redirect: redirectSpy }));

import {
  approveDesignAction,
  getDesignProductionSignedUrlsAction,
  rejectDesignAction,
} from "./actions";

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
  it("exige rol PRODUCTION_MODERATE (incluye PRINT_WORKSHOP y excluye soporte/finanzas) antes de tocar Storage", async () => {
    await getDesignProductionSignedUrlsAction("design-1");
    const roles = guardSpy.mock.calls[0]![0].roles as readonly string[];
    expect(roles).toContain("MANAGER");
    expect(roles).toContain("OPERATIONS_MANAGER");
    expect(roles).toContain("PRINT_WORKSHOP");
    expect(roles).toContain("SUPERADMIN");
    expect(roles).not.toContain("FULFILLMENT");
    expect(roles).not.toContain("CUSTOMER_SUPPORT");
    expect(roles).not.toContain("FINANCE_ANALYST");
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

describe("Bloque 5 — approveDesignAction y rejectDesignAction (guardia de pedido enviado y auditoría 360°)", () => {
  it("approveDesignAction registra orderNumber en AdminActionLog, revalida el pedido y conserva filtros activos", async () => {
    mockService.approveDesign.mockResolvedValueOnce({
      productName: "Pack 9 Imanes",
      sources: [{ tipo: "pedido", numero: "LCM-2026-0042", contacto: "c@test.co" }],
      orderNumbers: ["LCM-2026-0042"],
    });

    const fd = new FormData();
    fd.set("designId", "design-42");
    fd.set("q", "LCM-2026");
    fd.set("origen", "pedido");

    await expect(approveDesignAction(fd)).rejects.toThrow(
      "REDIRECT:/admin/moderacion?approved=1&q=LCM-2026&origen=pedido",
    );

    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "design.moderation.approve",
        entityType: "Design",
        entityId: "design-42",
        metadata: expect.objectContaining({
          productName: "Pack 9 Imanes",
          orderNumber: "LCM-2026-0042",
          afectados: ["pedido LCM-2026-0042"],
        }),
      }),
    );
    expect(revalidateSpy).toHaveBeenCalledWith("/admin/pedidos/LCM-2026-0042");
  });

  it("rejectDesignAction redirige con error limpio cuando el pedido asociado ya fue despachado (ORDER_ALREADY_SHIPPED)", async () => {
    mockService.rejectDesign.mockRejectedValueOnce(
      new MockModerationGuardError(
        "ORDER_ALREADY_SHIPPED",
        "No puedes rechazar este diseño porque el pedido LCM-2026-0099 ya fue despachado.",
        "LCM-2026-0099",
      ),
    );

    const fd = new FormData();
    fd.set("designId", "design-99");
    fd.set("reason", "Imagen borrosa");
    fd.set("q", "0099");

    await expect(rejectDesignAction(fd)).rejects.toThrow(
      /REDIRECT:\/admin\/moderacion\?q=0099&error=/,
    );
    expect(auditSpy).not.toHaveBeenCalled();
  });
});
