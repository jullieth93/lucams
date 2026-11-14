import { beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";

const mocks = vi.hoisted(() => ({
  verifyAdminRouteAccess: vi.fn(),
  recordAdminAction: vi.fn(async () => {}),
  orderFindFirst: vi.fn(),
  getProductionAssetSignedUrls: vi.fn(),
}));

vi.mock("@/lib/admin-rbac-guard", () => ({
  verifyAdminRouteAccess: mocks.verifyAdminRouteAccess,
}));
vi.mock("@/lib/admin-audit", () => ({ recordAdminAction: mocks.recordAdminAction }));
vi.mock("@/lib/db", () => ({ prisma: { order: { findFirst: mocks.orderFindFirst } } }));
vi.mock("@/lib/storage", () => ({
  getProductionAssetSignedUrls: mocks.getProductionAssetSignedUrls,
}));

import { GET } from "./route";

const SIGNED_URL =
  "https://mock.supabase.co/storage/v1/object/sign/production-assets/shipping-labels/ord-1.pdf?token=secret";

function request(suffix = "") {
  return new Request(`http://localhost/admin/pedidos/LCM-2026-0001/guia/etiqueta${suffix}`);
}

describe("GET /admin/pedidos/[number]/guia/etiqueta", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyAdminRouteAccess.mockResolvedValue({
      ok: true,
      session: { admin: { id: "adm_ful", role: "FULFILLMENT" } },
    });
    mocks.orderFindFirst.mockResolvedValue({
      id: "ord_1",
      number: "LCM-2026-0001",
      labelPath: "shipping-labels/ord-1.pdf",
      labelUrl: "https://app.aveonline.co/guias/ord-1.pdf",
    });
    mocks.getProductionAssetSignedUrls.mockImplementation(
      async (paths: string[]) => new Map(paths.map((path) => [path, SIGNED_URL])),
    );
  });

  it("firma solo al abrir la ruta, registra la descarga y redirige con no-store", async () => {
    const req = request();
    const res = await GET(req, { params: Promise.resolve({ number: "LCM-2026-0001" }) });

    expect(mocks.verifyAdminRouteAccess).toHaveBeenCalledWith({
      roles: ADMIN_ROLE_SETS.SHIPPING_GUIDE_PRINT,
      req,
      checkIdle: true,
    });
    expect(mocks.getProductionAssetSignedUrls).toHaveBeenCalledWith(
      ["shipping-labels/ord-1.pdf"],
      900,
    );
    expect(mocks.recordAdminAction).toHaveBeenCalledWith({
      actorId: "adm_ful",
      action: "order.carrier_label_download",
      entityType: "Order",
      entityId: "ord_1",
      metadata: {
        orderNumber: "LCM-2026-0001",
        role: "FULFILLMENT",
        source: "storage",
        archivedLabel: true,
      },
    });
    expect(mocks.getProductionAssetSignedUrls.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.recordAdminAction.mock.invocationCallOrder[0]!,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe(SIGNED_URL);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("canaliza el respaldo externo por la misma auditoría sin firmar storage", async () => {
    const res = await GET(request("?fuente=externa"), {
      params: Promise.resolve({ number: "LCM-2026-0001" }),
    });

    expect(mocks.getProductionAssetSignedUrls).not.toHaveBeenCalled();
    expect(mocks.recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "order.carrier_label_download",
        metadata: expect.objectContaining({ source: "aveonline" }),
      }),
    );
    expect(res.headers.get("Location")).toBe("https://app.aveonline.co/guias/ord-1.pdf");
  });

  it("no redirige a una URL externa no autorizada ni registra una descarga inexistente", async () => {
    mocks.orderFindFirst.mockResolvedValue({
      id: "ord_1",
      number: "LCM-2026-0001",
      labelPath: null,
      labelUrl: "https://evil.example/etiqueta.pdf",
    });

    const res = await GET(request(), { params: Promise.resolve({ number: "LCM-2026-0001" }) });

    expect(res.status).toBe(404);
    expect(mocks.recordAdminAction).not.toHaveBeenCalled();
  });

  it("rechaza el rol sin acceso antes de consultar pedido o firmar", async () => {
    mocks.verifyAdminRouteAccess.mockResolvedValue({
      ok: false,
      status: 403,
      reason: "FORBIDDEN_ROLE",
    });

    const res = await GET(request(), { params: Promise.resolve({ number: "LCM-2026-0001" }) });

    expect(res.status).toBe(403);
    expect(mocks.orderFindFirst).not.toHaveBeenCalled();
    expect(mocks.getProductionAssetSignedUrls).not.toHaveBeenCalled();
    expect(mocks.recordAdminAction).not.toHaveBeenCalled();
  });
});
