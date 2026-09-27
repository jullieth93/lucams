/*
 * Unit — restablecerPasswordAction (F-05, remediación R4 2026-09-26).
 *
 * Cadena verifyOtp(recovery) → updateUser(password) → signOut(global) →
 * redirect /login?reset=ok. Fronteras mockeadas: client Supabase y HIBP
 * (pwned-passwords, API externa). El comportamiento contra GoTrue real
 * (OTP inválido rechazado, flujo OTP válido completo) vive en
 * app/(auth)/auth-actions.integration.test.ts.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyOtp = vi.hoisted(() => vi.fn());
const updateUser = vi.hoisted(() => vi.fn());
const signOut = vi.hoisted(() => vi.fn(async () => ({ error: null })));
const rateLimit = vi.hoisted(() => vi.fn(async () => ({ allowed: true, count: 1 })));
const checkPwnedPassword = vi.hoisted(() => vi.fn(async () => ({ pwned: false, count: 0 })));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "1.2.3.4" }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error("REDIRECT:" + to);
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit }));
vi.mock("@/lib/pwned-passwords", () => ({ checkPwnedPassword }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { verifyOtp, updateUser, signOut } }),
}));

import { hashEmail, hashIp } from "@/lib/rate-limit-keys";
import { restablecerPasswordAction } from "./actions";

function resetForm(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("email", overrides.email ?? "lucia@example.com");
  fd.set("token", overrides.token ?? "123456");
  fd.set("password", overrides.password ?? "Nueva-Clave-987!");
  fd.set("passwordConfirm", overrides.passwordConfirm ?? overrides.password ?? "Nueva-Clave-987!");
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.VERCEL_ENV;
  rateLimit.mockResolvedValue({ allowed: true, count: 1 });
  checkPwnedPassword.mockResolvedValue({ pwned: false, count: 0 });
});

describe("restablecerPasswordAction — validación de input", () => {
  it("token con formato inválido → fieldErrors.token; NO llama a Supabase", async () => {
    const res = await restablecerPasswordAction(null, resetForm({ token: "abc" }));
    expect(res.error).toBe("Datos inválidos.");
    expect(res.fieldErrors?.token?.length).toBeGreaterThan(0);
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("passwords que no coinciden → error en passwordConfirm; NO llama a Supabase", async () => {
    const res = await restablecerPasswordAction(null, resetForm({ passwordConfirm: "otra-clave" }));
    expect(res.error).toBe("Datos inválidos.");
    expect(res.fieldErrors?.passwordConfirm).toContain("Las contraseñas no coinciden.");
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("password corta (<8) → fieldErrors.password; NO llama a Supabase", async () => {
    const res = await restablecerPasswordAction(null, resetForm({ password: "corta1" }));
    expect(res.error).toBe("Datos inválidos.");
    expect(res.fieldErrors?.password?.length).toBeGreaterThan(0);
    expect(verifyOtp).not.toHaveBeenCalled();
  });
});

describe("restablecerPasswordAction — rate limit y pwned", () => {
  it("bucket agotado → mensaje de demasiados intentos; NO verifica OTP", async () => {
    rateLimit.mockResolvedValue({ allowed: false, count: 31 });

    const res = await restablecerPasswordAction(null, resetForm());

    expect(res.error).toMatch(/demasiados intentos/i);
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("declara buckets dobles (IP + email) con ventana de 15 min (verify-recovery)", async () => {
    verifyOtp.mockResolvedValue({ error: { code: "otp_expired" } });

    await restablecerPasswordAction(null, resetForm());

    expect(rateLimit).toHaveBeenCalledWith(`verify-recovery:ip:${hashIp("1.2.3.4")}`, 30, 900);
    expect(rateLimit).toHaveBeenCalledWith(
      `verify-recovery:email:${hashEmail("lucia@example.com")}`,
      30,
      900,
    );
  });

  it("password filtrada en breaches (HIBP) → bloqueada ANTES de verificar el OTP", async () => {
    checkPwnedPassword.mockResolvedValue({ pwned: true, count: 123456 });

    const res = await restablecerPasswordAction(null, resetForm());

    expect(res.error).toBe("Contraseña insegura.");
    expect(res.fieldErrors?.password?.[0]).toMatch(/filtraciones de datos públicas/);
    expect(verifyOtp).not.toHaveBeenCalled();
  });
});

describe("restablecerPasswordAction — cadena verifyOtp → updateUser → signOut", () => {
  it("OTP inválido/expirado → mensaje de código inválido; NO intenta updateUser", async () => {
    verifyOtp.mockResolvedValue({
      error: { code: "otp_expired", status: 403, message: "Token has expired or is invalid" },
    });

    const res = await restablecerPasswordAction(null, resetForm({ token: "000000" }));

    expect(res.error).toMatch(/código no es válido o ya expiró/i);
    expect(verifyOtp).toHaveBeenCalledWith({
      email: "lucia@example.com",
      token: "000000",
      type: "recovery",
    });
    expect(updateUser).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("updateUser falla → error genérico; NO hace signOut", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    updateUser.mockResolvedValue({
      error: { code: "weak_password", status: 422, message: "weak" },
    });

    const res = await restablecerPasswordAction(null, resetForm());

    expect(res.error).toMatch(/no pudimos actualizar tu contraseña/i);
    expect(signOut).not.toHaveBeenCalled();
  });

  it("éxito → signOut GLOBAL (cierra sesiones robadas en otros devices) + redirect /login?reset=ok", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    updateUser.mockResolvedValue({ error: null });

    await expect(restablecerPasswordAction(null, resetForm())).rejects.toThrow(
      "REDIRECT:/login?reset=ok",
    );

    expect(updateUser).toHaveBeenCalledWith({ password: "Nueva-Clave-987!" });
    expect(signOut).toHaveBeenCalledWith({ scope: "global" });
  });
});
