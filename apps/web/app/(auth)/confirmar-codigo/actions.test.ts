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

const {
  rateLimit,
  verifyOtp,
  resend,
  redirect,
  peekCartSession,
  setCartSessionCookie,
  mergeAnonCartIntoCustomer,
  recoverCustomerCartSessionId,
  customerFindFirst,
} = vi.hoisted(() => ({
  rateLimit: vi.fn(async (_key: string, _limit?: number, _windowSeconds?: number) => ({
    allowed: true,
    count: 1,
    resetAt: new Date(),
  })),
  verifyOtp: vi.fn(async () => ({ data: { user: null as { id: string } | null }, error: null })),
  resend: vi.fn(async () => ({ error: null })),
  redirect: vi.fn(),
  peekCartSession: vi.fn(async () => null as string | null),
  setCartSessionCookie: vi.fn(async (_sessionId: string) => {}),
  mergeAnonCartIntoCustomer: vi.fn(async () => "sess-1"),
  recoverCustomerCartSessionId: vi.fn(async (_customerId: string) => null as string | null),
  customerFindFirst: vi.fn(async () => ({ id: "cust-1" }) as unknown),
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-vercel-forwarded-for": "203.0.113.7" }),
  // La verificación OTP exitosa SELLA la marca de actividad del cliente
  // (lib/customer-activity.ts) vía cookies().set — store mínimo.
  cookies: async () => ({ getAll: () => [], get: () => undefined, set: () => {} }),
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
vi.mock("@/lib/db", () => ({ prisma: { customer: { findFirst: customerFindFirst } } }));
vi.mock("@/features/cart/service", () => ({
  mergeAnonCartIntoCustomer,
  recoverCustomerCartSessionId,
}));
vi.mock("@/features/orders/claim-guest-orders", () => ({
  claimGuestOrdersForCustomer: vi.fn(async () => {}),
}));
vi.mock("@/lib/cart-session", () => ({
  peekCartSession,
  setCartSessionCookie,
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
  // La marca de actividad que sella la verificación OTP va firmada (CSRF_SECRET).
  vi.stubEnv("CSRF_SECRET", "test-secret-fijo-confirmar-codigo");
  rateLimit.mockResolvedValue(allowed);
  verifyOtp.mockResolvedValue({ data: { user: null }, error: null });
  peekCartSession.mockResolvedValue(null);
  customerFindFirst.mockResolvedValue({ id: "cust-1" });
  recoverCustomerCartSessionId.mockResolvedValue(null);
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

describe("verifyOtpAction — carrito tras OTP exitoso", () => {
  // OTP verificado = sesión creada. Misma regla que loginAction (2026-10-26):
  // sin cookie de carrito anon se RECUPERA el carrito vivo del customer (el
  // logout borra la cookie); con cookie anon se hace el merge de siempre.
  beforeEach(() => {
    verifyOtp.mockResolvedValue({ data: { user: { id: "u-otp" } }, error: null });
  });

  it("sin cookie anon y CON carrito vivo del customer → escribe la cookie con su sessionId", async () => {
    recoverCustomerCartSessionId.mockResolvedValue("sess-customer-vivo");

    await verifyOtpAction(null, verifyForm());

    expect(recoverCustomerCartSessionId).toHaveBeenCalledWith("cust-1");
    expect(setCartSessionCookie).toHaveBeenCalledWith("sess-customer-vivo");
    expect(mergeAnonCartIntoCustomer).not.toHaveBeenCalled();
  });

  it("sin cookie anon y SIN carrito recuperable → NO escribe cookie de carrito", async () => {
    await verifyOtpAction(null, verifyForm());

    expect(recoverCustomerCartSessionId).toHaveBeenCalledWith("cust-1");
    expect(setCartSessionCookie).not.toHaveBeenCalled();
    expect(mergeAnonCartIntoCustomer).not.toHaveBeenCalled();
  });

  it("con cookie anon → merge intacto y la cookie se reescribe con el sessionId final si cambia", async () => {
    peekCartSession.mockResolvedValue("11111111-2222-4333-8444-555555555555");
    mergeAnonCartIntoCustomer.mockResolvedValue("sess-customer-final");

    await verifyOtpAction(null, verifyForm());

    expect(mergeAnonCartIntoCustomer).toHaveBeenCalledWith(
      "11111111-2222-4333-8444-555555555555",
      "cust-1",
    );
    expect(setCartSessionCookie).toHaveBeenCalledWith("sess-customer-final");
    expect(recoverCustomerCartSessionId).not.toHaveBeenCalled();
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
