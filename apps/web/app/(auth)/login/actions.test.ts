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
const customerFindFirst = vi.hoisted(() => vi.fn(async () => ({ id: "cust-1" }) as unknown));
const peekCartSession = vi.hoisted(() => vi.fn(async () => null as string | null));
const setCartSessionCookie = vi.hoisted(() => vi.fn(async (_sessionId: string) => {}));
const mergeAnonCartIntoCustomer = vi.hoisted(() => vi.fn(async () => "sess-1"));
const recoverCustomerCartSessionId = vi.hoisted(() =>
  vi.fn(async (_customerId: string) => null as string | null),
);
// Cookie store capturado: el login SELLA la marca de actividad del cliente
// (idle-timeout 30 días, lib/customer-activity.ts) al autenticarse.
const cookieJar = vi.hoisted(() => new Map<string, string>());

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "1.2.3.4" }),
  cookies: async () => ({
    getAll: () => [...cookieJar.entries()].map(([name, value]) => ({ name, value })),
    get: (name: string) => {
      const value = cookieJar.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: (name: string, value: string) => {
      cookieJar.set(name, value);
    },
  }),
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
vi.mock("@/lib/db", () => ({
  prisma: { customer: { upsert: customerUpsert, findFirst: customerFindFirst } },
}));
vi.mock("@/lib/cart-session", () => ({
  peekCartSession,
  setCartSessionCookie,
}));
vi.mock("@/features/cart/service", () => ({
  mergeAnonCartIntoCustomer,
  recoverCustomerCartSessionId,
}));
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
  cookieJar.clear();
  delete process.env.VERCEL_ENV;
  // La marca de actividad va firmada con HMAC (CSRF_SECRET) — fijo para tests.
  vi.stubEnv("CSRF_SECRET", "test-secret-fijo-login");
  rateLimit.mockResolvedValue({ allowed: true, count: 1 });
  peekCartSession.mockResolvedValue(null);
  customerFindFirst.mockResolvedValue({ id: "cust-1" });
  recoverCustomerCartSessionId.mockResolvedValue(null);
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
    // Sin cookie de carrito anon no hay MERGE, pero sí RECOVERY del carrito del
    // customer (2026-10-26): el logout borra la cookie y el re-login debe
    // re-vincular el carrito vivo del cliente en vez de perderlo.
    expect(mergeAnonCartIntoCustomer).not.toHaveBeenCalled();
    expect(recoverCustomerCartSessionId).toHaveBeenCalledWith("cust-1");
  });

  it("sin cookie de carrito y CON carrito vivo del customer → escribe la cookie con su sessionId", async () => {
    okAuth();
    recoverCustomerCartSessionId.mockResolvedValue("sess-customer-vivo");

    await expect(loginAction(null, loginForm())).rejects.toThrow("REDIRECT:/");

    expect(recoverCustomerCartSessionId).toHaveBeenCalledWith("cust-1");
    expect(setCartSessionCookie).toHaveBeenCalledWith("sess-customer-vivo");
    expect(mergeAnonCartIntoCustomer).not.toHaveBeenCalled();
  });

  it("sin cookie de carrito y SIN carrito recuperable → NO escribe cookie de carrito", async () => {
    okAuth();
    recoverCustomerCartSessionId.mockResolvedValue(null);

    await expect(loginAction(null, loginForm())).rejects.toThrow("REDIRECT:/");

    expect(recoverCustomerCartSessionId).toHaveBeenCalledWith("cust-1");
    expect(setCartSessionCookie).not.toHaveBeenCalled();
    expect(mergeAnonCartIntoCustomer).not.toHaveBeenCalled();
  });

  it("con cookie anónima → merge intacto; la cookie solo se reescribe si el sessionId final cambia", async () => {
    okAuth();
    peekCartSession.mockResolvedValue("11111111-2222-4333-8444-555555555555");
    mergeAnonCartIntoCustomer.mockResolvedValue("sess-customer-final");

    await expect(loginAction(null, loginForm())).rejects.toThrow("REDIRECT:/");

    expect(mergeAnonCartIntoCustomer).toHaveBeenCalledWith(
      "11111111-2222-4333-8444-555555555555",
      "cust-1",
    );
    expect(setCartSessionCookie).toHaveBeenCalledWith("sess-customer-final");
    // Con cookie anónima NO corre la rama de recovery.
    expect(recoverCustomerCartSessionId).not.toHaveBeenCalled();

    vi.clearAllMocks();
    okAuth();
    peekCartSession.mockResolvedValue("11111111-2222-4333-8444-555555555555");
    // El merge conserva el sessionId (el anon pasó a ser del customer) → no
    // hace falta reescribir la cookie.
    mergeAnonCartIntoCustomer.mockResolvedValue("11111111-2222-4333-8444-555555555555");

    await expect(loginAction(null, loginForm())).rejects.toThrow("REDIRECT:/");

    expect(mergeAnonCartIntoCustomer).toHaveBeenCalled();
    expect(setCartSessionCookie).not.toHaveBeenCalled();
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
    // El merge/recovery es best-effort por diseño: un carrito roto NUNCA
    // bloquea el login (el error se loguea y el redirect sigue).
    mergeAnonCartIntoCustomer.mockRejectedValue(new Error("db caída"));

    await expect(loginAction(null, loginForm())).rejects.toThrow("REDIRECT:/");
    expect(mergeAnonCartIntoCustomer).toHaveBeenCalled();
  });

  it("SELLA la marca de actividad del cliente (customer_last_activity firmada) al autenticarse", async () => {
    okAuth();
    await expect(loginAction(null, loginForm())).rejects.toThrow("REDIRECT:/");
    const mark = cookieJar.get("customer_last_activity");
    expect(mark).toMatch(/^\d+\.[A-Za-z0-9_-]+$/);
    // La firma verifica con el lector del módulo (round-trip real).
    const { readCustomerActivityMark } = await import("@/lib/customer-activity");
    const ts = readCustomerActivityMark(mark ?? "");
    expect(ts).not.toBeNull();
    expect(Math.abs((ts ?? 0) - Date.now())).toBeLessThan(10_000);
  });

  it("login FALLIDO no sella la marca", async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { code: "invalid_credentials", status: 400, message: "Invalid login credentials" },
    });
    await loginAction(null, loginForm());
    expect(cookieJar.has("customer_last_activity")).toBe(false);
  });
});
