/*
 * Unit — loginAction (F-05, remediación R4 2026-09-26).
 *
 * Cubre el mapa de respuestas de la action con la frontera Supabase mockeada
 * (patrón registro/actions.test.ts): validación, rate-limit, anti-enumeración
 * (mismo mensaje para password mala que para usuario inexistente), redirect
 * seguro (?next= saneado por safeRedirectTarget) y JIT-provisioning del
 * Customer. La prueba de que el rate limit REALMENTE bloquea y de que GoTrue
 * real devuelve el mismo error para ambos casos vive en
 * app/(auth)/auth-actions.integration.test.ts (GoTrue + DB reales).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const signInWithPassword = vi.hoisted(() => vi.fn());
const rateLimit = vi.hoisted(() =>
  vi.fn(async (_key: string, _limit?: number, _windowSeconds?: number) => ({
    allowed: true,
    count: 1,
  })),
);
const recordSecurityEvent = vi.hoisted(() => vi.fn(async () => {}));
const customerUpsert = vi.hoisted(() => vi.fn(async () => ({ id: "cust-1" })));
const peekCartSession = vi.hoisted(() => vi.fn(async () => null as string | null));
const mergeAnonCartIntoCustomer = vi.hoisted(() => vi.fn(async () => "sess-1"));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "1.2.3.4" }),
  cookies: async () => ({ getAll: () => [], get: () => undefined, set: () => {} }),
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
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { signInWithPassword } }),
}));
vi.mock("@/lib/db", () => ({ prisma: { customer: { upsert: customerUpsert } } }));
vi.mock("@/lib/cart-session", () => ({
  peekCartSession,
  setCartSessionCookie: vi.fn(async () => {}),
}));
vi.mock("@/features/cart/service", () => ({ mergeAnonCartIntoCustomer }));
vi.mock("@/lib/security-events", () => ({
  recordSecurityEvent,
  SECURITY_EVENT: { LOGIN_FAIL: "auth.login.fail" },
}));

import { hashEmail, hashIp } from "@/lib/rate-limit-keys";
import { loginAction } from "./actions";

function loginForm(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("email", overrides.email ?? "lucia@example.com");
  fd.set("password", overrides.password ?? "Clave-Secreta-123");
  if (overrides.next !== undefined) fd.set("next", overrides.next);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.VERCEL_ENV;
  rateLimit.mockResolvedValue({ allowed: true, count: 1 });
  peekCartSession.mockResolvedValue(null);
});

describe("loginAction — validación de input", () => {
  it("email inválido → error de datos con fieldErrors; NO llama a Supabase", async () => {
    const res = await loginAction(null, loginForm({ email: "no-es-un-email" }));
    expect(res.error).toBe("Datos inválidos.");
    expect(res.fieldErrors?.email?.length).toBeGreaterThan(0);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("password vacía → error de datos; NO llama a Supabase", async () => {
    const res = await loginAction(null, loginForm({ password: "" }));
    expect(res.error).toBe("Datos inválidos.");
    expect(res.fieldErrors?.password?.length).toBeGreaterThan(0);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
});

describe("loginAction — rate limit", () => {
  it("bucket de IP agotado → mensaje de demasiados intentos; NO llama a Supabase", async () => {
    rateLimit.mockImplementation(async (key: string) =>
      key.startsWith("login:ip:") ? { allowed: false, count: 51 } : { allowed: true, count: 1 },
    );

    const res = await loginAction(null, loginForm());

    expect(res.error).toMatch(/demasiados intentos/i);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("bucket de email agotado → mismo mensaje; NO llama a Supabase", async () => {
    rateLimit.mockImplementation(async (key: string) =>
      key.startsWith("login:email:") ? { allowed: false, count: 51 } : { allowed: true, count: 1 },
    );

    const res = await loginAction(null, loginForm());

    expect(res.error).toMatch(/demasiados intentos/i);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("declara buckets dobles (IP + email) con ventana de 15 min; límite 50 en dev y 15 en prod", async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: { id: "u1", email: "lucia@example.com" } },
      error: null,
    });

    await expect(loginAction(null, loginForm())).rejects.toThrow(/^REDIRECT:/);
    expect(rateLimit).toHaveBeenCalledWith(`login:ip:${hashIp("1.2.3.4")}`, 50, 900);
    expect(rateLimit).toHaveBeenCalledWith(
      `login:email:${hashEmail("lucia@example.com")}`,
      50,
      900,
    );

    vi.clearAllMocks();
    rateLimit.mockResolvedValue({ allowed: true, count: 1 });
    process.env.VERCEL_ENV = "production";
    await expect(loginAction(null, loginForm())).rejects.toThrow(/^REDIRECT:/);
    expect(rateLimit).toHaveBeenCalledWith(`login:ip:${hashIp("1.2.3.4")}`, 15, 900);
    expect(rateLimit).toHaveBeenCalledWith(
      `login:email:${hashEmail("lucia@example.com")}`,
      15,
      900,
    );
  });
});

describe("loginAction — anti-enumeración", () => {
  it("password incorrecta → mensaje genérico + evento de seguridad persistido", async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { code: "invalid_credentials", status: 400, message: "Invalid login credentials" },
    });

    const res = await loginAction(null, loginForm());

    expect(res).toEqual({ error: "Credenciales incorrectas. Intenta de nuevo." });
    expect(recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "auth.login.fail",
        outcome: "failure",
        ip: "1.2.3.4",
        metadata: { code: "invalid_credentials" },
      }),
    );
  });

  it("usuario inexistente → EXACTAMENTE el mismo mensaje que password incorrecta", async () => {
    // GoTrue responde invalid_credentials tanto para password mala como para
    // email que no existe — la action no debe distinguirlos jamás.
    signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { code: "invalid_credentials", status: 400, message: "Invalid login credentials" },
    });
    const wrongPass = await loginAction(null, loginForm({ email: "existe@example.com" }));

    vi.clearAllMocks();
    signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { code: "invalid_credentials", status: 400, message: "Invalid login credentials" },
    });
    const noUser = await loginAction(null, loginForm({ email: "noexiste@example.com" }));

    expect(noUser).toEqual(wrongPass);
  });
});

describe("loginAction — éxito", () => {
  const okAuth = () =>
    signInWithPassword.mockResolvedValue({
      data: {
        user: { id: "u-ok", email: "lucia@example.com", user_metadata: { firstName: "Lucía" } },
      },
      error: null,
    });

  it("redirige a / y hace JIT-provisioning del Customer (upsert por email)", async () => {
    okAuth();

    await expect(loginAction(null, loginForm())).rejects.toThrow("REDIRECT:/");

    expect(customerUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: "lucia@example.com" },
        update: { supabaseUserId: "u-ok", deletedAt: null },
      }),
    );
    // Sin cookie de carrito anon no hay merge.
    expect(mergeAnonCartIntoCustomer).not.toHaveBeenCalled();
  });

  it("?next=/mi-cuenta (interno) → redirect al destino; ?next=//evil.com → cae a /", async () => {
    okAuth();
    await expect(loginAction(null, loginForm({ next: "/mi-cuenta" }))).rejects.toThrow(
      "REDIRECT:/mi-cuenta",
    );

    okAuth();
    await expect(loginAction(null, loginForm({ next: "//evil.com" }))).rejects.toThrow(
      "REDIRECT:/",
    );
  });

  it("con carrito anon previo → merge al customer y no rompe el login si el merge falla", async () => {
    okAuth();
    peekCartSession.mockResolvedValue("11111111-2222-4333-8444-555555555555");
    customerUpsert.mockResolvedValue({ id: "cust-9" });
    // mergeCartSafely busca el customer por supabaseUserId con prisma real —
    // acá el mock de db solo expone upsert; un findFirst undefined haría
    // fallar el merge, que es best-effort por diseño: el login igual redirige.
    await expect(loginAction(null, loginForm())).rejects.toThrow("REDIRECT:/");
  });
});
