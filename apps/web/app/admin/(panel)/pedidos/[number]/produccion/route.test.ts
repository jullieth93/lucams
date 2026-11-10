import { beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";

const {
  verifyAdminRouteAccess,
  recordAdminAction,
  getOrderProductionBundle,
  downloadProductionAsset,
  uploadOrderProductionBundle,
  signOrderProductionBundle,
  composeAssemblySheet,
} = vi.hoisted(() => ({
  verifyAdminRouteAccess: vi.fn(),
  recordAdminAction: vi.fn(async () => {}),
  getOrderProductionBundle: vi.fn(),
  downloadProductionAsset: vi.fn(async () => new Uint8Array([137, 80, 78, 71])),
  // Auditoría 2026-11-08 — el ZIP ya no viaja en el response: se publica en
  // production-assets (`_bundles/`) y la ruta redirige a su URL firmada.
  uploadOrderProductionBundle: vi.fn(
    async (opts: { orderId: string; filename: string }) =>
      `_bundles/${opts.orderId}/${opts.filename}`,
  ),
  signOrderProductionBundle: vi.fn(
    async (path: string) =>
      `https://mock.supabase/storage/v1/object/sign/production-assets/${path}?token=abc`,
  ),
  composeAssemblySheet: vi.fn(async () => Buffer.from([137, 80, 78, 71])),
}));

vi.mock("@/lib/admin-rbac-guard", () => ({ verifyAdminRouteAccess }));
vi.mock("@/lib/admin-audit", () => ({ recordAdminAction }));
vi.mock("@/features/orders/service", () => ({ getOrderProductionBundle }));
vi.mock("@/lib/storage", () => ({
  downloadProductionAsset,
  uploadOrderProductionBundle,
  signOrderProductionBundle,
}));
vi.mock("@/features/personalization/assembly-sheet", () => ({ composeAssemblySheet }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { GET } from "./route";

describe("GET /admin/pedidos/[number]/produccion (S11 · [OPS-01] / [SEC-02])", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyAdminRouteAccess.mockResolvedValue({
      ok: true,
      session: { user: { id: "u_ful" }, admin: { id: "adm_ful", role: "FULFILLMENT" } },
    });
    getOrderProductionBundle.mockResolvedValue({
      id: "ord_123",
      number: "LCM-2026-0099",
      createdAt: new Date("2026-10-01T12:00:00Z"),
      items: [
        {
          productName: "Fotoimán Cuadrado",
          sku: "FIM-CUAD",
          qty: 1,
          personalizationKind: "PHOTO_PACK",
          moderationStatus: "APPROVED",
          productionUrls: ["prod/ord_123/pieza-01.png"],
          renderPending: false,
          renderFailed: false,
          renderProgress: null,
          startMonth: 0,
          calendarYear: null,
          productSchema: null,
          variantAttrs: {},
          physicalSpecs: null,
          canvasData: null,
          designMetadata: null,
        },
      ],
    });
  });

  it("permite descarga a roles con production:download_assets (ADMIN_ROLE_SETS.PRODUCTION_DOWNLOAD) y registra order.design_zip_download en AdminActionLog", async () => {
    const req = new Request("http://localhost/admin/pedidos/LCM-2026-0099/produccion");
    const res = await GET(req, { params: Promise.resolve({ number: "LCM-2026-0099" }) });

    expect(ADMIN_ROLE_SETS.PRODUCTION_DOWNLOAD).toContain("PRINT_WORKSHOP");
    expect(ADMIN_ROLE_SETS.PRODUCTION_DOWNLOAD).toContain("FULFILLMENT");
    expect(ADMIN_ROLE_SETS.PRODUCTION_DOWNLOAD).not.toContain("CUSTOMER_SUPPORT");
    expect(ADMIN_ROLE_SETS.PRODUCTION_DOWNLOAD).not.toContain("FINANCE_ANALYST");
    expect(verifyAdminRouteAccess).toHaveBeenCalledWith({
      roles: ADMIN_ROLE_SETS.PRODUCTION_DOWNLOAD,
      req,
      checkIdle: true,
    });
    // El ZIP NO viaja en el response (techo de ~4.5 MB de Vercel): se publica
    // en Storage y la ruta redirige a la URL firmada de TTL corto.
    expect(uploadOrderProductionBundle).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: "ord_123",
        filename: "pedido-lcm-2026-0099-produccion.zip",
      }),
    );
    expect(signOrderProductionBundle).toHaveBeenCalledWith(
      "_bundles/ord_123/pedido-lcm-2026-0099-produccion.zip",
      "pedido-lcm-2026-0099-produccion.zip",
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe(
      "https://mock.supabase/storage/v1/object/sign/production-assets/_bundles/ord_123/pedido-lcm-2026-0099-produccion.zip?token=abc",
    );
    expect(recordAdminAction).toHaveBeenCalledWith({
      actorId: "adm_ful",
      action: "order.design_zip_download",
      entityType: "Order",
      entityId: "ord_123",
      metadata: {
        orderNumber: "LCM-2026-0099",
        totalPieces: 1,
        unapprovedPieces: 0,
        missingPieces: 0,
      },
    });
  });

  it("si el ZIP no se puede publicar en Storage responde 500 claro (sin redirect roto)", async () => {
    uploadOrderProductionBundle.mockRejectedValueOnce(new Error("bucket lleno"));

    const req = new Request("http://localhost/admin/pedidos/LCM-2026-0099/produccion");
    const res = await GET(req, { params: Promise.resolve({ number: "LCM-2026-0099" }) });

    expect(res.status).toBe(500);
    expect(recordAdminAction).not.toHaveBeenCalled();
  });

  it("responde 403 JSON sin consultar el pedido si verifyAdminRouteAccess rechaza (ej. CMS_EDITOR o aal1)", async () => {
    verifyAdminRouteAccess.mockResolvedValueOnce({
      ok: false,
      status: 403,
      reason: "FORBIDDEN_ROLE",
    });

    const req = new Request("http://localhost/admin/pedidos/LCM-2026-0099/produccion");
    const res = await GET(req, { params: Promise.resolve({ number: "LCM-2026-0099" }) });

    expect(res.status).toBe(403);
    expect(getOrderProductionBundle).not.toHaveBeenCalled();
    expect(recordAdminAction).not.toHaveBeenCalled();
  });
});
