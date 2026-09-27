/*
 * Integración — auth de cliente contra GoTrue REAL + DB real (F-05,
 * remediación R4 2026-09-26). Complementa los unit tests de las actions
 * (frontera Supabase mockeada) ejerciendo el path completo:
 *
 *   login OK (con JIT-provisioning real del Customer) · login con password
 *   incorrecta · login de usuario inexistente — GoTrue real responde
 *   invalid_credentials en AMBOS casos y la action devuelve el MISMO mensaje
 *   (anti-enumeración verificada contra el proveedor, no contra un mock) ·
 *   rate limit REAL (función SQL rate_limit_check): el 16º intento con el
 *   límite de prod (15/15min) queda bloqueado ANTES de llegar a GoTrue ·
 *   recuperación con email existente e inexistente (mismo redirect) ·
 *   restablecer con OTP inválido (rechazo real de GoTrue) · flujo OTP
 *   completo vía Mailpit: recuperar → código → restablecer → login con la
 *   contraseña NUEVA y rechazo de la vieja.
 *
 * Mocks SOLO de framework (next/headers, next/navigation) y de fronteras
 * externas (Turnstile, HIBP/pwned-passwords). GoTrue, Prisma, rate-limit y
 * SecurityEvent son reales.
 *
 * Requiere DATABASE_URL + llaves Supabase + Mailpit (stack local o nightly
 * localstack). Sin ellas → skipIf. Aislamiento: RUN en emails, IPs de test
 * dedicadas por caso, cleanup SCOPED en afterAll (customers, security events
 * de nuestras IPs, buckets de rate-limit de nuestras llaves, users de auth).
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// IP mutable por caso: los buckets de rate-limit se calculan por IP, así cada
// test usa una dedicada y no contamina al vecino (los límites de prod son 15).
let currentIp = "10.90.1.1";
// Cookie store mínimo para createServerClient (@supabase/ssr): getAll/set.
const cookieJar = new Map<string, string>();

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": currentIp }),
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
vi.mock("@/lib/turnstile", () => ({
  verifyTurnstileToken: async () => ({ success: true }),
}));
vi.mock("@/lib/pwned-passwords", () => ({
  checkPwnedPassword: async () => ({ pwned: false, count: 0 }),
}));

import { prisma } from "@/lib/db";
import { hashEmail, hashIp } from "@/lib/rate-limit-keys";
import { loginAction } from "./login/actions";
import { recuperarPasswordAction } from "./recuperar-password/actions";
import { restablecerPasswordAction } from "./restablecer-password/actions";

const strip = (v: string | undefined) => v?.replace(/^["']|["']$/g, "");
const SUPABASE_URL = strip(process.env.NEXT_PUBLIC_SUPABASE_URL);
const SERVICE_KEY = strip(process.env.SUPABASE_SECRET_KEY);
const MAILPIT_API = "http://localhost:54324/api/v1";
const hasStack = Boolean(process.env.DATABASE_URL && SUPABASE_URL && SERVICE_KEY);

const RUN = `r4auth${Date.now()}${Math.floor(Math.random() * 1e4)}`.toLowerCase();
const EMAIL = `${RUN}@lucams.test`;
const PASSWORD = `R4-Pass-${Date.now().toString(36)}Xk!`;
const NEW_PASSWORD = `${PASSWORD}Nv`;
const GENERIC_ERROR = "Credenciales incorrectas. Intenta de nuevo.";

// IPs dedicadas por caso (los buckets login:<ip> son compartidos por test).
const IP_LOGIN_OK = "10.90.1.1";
const IP_WRONG_PASS = "10.90.1.2";
const IP_NO_USER = "10.90.1.3";
const IP_RATE_LIMIT = "10.90.1.4";
const IP_RECOVER = "10.90.1.5";
const IP_FULL_FLOW = "10.90.1.6";
const TEST_IPS = [IP_LOGIN_OK, IP_WRONG_PASS, IP_NO_USER, IP_RATE_LIMIT, IP_RECOVER, IP_FULL_FLOW];

let service: SupabaseClient;
let userId = "";
const testStart = new Date();

function loginForm(email: string, password: string): FormData {
  const fd = new FormData();
  fd.set("email", email);
  fd.set("password", password);
  return fd;
}

function recoverForm(email: string): FormData {
  const fd = new FormData();
  fd.set("email", email);
  fd.set("cf-turnstile-response", "tok");
  return fd;
}

function resetForm(email: string, token: string, password: string): FormData {
  const fd = new FormData();
  fd.set("email", email);
  fd.set("token", token);
  fd.set("password", password);
  fd.set("passwordConfirm", password);
  return fd;
}

/** OTP (6-10 dígitos, plantilla {{ .Token }}) del Mailpit para un destinatario. */
async function mailpitOtp(toEmail: string): Promise<string> {
  const deadline = Date.now() + 30_000;
  let lastErr: unknown = new Error("sin emails aún");
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${MAILPIT_API}/messages?limit=50`);
      const data = (await res.json()) as {
        messages: Array<{ ID: string; Created: string; To: Array<{ Address: string }> }>;
      };
      const mine = data.messages
        .filter((m) => m.To.some((t) => t.Address === toEmail))
        .sort((a, b) => new Date(b.Created).getTime() - new Date(a.Created).getTime());
      if (mine.length > 0) {
        const full = (await (await fetch(`${MAILPIT_API}/message/${mine[0]!.ID}`)).json()) as {
          Text?: string;
          HTML?: string;
        };
        const m = `${full.Text ?? ""}${full.HTML ?? ""}`.match(/\b(\d{6,10})\b/);
        if (m) return m[1]!;
        lastErr = new Error(`email de ${toEmail} sin código OTP`);
      }
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
  throw lastErr;
}

describe.skipIf(!hasStack)("auth cliente — integración GoTrue/DB real", { timeout: 90_000 }, () => {
  beforeAll(async () => {
    service = createClient(SUPABASE_URL!, SERVICE_KEY!, { auth: { persistSession: false } });
    const { data, error } = await service.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`fixture auth user: ${error?.message}`);
    userId = data.user.id;
  });

  afterAll(async () => {
    // Buckets de nuestras llaves (login/reset/verify de IPs y emails del RUN).
    const keys = [
      ...TEST_IPS.flatMap((ip) => [
        `login:ip:${hashIp(ip)}`,
        `reset-password:ip:${hashIp(ip)}`,
        `verify-recovery:ip:${hashIp(ip)}`,
      ]),
      `login:email:${hashEmail(EMAIL)}`,
      `reset-password:email:${hashEmail(EMAIL)}`,
      `verify-recovery:email:${hashEmail(EMAIL)}`,
      `login:email:${hashEmail(`${RUN}-rl@lucams.test`)}`,
      `login:email:${hashEmail(`${RUN}-fantasma@lucams.test`)}`,
      `reset-password:email:${hashEmail(`${RUN}-fantasma@lucams.test`)}`,
    ];
    await prisma.$executeRaw`DELETE FROM rate_limit_buckets WHERE key = ANY(${keys}::text[])`.catch(
      () => {},
    );
    await prisma.securityEvent
      .deleteMany({
        where: {
          event: "auth.login.fail",
          ipHash: { in: TEST_IPS.map(hashIp) },
          createdAt: { gte: testStart },
        },
      })
      .catch(() => {});
    await prisma.customer.deleteMany({ where: { email: { startsWith: RUN } } }).catch(() => {});
    if (userId) await service.auth.admin.deleteUser(userId).catch(() => {});
  });

  it("login OK real → redirect a / y Customer JIT-provisionado en DB", async () => {
    currentIp = IP_LOGIN_OK;

    await expect(loginAction(null, loginForm(EMAIL, PASSWORD))).rejects.toThrow("REDIRECT:/");

    const customer = await prisma.customer.findFirst({
      where: { email: EMAIL, deletedAt: null },
      select: { supabaseUserId: true },
    });
    expect(customer?.supabaseUserId, "JIT upsert del Customer").toBe(userId);
    // La sesión quedó escrita en las cookies (sb-*-auth-token).
    expect([...cookieJar.keys()].some((k) => k.includes("auth-token"))).toBe(true);
  });

  it("login con password incorrecta → mensaje genérico + SecurityEvent persistido", async () => {
    currentIp = IP_WRONG_PASS;

    const res = await loginAction(null, loginForm(EMAIL, "Clave-Equivocada-999"));

    expect(res).toEqual({ error: GENERIC_ERROR });
    const evt = await prisma.securityEvent.findFirst({
      where: {
        event: "auth.login.fail",
        outcome: "failure",
        ipHash: hashIp(IP_WRONG_PASS),
        createdAt: { gte: testStart },
      },
    });
    expect(evt, "el rechazo queda en el ledger durable (F-07)").not.toBeNull();
  });

  it("login de usuario INEXISTENTE → exactamente el mismo mensaje (GoTrue real)", async () => {
    currentIp = IP_NO_USER;

    const res = await loginAction(null, loginForm(`${RUN}-fantasma@lucams.test`, "Da-Igual-123"));

    expect(res).toEqual({ error: GENERIC_ERROR });
  });

  it("rate limit REAL bloquea: con límite prod (15/15min) el intento 16 no llega a GoTrue", async () => {
    currentIp = IP_RATE_LIMIT;
    const rlEmail = `${RUN}-rl@lucams.test`;
    process.env.VERCEL_ENV = "production";
    try {
      // 15 intentos fallidos pasan por el limiter (y los rechaza GoTrue).
      for (let i = 1; i <= 15; i++) {
        const res = await loginAction(null, loginForm(rlEmail, "Mala-123"));
        expect(res, `intento ${i} debía llegar a GoTrue`).toEqual({ error: GENERIC_ERROR });
      }
      // El 16º queda bloqueado por el limiter — ANTES de Supabase.
      const blocked = await loginAction(null, loginForm(rlEmail, "Mala-123"));
      expect(blocked.error).toMatch(/demasiados intentos/i);

      // El bucket real en DB confirma el conteo (la llamada bloqueada también incrementa).
      const rows = await prisma.$queryRaw<Array<{ count: number }>>`
        SELECT count FROM rate_limit_buckets WHERE key = ${`login:email:${hashEmail(rlEmail)}`}`;
      expect(rows[0]?.count).toBe(16);
    } finally {
      delete process.env.VERCEL_ENV;
    }
  });

  it("recuperar con email existente e inexistente → mismo redirect (anti-enumeración)", async () => {
    currentIp = IP_RECOVER;

    const existing = await recuperarPasswordAction(null, recoverForm(EMAIL)).catch(
      (e: Error) => e.message,
    );
    const missing = await recuperarPasswordAction(
      null,
      recoverForm(`${RUN}-fantasma@lucams.test`),
    ).catch((e: Error) => e.message);

    expect(existing).toBe(`REDIRECT:/restablecer-password?email=${encodeURIComponent(EMAIL)}`);
    expect(missing).toBe(
      `REDIRECT:/restablecer-password?email=${encodeURIComponent(`${RUN}-fantasma@lucams.test`)}`,
    );
  });

  it("restablecer con OTP inválido → rechazo real de GoTrue con mensaje claro", async () => {
    currentIp = IP_RECOVER;

    const res = await restablecerPasswordAction(null, resetForm(EMAIL, "000000", NEW_PASSWORD));

    expect(res.error).toMatch(/código no es válido o ya expiró/i);
  });

  it("flujo OTP completo: recuperar → código Mailpit → restablecer → login con la NUEVA clave (la vieja muere)", async () => {
    currentIp = IP_FULL_FLOW;

    await expect(recuperarPasswordAction(null, recoverForm(EMAIL))).rejects.toThrow(
      /^REDIRECT:\/restablecer-password\?email=/,
    );
    const otp = await mailpitOtp(EMAIL);

    await expect(
      restablecerPasswordAction(null, resetForm(EMAIL, otp, NEW_PASSWORD)),
    ).rejects.toThrow("REDIRECT:/login?reset=ok");

    // La contraseña nueva entra; la vieja queda rechazada (updateUser real).
    await expect(loginAction(null, loginForm(EMAIL, NEW_PASSWORD))).rejects.toThrow("REDIRECT:/");
    const oldLogin = await loginAction(null, loginForm(EMAIL, PASSWORD));
    expect(oldLogin).toEqual({ error: GENERIC_ERROR });
  });
});
