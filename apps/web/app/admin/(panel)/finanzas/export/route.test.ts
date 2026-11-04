import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildAccountingOrdersCsv } from "@/features/finanzas/service";

const { state, verifyAdminRouteAccess, listCollectedOrdersForExport, recordAdminAction } =
  vi.hoisted(() => ({
    state: {
      aal: null as {
        currentLevel: string | null;
        nextLevel: string | null;
        currentAuthenticationMethods: unknown;
      } | null,
    },
    verifyAdminRouteAccess: vi.fn(),
    listCollectedOrdersForExport: vi.fn(),
    recordAdminAction: vi.fn(async () => {}),
  }));

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/admin-rbac-guard", () => ({
  verifyAdminRouteAccess,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: state.aal }) } },
  }),
}));

vi.mock("@/lib/admin-audit", () => ({
  recordAdminAction,
}));

vi.mock("@/features/finanzas/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/finanzas/service")>();
  return {
    ...actual,
    listCollectedOrdersForExport,
  };
});

import { GET } from "./route";

const NOW = new Date("2026-11-04T15:00:00Z");
const NOW_SEC = Math.floor(NOW.getTime() / 1000);

function aal2WithTotp(secondsAgo: number) {
  return {
    currentLevel: "aal2",
    nextLevel: "aal2",
    currentAuthenticationMethods: [
      { method: "password", timestamp: NOW_SEC - 1800 },
      { method: "totp", timestamp: NOW_SEC - secondsAgo },
    ],
  };
}

describe("GET /admin/finanzas/export — RBAC, step-up MFA y sanitización CSV", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.clearAllMocks();
    state.aal = aal2WithTotp(45);
    verifyAdminRouteAccess.mockResolvedValue({
      ok: true,
      session: {
        user: { id: "sb_fin_1" },
        admin: { id: "adm_fin_1", role: "FINANCE_ANALYST" },
      },
    });
    listCollectedOrdersForExport.mockResolvedValue([
      {
        number: "LCM-2026-0101",
        createdAt: new Date("2026-11-04T14:30:00Z"),
        status: "PAID",
        paymentMethod: "WOMPI",
        subtotalCents: 6_500_000,
        discountCents: 500_000,
        loyaltyDiscountCents: 0,
        shippingCents: 1_200_000,
        taxCents: 0,
        totalCents: 7_200_000,
        retractRefundedCents: 1_000_000,
        wompiReference: "LCM-2026-0101",
        wompiTransactionId: "wompi_tx_1",
        codStatus: null,
        codRemittedCents: null,
        billingDocumentType: "CC",
        billingDocumentNumber: "1020304050",
        billingName: "=CMD|' /C calc'!A0",
        dianStatus: "NOT_REQUIRED",
        dianCufe: null,
        email: "cliente@lucamsshop.com",
      },
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rechaza con 403 cuando el rol no posee finance:export_csv (ej. MANAGER)", async () => {
    verifyAdminRouteAccess.mockResolvedValueOnce({
      ok: false,
      status: 403,
      reason: "forbidden_capability",
    });

    const res = await GET(new Request("http://localhost:4000/admin/finanzas/export?periodo=30d"));

    expect(res.status).toBe(403);
    expect(listCollectedOrdersForExport).not.toHaveBeenCalled();
    expect(recordAdminAction).not.toHaveBeenCalled();
  });

  it("exige step-up MFA reciente (≤ 10 min) y devuelve reauthRequired cuando expiró", async () => {
    state.aal = aal2WithTotp(15 * 60);

    const res = await GET(new Request("http://localhost:4000/admin/finanzas/export?periodo=30d"));
    const body = (await res.json()) as { reauthRequired?: boolean; error?: string };

    expect(res.status).toBe(403);
    expect(body.reauthRequired).toBe(true);
    expect(listCollectedOrdersForExport).not.toHaveBeenCalled();
    expect(recordAdminAction).not.toHaveBeenCalled();
  });

  it("autoriza a FINANCE_ANALYST con MFA fresco, neutraliza inyección de fórmulas y audita la descarga", async () => {
    const res = await GET(new Request("http://localhost:4000/admin/finanzas/export?periodo=mes"));
    const rawBytes = new Uint8Array(await res.clone().arrayBuffer());
    const csv = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Content-Disposition")).toContain("finanzas-pedidos-mes-2026-11-04.csv");
    expect(verifyAdminRouteAccess).toHaveBeenCalledWith(
      expect.objectContaining({ capability: "finance:export_csv", checkIdle: true }),
    );
    expect(listCollectedOrdersForExport).toHaveBeenCalledWith("mes");
    expect(recordAdminAction).toHaveBeenCalledWith({
      actorId: "adm_fin_1",
      action: "finance.export_orders_csv",
      entityType: "Order",
      entityId: "mes",
      metadata: { count: 1, periodo: "mes" },
    });

    // BOM UTF-8 en wire bytes (EF BB BF) + montos COP exactos + fórmula neutralizada
    expect(Array.from(rawBytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect(csv.startsWith("numero_pedido,")).toBe(true);
    expect(csv).toContain("LCM-2026-0101");
    expect(csv).toContain(",65000,5000,0,12000,0,72000,10000,62000,");
    expect(csv).toContain("'=CMD|' /C calc'!A0");
    expect(csv).not.toContain(",=CMD|");
  });

  it("buildAccountingOrdersCsv neutraliza =, +, -, @ y escapa comillas dobles RFC 4180", () => {
    const csv = buildAccountingOrdersCsv([
      {
        number: "LCM-2026-0102",
        createdAt: new Date("2026-11-04T12:00:00Z"),
        status: "DELIVERED",
        paymentMethod: "COD",
        subtotalCents: 4_550,
        discountCents: 0,
        loyaltyDiscountCents: 0,
        shippingCents: 0,
        taxCents: 0,
        totalCents: 4_550,
        retractRefundedCents: 0,
        wompiReference: null,
        wompiTransactionId: null,
        codStatus: "REMITTED",
        codRemittedCents: 4_550,
        billingDocumentType: "NIT",
        billingDocumentNumber: "+573001112233",
        billingName: '@Empresa "Demo", SAS',
        dianStatus: "PENDING",
        dianCufe: null,
        email: "-test@lucamsshop.com",
      },
    ]);

    expect(csv).toContain("45.50");
    expect(csv).toContain("'+573001112233");
    expect(csv).toContain('"\'@Empresa ""Demo"", SAS"');
    expect(csv).toContain("'-test@lucamsshop.com");
  });
});
