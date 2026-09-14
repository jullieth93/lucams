/*
 * Tests de verifyAdminMfaReauthAction — el reto TOTP del step-up auth de
 * acciones destructivas (F-10, auditoría pre-lanzamiento 2026-09-04).
 *
 * Fija los tres controles del reto (mismo patrón que el recovery code de
 * /admin/login/mfa — ver admin/login/mfa/actions.test.ts):
 *   1. Rate-limit doble bucket (IP + admin, 5/15min en prod) ANTES de verificar.
 *   2. Audit trail mfa.reauth.success / mfa.reauth.failure.
 *   3. challengeAndVerify server-side (refresca el JWT con aal2 fresco).
 *
 * Todo mockeado (sin DB ni Supabase): la acción es pura orquestación.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { rateLimit, getCurrentAdmin, recordAdminAction, listFactors, challengeAndVerify, redirect } =
  vi.hoisted(() => ({
    rateLimit: vi.fn(async (_key: string, _limit?: number, _windowSeconds?: number) => ({
      allowed: true,
      count: 1,
      resetAt: new Date(),
    })),
    getCurrentAdmin: vi.fn(async () => ({
      user: { id: "sb_user_1" },
      admin: { id: "adm_1", email: "lucy@lucamsshop.com" },
    })),
    recordAdminAction: vi.fn(async () => {}),
    listFactors: vi.fn(async () => ({
      data: { all: [{ id: "factor_1", factor_type: "totp", status: "verified" }] },
    })),
    challengeAndVerify: vi.fn(async () => ({ error: null })),
    redirect: vi.fn(),
  }));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-vercel-forwarded-for": "203.0.113.7" }),
}));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentAdmin }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit }));
vi.mock("@/lib/admin-audit", () => ({ recordAdminAction }));
vi.mock("@/lib/admin-rbac-guard", () => ({ requireAdminAction: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { mfa: { listFactors, challengeAndVerify } },
  }),
}));
vi.mock("@/features/admin-mfa/recovery-codes", () => ({
  generateRecoveryCodes: vi.fn(async () => []),
}));

import { verifyAdminMfaReauthAction } from "./actions";

function form(code = "123456"): FormData {
  const fd = new FormData();
  fd.set("code", code);
  return fd;
}

const allowed = { allowed: true, count: 1, resetAt: new Date() };
const blocked = { allowed: false, count: 99, resetAt: new Date() };

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  rateLimit.mockResolvedValue(allowed);
  listFactors.mockResolvedValue({
    data: { all: [{ id: "factor_1", factor_type: "totp", status: "verified" }] },
  });
  challengeAndVerify.mockResolvedValue({ error: null });
});

describe("verifyAdminMfaReauthAction — rate-limit del reto de re-auth", () => {
  it("consulta un bucket por IP y otro por admin (scope admin-mfa-reauth) antes de verificar", async () => {
    await verifyAdminMfaReauthAction(null, form());

    expect(rateLimit).toHaveBeenCalledTimes(2);
    const keys = rateLimit.mock.calls.map((c) => (c as unknown as [string])[0]);
    const ipKeys = keys.filter((k) => k.startsWith("admin-mfa-reauth:ip:"));
    expect(ipKeys).toHaveLength(1);
    expect(ipKeys[0]).toMatch(/^admin-mfa-reauth:ip:[0-9a-f]{16}$/);
    expect(ipKeys[0]).not.toContain("203.0.113.7"); // la IP nunca en claro
    expect(keys).toContain("admin-mfa-reauth:owner:adm_1");
    for (const call of rateLimit.mock.calls) {
      expect((call as unknown as [string, number, number])[2]).toBe(15 * 60);
    }
  });

  it("con el bucket agotado NO intenta verificar el código ni audita éxito", async () => {
    rateLimit.mockImplementation(async (key: string) => (key.includes(":ip:") ? blocked : allowed));

    const res = await verifyAdminMfaReauthAction(null, form());

    expect(challengeAndVerify).not.toHaveBeenCalled();
    expect(res.error).toMatch(/[Dd]emasiados intentos/);
    expect(recordAdminAction).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: "mfa.reauth.success" }),
    );
  });

  it("con el bucket del admin agotado tampoco pasa (botnet rotando IPs)", async () => {
    rateLimit.mockImplementation(async (key: string) =>
      key.includes(":owner:") ? blocked : allowed,
    );

    const res = await verifyAdminMfaReauthAction(null, form());

    expect(challengeAndVerify).not.toHaveBeenCalled();
    expect(res.error).toMatch(/[Dd]emasiados intentos/);
  });

  it("en producción el límite es 5 intentos por ventana", async () => {
    vi.stubEnv("VERCEL_ENV", "production");

    await verifyAdminMfaReauthAction(null, form());

    for (const call of rateLimit.mock.calls) {
      expect((call as unknown as [string, number])[1]).toBe(5);
    }
  });

  it("el campo vacío no gasta cuota (nunca puede acertar un código)", async () => {
    const res = await verifyAdminMfaReauthAction(null, form(""));

    expect(rateLimit).not.toHaveBeenCalled();
    expect(res.error).toMatch(/6 dígitos/);
  });

  it("sin sesión admin no gasta cuota ni verifica nada", async () => {
    getCurrentAdmin.mockResolvedValueOnce(null as never);

    const res = await verifyAdminMfaReauthAction(null, form());

    expect(rateLimit).not.toHaveBeenCalled();
    expect(challengeAndVerify).not.toHaveBeenCalled();
    expect(res.error).toMatch(/sesión expiró/i);
  });
});

describe("verifyAdminMfaReauthAction — verificación y audit trail", () => {
  it("código correcto → challengeAndVerify con el factor verificado + audit mfa.reauth.success", async () => {
    const res = await verifyAdminMfaReauthAction(null, form("654321"));

    expect(challengeAndVerify).toHaveBeenCalledWith({ factorId: "factor_1", code: "654321" });
    expect(res.success).toBe(true);
    expect(recordAdminAction).toHaveBeenCalledWith({
      actorId: "adm_1",
      action: "mfa.reauth.success",
      entityType: "AdminUser",
      entityId: "adm_1",
    });
  });

  it("código incorrecto → error genérico + audit mfa.reauth.failure (sin éxito)", async () => {
    challengeAndVerify.mockResolvedValueOnce({ error: { message: "Invalid TOTP" } } as never);

    const res = await verifyAdminMfaReauthAction(null, form());

    expect(res.success).toBeUndefined();
    expect(res.error).toMatch(/incorrecto o vencido/);
    expect(recordAdminAction).toHaveBeenCalledWith({
      actorId: "adm_1",
      action: "mfa.reauth.failure",
      entityType: "AdminUser",
      entityId: "adm_1",
    });
    expect(recordAdminAction).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: "mfa.reauth.success" }),
    );
  });

  it("un código con formato inválido consume cuota pero no llama a Supabase", async () => {
    const res = await verifyAdminMfaReauthAction(null, form("abc"));

    expect(rateLimit).toHaveBeenCalledTimes(2);
    expect(challengeAndVerify).not.toHaveBeenCalled();
    expect(res.error).toMatch(/6 dígitos numéricos/);
  });

  it("sin factor TOTP verificado → fail closed (el reto no se puede completar)", async () => {
    listFactors.mockResolvedValueOnce({ data: { all: [] } } as never);

    const res = await verifyAdminMfaReauthAction(null, form());

    expect(challengeAndVerify).not.toHaveBeenCalled();
    expect(res.error).toMatch(/no tiene la verificación/);
  });

  it("con dos factores verificados prueba el segundo si el primero falla", async () => {
    listFactors.mockResolvedValueOnce({
      data: {
        all: [
          { id: "factor_viejo", factor_type: "totp", status: "verified" },
          { id: "factor_nuevo", factor_type: "totp", status: "verified" },
        ],
      },
    } as never);
    challengeAndVerify
      .mockResolvedValueOnce({ error: { message: "Invalid TOTP" } } as never)
      .mockResolvedValueOnce({ error: null } as never);

    const res = await verifyAdminMfaReauthAction(null, form());

    expect(challengeAndVerify).toHaveBeenCalledTimes(2);
    expect(challengeAndVerify).toHaveBeenNthCalledWith(2, {
      factorId: "factor_nuevo",
      code: "123456",
    });
    expect(res.success).toBe(true);
  });
});
