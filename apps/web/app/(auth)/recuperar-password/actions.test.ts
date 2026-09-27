/*
 * Unit — recuperarPasswordAction (F-05, remediación R4 2026-09-26).
 *
 * Lo crítico acá es la anti-enumeración: la action SIEMPRE redirige a
 * /restablecer-password?email=... — exista o no la cuenta, falle o no el
 * envío — para no filtrar qué emails tienen cuenta. Fronteras mockeadas:
 * Turnstile (externo) y el client Supabase; el rate limit real se prueba en
 * app/(auth)/auth-actions.integration.test.ts.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const resetPasswordForEmail = vi.hoisted(() => vi.fn());
const verifyTurnstileToken = vi.hoisted(() =>
  vi.fn(async (): Promise<{ success: boolean; reason?: string }> => ({ success: true })),
);
const rateLimit = vi.hoisted(() => vi.fn(async () => ({ allowed: true, count: 1 })));

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
vi.mock("@/lib/turnstile", () => ({ verifyTurnstileToken }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { resetPasswordForEmail } }),
}));

import { hashEmail, hashIp } from "@/lib/rate-limit-keys";
import { recuperarPasswordAction } from "./actions";

function recoverForm(email = "lucia@example.com"): FormData {
  const fd = new FormData();
  fd.set("email", email);
  fd.set("cf-turnstile-response", "tok");
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.VERCEL_ENV;
  rateLimit.mockResolvedValue({ allowed: true, count: 1 });
  verifyTurnstileToken.mockResolvedValue({ success: true });
});

describe("recuperarPasswordAction — validación y anti-bot", () => {
  it("email inválido → fieldErrors; NO llama a Turnstile ni a Supabase", async () => {
    const res = await recuperarPasswordAction(null, recoverForm("malo"));
    expect(res.error).toBe("Email inválido.");
    expect(res.fieldErrors?.email?.length).toBeGreaterThan(0);
    expect(verifyTurnstileToken).not.toHaveBeenCalled();
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("Turnstile falla → mensaje de robot; NO llama a Supabase", async () => {
    verifyTurnstileToken.mockResolvedValue({ success: false, reason: "timeout" });

    const res = await recuperarPasswordAction(null, recoverForm());

    expect(res.error).toMatch(/no eres un robot/i);
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });
});

describe("recuperarPasswordAction — rate limit", () => {
  it("bucket agotado → mensaje de demasiados intentos; NO llama a Supabase", async () => {
    rateLimit.mockResolvedValue({ allowed: false, count: 31 });

    const res = await recuperarPasswordAction(null, recoverForm());

    expect(res.error).toMatch(/demasiados intentos/i);
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("declara buckets dobles (IP + email) con ventana de 1 hora; límite 30 en dev y 10 en prod", async () => {
    resetPasswordForEmail.mockResolvedValue({ error: null });

    await expect(recuperarPasswordAction(null, recoverForm())).rejects.toThrow(/^REDIRECT:/);
    expect(rateLimit).toHaveBeenCalledWith(`reset-password:ip:${hashIp("1.2.3.4")}`, 30, 3600);
    expect(rateLimit).toHaveBeenCalledWith(
      `reset-password:email:${hashEmail("lucia@example.com")}`,
      30,
      3600,
    );

    vi.clearAllMocks();
    rateLimit.mockResolvedValue({ allowed: true, count: 1 });
    resetPasswordForEmail.mockResolvedValue({ error: null });
    process.env.VERCEL_ENV = "production";
    await expect(recuperarPasswordAction(null, recoverForm())).rejects.toThrow(/^REDIRECT:/);
    expect(rateLimit).toHaveBeenCalledWith(`reset-password:ip:${hashIp("1.2.3.4")}`, 10, 3600);
  });
});

describe("recuperarPasswordAction — anti-enumeración", () => {
  it("email existente (envío OK) → redirect a /restablecer-password con el email", async () => {
    resetPasswordForEmail.mockResolvedValue({ error: null });

    await expect(recuperarPasswordAction(null, recoverForm())).rejects.toThrow(
      "REDIRECT:/restablecer-password?email=lucia%40example.com",
    );
  });

  it("email INEXISTENTE (error de Supabase) → EXACTAMENTE el mismo redirect", async () => {
    resetPasswordForEmail.mockResolvedValue({ error: null });
    const existing = await recuperarPasswordAction(null, recoverForm()).catch(
      (e: Error) => e.message,
    );

    resetPasswordForEmail.mockResolvedValue({
      error: { code: "user_not_found", status: 422, message: "User not found" },
    });
    const missing = await recuperarPasswordAction(null, recoverForm("noexiste@example.com")).catch(
      (e: Error) => e.message,
    );

    // Mismo destino (parametrizado por el email tipeado) — nada distingue
    // "existe" de "no existe" en la respuesta al cliente.
    expect(existing).toBe("REDIRECT:/restablecer-password?email=lucia%40example.com");
    expect(missing).toBe("REDIRECT:/restablecer-password?email=noexiste%40example.com");
  });
});
