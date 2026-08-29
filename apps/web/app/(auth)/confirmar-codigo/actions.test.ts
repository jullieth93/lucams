/*
 * Rate-limit de verificación y reenvío de OTP (auditoría 2026-08-24 · B-4).
 *
 * Antes: un solo bucket por IP con la IP EN CLARO en la key. Un atacante que
 * rota IPs (botnet) multiplicaba los intentos contra el OTP de 6 dígitos de
 * UNA víctima, y la IP quedaba persistida en claro en rate_limit_buckets.
 *
 * Ahora (patrón de login/registro/reset): doble bucket — IP hasheada (C-8,
 * ipKey) + email hasheado (emailKey). Estos tests fijan ambas capas y que
 * ni la IP ni el email quedan en claro en las keys.
 *
 * Todo mockeado (sin DB ni Supabase): la acción es pura orquestación.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { rateLimit, verifyOtp, resend, redirect } = vi.hoisted(() => ({
  rateLimit: vi.fn(async (_key: string, _limit?: number, _windowSeconds?: number) => ({
    allowed: true,
    count: 1,
    resetAt: new Date(),
  })),
  verifyOtp: vi.fn(async () => ({ data: { user: null }, error: null })),
  resend: vi.fn(async () => ({ error: null })),
  redirect: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-vercel-forwarded-for": "203.0.113.7" }),
}));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { verifyOtp, resend } }),
}));
vi.mock("@/lib/origin", () => ({ getRequestOrigin: async () => "https://lucamsshop.com" }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/features/cart/service", () => ({ mergeAnonCartIntoCustomer: vi.fn() }));
vi.mock("@/lib/cart-session", () => ({
  peekCartSession: vi.fn(async () => null),
  setCartSessionCookie: vi.fn(),
}));

import { resendCodeAction, verifyOtpAction } from "./actions";

const EMAIL = "cliente@example.com";

function verifyForm(email = EMAIL, token = "123456"): FormData {
  const fd = new FormData();
  fd.set("email", email);
  fd.set("token", token);
  return fd;
}

function resendForm(email = EMAIL): FormData {
  const fd = new FormData();
  fd.set("email", email);
  return fd;
}

const allowed = { allowed: true, count: 1, resetAt: new Date() };
const blocked = { allowed: false, count: 99, resetAt: new Date() };

function rateLimitKeys(): string[] {
  return rateLimit.mock.calls.map((c) => (c as unknown as [string])[0]);
}

beforeEach(() => {
  vi.clearAllMocks();
  rateLimit.mockResolvedValue(allowed);
});

describe("verifyOtpAction — doble bucket (B-4)", () => {
  it("consulta bucket por IP y por email, ambos hasheados, antes de verificar", async () => {
    await verifyOtpAction(null, verifyForm());

    expect(rateLimit).toHaveBeenCalledTimes(2);
    const keys = rateLimitKeys();
    const ipKeys = keys.filter((k) => k.startsWith("verify-otp:ip:"));
    const emailKeys = keys.filter((k) => k.startsWith("verify-otp:email:"));
    expect(ipKeys).toHaveLength(1);
    expect(emailKeys).toHaveLength(1);
    expect(ipKeys[0]).toMatch(/^verify-otp:ip:[0-9a-f]{16}$/);
    expect(ipKeys[0]).not.toContain("203.0.113.7"); // la IP nunca en claro
    expect(emailKeys[0]).toMatch(/^verify-otp:email:[0-9a-f]{16}$/);
    expect(emailKeys[0]).not.toContain(EMAIL); // el email nunca en claro
    expect(verifyOtp).toHaveBeenCalledTimes(1);
  });

  it("bloquea cuando el bucket por IP está lleno (sin tocar Supabase)", async () => {
    rateLimit.mockImplementation(async (key: string) =>
      key.startsWith("verify-otp:ip:") ? blocked : allowed,
    );
    const res = await verifyOtpAction(null, verifyForm());
    expect(res.error).toMatch(/Demasiados intentos/);
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("bloquea cuando el bucket por EMAIL está lleno aunque la IP tenga cupo (anti botnet)", async () => {
    rateLimit.mockImplementation(async (key: string) =>
      key.startsWith("verify-otp:email:") ? blocked : allowed,
    );
    const res = await verifyOtpAction(null, verifyForm());
    expect(res.error).toMatch(/Demasiados intentos/);
    expect(verifyOtp).not.toHaveBeenCalled();
  });
});

describe("resendCodeAction — doble bucket (B-4)", () => {
  it("consulta bucket por IP y por email, ambos hasheados", async () => {
    await resendCodeAction(null, resendForm());

    expect(rateLimit).toHaveBeenCalledTimes(2);
    const keys = rateLimitKeys();
    expect(keys.filter((k) => k.startsWith("resend-otp:ip:"))).toHaveLength(1);
    expect(keys.filter((k) => k.startsWith("resend-otp:email:"))).toHaveLength(1);
    for (const k of keys) {
      expect(k).not.toContain("203.0.113.7");
      expect(k).not.toContain(EMAIL);
    }
    expect(resend).toHaveBeenCalledTimes(1);
  });

  it("bloquea cuando el bucket por EMAIL está lleno (anti email-bombing)", async () => {
    rateLimit.mockImplementation(async (key: string) =>
      key.startsWith("resend-otp:email:") ? blocked : allowed,
    );
    const res = await resendCodeAction(null, resendForm());
    expect(res.error).toMatch(/Espera unos minutos/);
    expect(resend).not.toHaveBeenCalled();
  });
});
