import { beforeEach, describe, expect, it, vi } from "vitest";
import { MfaReauthRequiredError } from "@/lib/admin-reauth";

const {
  verifyAdminRouteAccess,
  requireRecentMfa,
  recordAdminAction,
  listAllNewsletterSubscribers,
} = vi.hoisted(() => ({
  verifyAdminRouteAccess: vi.fn(),
  requireRecentMfa: vi.fn(async () => {}),
  recordAdminAction: vi.fn(async () => {}),
  listAllNewsletterSubscribers: vi.fn(async () => [
    {
      email: "ana@example.com",
      status: "active" as const,
      subscribedAt: new Date("2026-09-01T10:00:00Z"),
      unsubscribedAt: null,
      version: "v1.0",
    },
  ]),
}));

vi.mock("@/lib/admin-rbac-guard", () => ({ verifyAdminRouteAccess }));
vi.mock("@/lib/admin-reauth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin-reauth")>();
  return { ...actual, requireRecentMfa };
});
vi.mock("@/lib/admin-audit", () => ({ recordAdminAction }));
vi.mock("@/features/newsletter/admin-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/newsletter/admin-service")>();
  return { ...actual, listAllNewsletterSubscribers };
});
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { GET } from "./route";

describe("GET /admin/marketing/suscriptores/export (S11 · [SEC-02])", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyAdminRouteAccess.mockResolvedValue({
      ok: true,
      session: { user: { id: "u1" }, admin: { id: "adm_mgr", role: "MANAGER" } },
    });
    requireRecentMfa.mockResolvedValue(undefined);
  });

  it("rechaza con 403/401 JSON sin tocar datos cuando verifyAdminRouteAccess niega", async () => {
    verifyAdminRouteAccess.mockResolvedValueOnce({
      ok: false,
      status: 403,
      reason: "FORBIDDEN_ROLE",
    });

    const res = await GET(new Request("http://localhost/admin/marketing/suscriptores/export"));

    expect(res.status).toBe(403);
    expect(listAllNewsletterSubscribers).not.toHaveBeenCalled();
    expect(recordAdminAction).not.toHaveBeenCalled();
  });

  it("exige step-up MFA reciente (requireRecentMfa) antes de exportar el CSV", async () => {
    requireRecentMfa.mockRejectedValueOnce(new MfaReauthRequiredError());

    const res = await GET(new Request("http://localhost/admin/marketing/suscriptores/export"));
    const body = (await res.json()) as { reauthRequired?: boolean };

    expect(res.status).toBe(403);
    expect(body.reauthRequired).toBe(true);
    expect(listAllNewsletterSubscribers).not.toHaveBeenCalled();
    expect(recordAdminAction).not.toHaveBeenCalled();
  });

  it("exporta CSV comercial Ley 1581 (active_commercial) y registra newsletter.export_csv en AdminActionLog", async () => {
    const res = await GET(new Request("http://localhost/admin/marketing/suscriptores/export"));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(listAllNewsletterSubscribers).toHaveBeenCalledWith({ scope: "active_commercial" });
    expect(recordAdminAction).toHaveBeenCalledWith({
      actorId: "adm_mgr",
      action: "newsletter.export_csv",
      entityType: "Consent",
      entityId: "NEWSLETTER",
      metadata: { count: 1, scope: "active_commercial" },
    });
  });

  it("bloquea con 403 ?scope=audit_ledger para roles distintos de SUPERADMIN y lo habilita para SUPERADMIN", async () => {
    const denied = await GET(
      new Request("http://localhost/admin/marketing/suscriptores/export?scope=audit_ledger"),
    );
    expect(denied.status).toBe(403);
    expect(listAllNewsletterSubscribers).not.toHaveBeenCalled();

    verifyAdminRouteAccess.mockResolvedValueOnce({
      ok: true,
      session: { user: { id: "u_sa" }, admin: { id: "adm_sa", role: "SUPERADMIN" } },
    });

    const allowed = await GET(
      new Request("http://localhost/admin/marketing/suscriptores/export?scope=audit_ledger"),
    );
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("Content-Disposition")).toContain("suscriptores-ledger-sic-");
    expect(listAllNewsletterSubscribers).toHaveBeenCalledWith({ scope: "audit_ledger" });
    expect(recordAdminAction).toHaveBeenCalledWith({
      actorId: "adm_sa",
      action: "newsletter.export_csv",
      entityType: "Consent",
      entityId: "NEWSLETTER",
      metadata: { count: 1, scope: "audit_ledger" },
    });
  });
});
