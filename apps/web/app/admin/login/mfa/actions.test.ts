/*
 * Rate-limit del acceso de emergencia con código de respaldo
 * (auditoría 2026-07-21 · B3 · docs/SECURITY.md § Rate limiting).
 *
 * Riesgo cubierto: este es el único camino que APAGA el segundo factor del admin y no tenía freno
 * → con la contraseña en la mano se podían disparar intentos hasta acertar uno de los 10 códigos
 * vivos. Los tests fijan que el freno existe, que corre ANTES de tocar la tabla de códigos, y que
 * hay dos capas (IP e identidad) como en /admin/login.
 *
 * Todo mockeado (sin DB ni Supabase): la acción es pura orquestación.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { rateLimit, consumeRecoveryCode, getCurrentAdmin, redirect, listFactors, deleteFactor } =
  vi.hoisted(() => ({
    rateLimit: vi.fn(async (_key: string, _limit?: number, _windowSeconds?: number) => ({
      allowed: true,
      count: 1,
      resetAt: new Date(),
    })),
    consumeRecoveryCode: vi.fn(async () => true),
    getCurrentAdmin: vi.fn(async () => ({
      user: { id: "sb_user_1" },
      admin: { id: "adm_1", email: "lucy@lucamsshop.com" },
    })),
    redirect: vi.fn(),
    listFactors: vi.fn(async () => ({ data: { factors: [{ id: "f1", factor_type: "totp" }] } })),
    deleteFactor: vi.fn(async () => ({})),
  }));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-vercel-forwarded-for": "203.0.113.7" }),
}));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/auth", () => ({ getCurrentAdmin }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit }));
vi.mock("@/lib/supabase/service", () => ({
  supabaseService: { auth: { admin: { mfa: { listFactors, deleteFactor } } } },
}));
vi.mock("@/features/admin-mfa/recovery-codes", () => ({ consumeRecoveryCode }));

import { useRecoveryCodeAction } from "./actions";

/** FormData del formulario de código de respaldo. */
function form(code = "ABCDE-FGHJK"): FormData {
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
  consumeRecoveryCode.mockResolvedValue(true);
  listFactors.mockResolvedValue({ data: { factors: [{ id: "f1", factor_type: "totp" }] } });
});

describe("useRecoveryCodeAction — rate-limit del acceso de emergencia", () => {
  it("consulta un bucket por IP y otro por admin antes de validar el código", async () => {
    await useRecoveryCodeAction(null, form());

    expect(rateLimit).toHaveBeenCalledTimes(2);
    const keys = rateLimit.mock.calls.map((c) => (c as unknown as [string])[0]);
    // La key de IP ahora va hasheada (hashIp — auditoría experto 2026-07-26: la IP es PII y no
    // debe quedar en claro en la tabla de rate-limit). El rate-limit por IP sigue funcionando
    // porque el hash es determinístico por IP.
    const ipKeys = keys.filter((k) => k.startsWith("admin-recovery-code:ip:"));
    expect(ipKeys).toHaveLength(1);
    expect(ipKeys[0]).toMatch(/^admin-recovery-code:ip:[0-9a-f]{16}$/);
    expect(ipKeys[0]).not.toContain("203.0.113.7"); // la IP nunca en claro
    expect(keys).toContain("admin-recovery-code:owner:adm_1");
    // Ventana de 15 min, igual que /admin/login.
    for (const call of rateLimit.mock.calls) {
      expect((call as unknown as [string, number, number])[2]).toBe(15 * 60);
    }
  });

  it("con el bucket de la IP agotado NO toca la tabla de códigos y avisa que espere", async () => {
    rateLimit.mockImplementation(async (key: string) => (key.includes(":ip:") ? blocked : allowed));

    const res = await useRecoveryCodeAction(null, form());

    expect(consumeRecoveryCode).not.toHaveBeenCalled();
    expect(res?.error).toMatch(/[Dd]emasiados intentos/);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("con el bucket del admin agotado tampoco pasa (botnet rotando IPs)", async () => {
    rateLimit.mockImplementation(async (key: string) =>
      key.includes(":owner:") ? blocked : allowed,
    );

    const res = await useRecoveryCodeAction(null, form());

    expect(consumeRecoveryCode).not.toHaveBeenCalled();
    expect(res?.error).toMatch(/[Dd]emasiados intentos/);
  });

  it("bloqueado NO desactiva el TOTP (el segundo factor sigue en pie)", async () => {
    rateLimit.mockResolvedValue(blocked);

    await useRecoveryCodeAction(null, form());

    expect(listFactors).not.toHaveBeenCalled();
    expect(deleteFactor).not.toHaveBeenCalled();
  });

  it("en producción el límite es 5 intentos por ventana", async () => {
    vi.stubEnv("VERCEL_ENV", "production");

    await useRecoveryCodeAction(null, form());

    for (const call of rateLimit.mock.calls) {
      expect((call as unknown as [string, number])[1]).toBe(5);
    }
  });

  it("el campo vacío no gasta cuota (nunca puede acertar un código)", async () => {
    const res = await useRecoveryCodeAction(null, form(""));

    expect(rateLimit).not.toHaveBeenCalled();
    expect(res?.error).toMatch(/Escribe un código/);
  });

  it("sin sesión admin no gasta cuota ni valida nada", async () => {
    getCurrentAdmin.mockResolvedValueOnce(null as never);

    const res = await useRecoveryCodeAction(null, form());

    expect(rateLimit).not.toHaveBeenCalled();
    expect(consumeRecoveryCode).not.toHaveBeenCalled();
    expect(res?.error).toMatch(/Sesión expirada/);
  });

  it("dentro del límite sigue el camino feliz: consume el código, apaga el TOTP y redirige", async () => {
    await useRecoveryCodeAction(null, form());

    expect(consumeRecoveryCode).toHaveBeenCalledWith("adm_1", "ABCDE-FGHJK");
    expect(deleteFactor).toHaveBeenCalledWith({ id: "f1", userId: "sb_user_1" });
    expect(redirect).toHaveBeenCalledWith("/admin/seguridad?reconfig=1");
  });

  it("un código inválido consume cuota igual (si no, el freno sería inútil)", async () => {
    consumeRecoveryCode.mockResolvedValueOnce(false);

    const res = await useRecoveryCodeAction(null, form());

    expect(rateLimit).toHaveBeenCalledTimes(2);
    expect(res?.error).toMatch(/inválido o ya usado/);
  });
});
