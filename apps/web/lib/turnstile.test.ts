/*
 * Test de seguridad para lib/turnstile.ts — verificación server-side del
 * token de Cloudflare Turnstile.
 *
 * FOCO (anti-bot / anti-abuso):
 *  - Token VÁLIDO (siteverify { success: true }) → { success: true }.
 *  - Token RECHAZADO (siteverify { success: false, error-codes }) → bloqueo
 *    con los error-codes propagados y reason "rejected".
 *  - SIN secret en DEV → fail-OPEN ({ success: true }) para no bloquear el
 *    desarrollo local sin keys.
 *  - SIN secret en PROD → fail-CLOSED (bloquea con reason "no-config"). Es la
 *    garantía de que un deploy mal configurado NO desactiva el captcha.
 *  - Error de red / HTTP no-ok / JSON inválido → fail-CLOSED (reason
 *    "network" / "http-error"). El captcha NUNCA se salta ante un fallo.
 *
 * Estrategia: FETCH. Mockeamos `fetch` con vi.stubGlobal → determinista y
 * 100% OFFLINE (NUNCA se pega al endpoint real de Cloudflare). Las env vars
 * (TURNSTILE_SECRET_KEY, NODE_ENV) se controlan con vi.stubEnv porque el
 * módulo las lee en cada llamada (no al importar). El logger se mockea para
 * silenciar ruido y poder afirmar los eventos de seguridad.
 *
 * El módulo NO es DB-coupled (solo importa server-only + logger) → unit test
 * puro. `server-only` lo stubea vitest.config.ts.
 *
 * Comportamiento verificado contra la fuente con probes temporales antes de
 * fijar las aserciones.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Logger mockeado: silencia stdout/stderr y permite afirmar los eventos de
// seguridad (no_secret_in_prod, verify.failed, verify.exception, etc.).
vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { logger } from "@/lib/logger";
import { verifyTurnstileToken } from "./turnstile";

const SECRET = "0x_test_secret_FIXED";
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Construye un mock de fetch que devuelve una Response JSON con status dado. */
function mockFetchJson(payload: unknown, status = 200): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async () => new Response(JSON.stringify(payload), { status }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

/** Mock de fetch que lanza (simula caída de red / timeout). */
function mockFetchThrows(err: unknown): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async () => {
    throw err;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// =============================================================================
// Modo DEV / configuración faltante (rama secret ausente)
// =============================================================================
describe("verifyTurnstileToken — secret ausente (config)", () => {
  it("DEV sin secret → fail-OPEN { success: true } (no bloquea desarrollo)", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    vi.stubEnv("NODE_ENV", "development");
    const fetchFn = vi.fn();
    vi.stubGlobal("fetch", fetchFn);

    const result = await verifyTurnstileToken("cualquier-token");

    expect(result).toEqual({ success: true });
    // No debe haber red: en dev sin secret se cortocircuita antes del fetch.
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("NODE_ENV no-production (test/staging) sin secret → fail-OPEN", async () => {
    // El gate es estrictamente `=== "production"`; cualquier otro valor es dev.
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    vi.stubEnv("NODE_ENV", "test");

    const result = await verifyTurnstileToken("token");

    expect(result).toEqual({ success: true });
  });

  it("DEV sin secret ignora el token incluso si es vacío/null", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    vi.stubEnv("NODE_ENV", "development");

    await expect(verifyTurnstileToken(null)).resolves.toEqual({ success: true });
    await expect(verifyTurnstileToken("")).resolves.toEqual({ success: true });
    await expect(verifyTurnstileToken(undefined)).resolves.toEqual({ success: true });
  });

  it("PROD sin secret → fail-CLOSED con reason 'no-config' (SEGURIDAD)", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    vi.stubEnv("NODE_ENV", "production");
    const fetchFn = vi.fn();
    vi.stubGlobal("fetch", fetchFn);

    const result = await verifyTurnstileToken("token-real");

    expect(result).toEqual({
      success: false,
      errorCodes: ["missing-secret"],
      reason: "no-config",
    });
    // Bloquea ANTES de llamar a Cloudflare (no hay secret que enviar).
    expect(fetchFn).not.toHaveBeenCalled();
    // Debe registrar el evento de error operacional para alertar el misconfig.
    expect(logger.error).toHaveBeenCalledWith({ event: "turnstile.no_secret_in_prod" });
  });
});

// =============================================================================
// Token ausente con secret presente (rama no-token)
// =============================================================================
describe("verifyTurnstileToken — token ausente (con secret)", () => {
  beforeEach(() => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", SECRET);
    vi.stubEnv("NODE_ENV", "production");
  });

  it("token null → reason 'no-token' sin pegar a Cloudflare", async () => {
    const fetchFn = vi.fn();
    vi.stubGlobal("fetch", fetchFn);

    const result = await verifyTurnstileToken(null);

    expect(result).toEqual({
      success: false,
      errorCodes: ["missing-token"],
      reason: "no-token",
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("token undefined → reason 'no-token'", async () => {
    mockFetchJson({ success: true });
    const result = await verifyTurnstileToken(undefined);
    expect(result).toEqual({
      success: false,
      errorCodes: ["missing-token"],
      reason: "no-token",
    });
  });

  it("token string vacío (falsy) → reason 'no-token', NO se llama fetch", async () => {
    const fetchFn = vi.fn();
    vi.stubGlobal("fetch", fetchFn);

    const result = await verifyTurnstileToken("");

    expect(result).toEqual({
      success: false,
      errorCodes: ["missing-token"],
      reason: "no-token",
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Token válido (siteverify success: true)
// =============================================================================
describe("verifyTurnstileToken — token válido", () => {
  beforeEach(() => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", SECRET);
    vi.stubEnv("NODE_ENV", "production");
  });

  it("siteverify { success: true } → { success: true }", async () => {
    mockFetchJson({ success: true });

    const result = await verifyTurnstileToken("token-valido");

    expect(result).toEqual({ success: true });
  });

  it("POSTea al endpoint oficial de Cloudflare con el body url-encoded correcto", async () => {
    const fetchFn = mockFetchJson({ success: true });

    await verifyTurnstileToken("tok_abc", "203.0.113.7");

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(VERIFY_URL);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/x-www-form-urlencoded",
    );

    const body = init.body as URLSearchParams;
    expect(body).toBeInstanceOf(URLSearchParams);
    expect(body.get("secret")).toBe(SECRET);
    expect(body.get("response")).toBe("tok_abc");
    expect(body.get("remoteip")).toBe("203.0.113.7");
  });

  it("incluye un AbortSignal de timeout (defensa contra fetch colgado)", async () => {
    const fetchFn = mockFetchJson({ success: true });

    await verifyTurnstileToken("tok");

    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("sin remoteIp → el body NO incluye la clave remoteip", async () => {
    const fetchFn = mockFetchJson({ success: true });

    await verifyTurnstileToken("tok");

    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    const body = init.body as URLSearchParams;
    expect(body.has("remoteip")).toBe(false);
    expect(body.get("secret")).toBe(SECRET);
    expect(body.get("response")).toBe("tok");
  });

  it("remoteIp null se trata como ausente (no agrega remoteip)", async () => {
    const fetchFn = mockFetchJson({ success: true });

    await verifyTurnstileToken("tok", null);

    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    const body = init.body as URLSearchParams;
    expect(body.has("remoteip")).toBe(false);
  });

  it("éxito no escribe logs de warn/error", async () => {
    mockFetchJson({ success: true });

    await verifyTurnstileToken("tok");

    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Token rechazado (siteverify success: false)
// =============================================================================
describe("verifyTurnstileToken — token rechazado", () => {
  beforeEach(() => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", SECRET);
    vi.stubEnv("NODE_ENV", "production");
  });

  it("propaga los error-codes de Cloudflare con reason 'rejected'", async () => {
    mockFetchJson({ success: false, "error-codes": ["invalid-input-response"] });

    const result = await verifyTurnstileToken("token-falso");

    expect(result).toEqual({
      success: false,
      errorCodes: ["invalid-input-response"],
      reason: "rejected",
    });
  });

  it("token ya consumido (timeout-or-duplicate) → bloqueo con el code exacto", async () => {
    mockFetchJson({ success: false, "error-codes": ["timeout-or-duplicate"] });

    const result = await verifyTurnstileToken("token-reusado");

    expect(result).toEqual({
      success: false,
      errorCodes: ["timeout-or-duplicate"],
      reason: "rejected",
    });
  });

  it("múltiples error-codes se propagan todos en orden", async () => {
    mockFetchJson({
      success: false,
      "error-codes": ["invalid-input-secret", "bad-request"],
    });

    const result = await verifyTurnstileToken("tok");

    expect(result).toMatchObject({
      success: false,
      reason: "rejected",
    });
    expect(result).toHaveProperty("errorCodes", ["invalid-input-secret", "bad-request"]);
  });

  it("rechazo SIN campo error-codes → errorCodes []", async () => {
    // Cloudflare puede devolver success:false sin el array; el código usa `?? []`.
    mockFetchJson({ success: false });

    const result = await verifyTurnstileToken("tok");

    expect(result).toEqual({
      success: false,
      errorCodes: [],
      reason: "rejected",
    });
  });

  it("loguea el evento de seguridad turnstile.verify.failed con los codes", async () => {
    mockFetchJson({ success: false, "error-codes": ["invalid-input-response"] });

    await verifyTurnstileToken("tok");

    expect(logger.warn).toHaveBeenCalledWith({
      event: "turnstile.verify.failed",
      errorCodes: ["invalid-input-response"],
    });
  });
});

// =============================================================================
// Errores de transporte → fail-CLOSED (NUNCA se salta el captcha)
// =============================================================================
describe("verifyTurnstileToken — fallos de transporte (fail-closed)", () => {
  beforeEach(() => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", SECRET);
    vi.stubEnv("NODE_ENV", "production");
  });

  it("HTTP no-ok (500) → reason 'http-error' con code http-<status>", async () => {
    mockFetchJson({}, 500);

    const result = await verifyTurnstileToken("tok");

    expect(result).toEqual({
      success: false,
      errorCodes: ["http-500"],
      reason: "http-error",
    });
    expect(logger.warn).toHaveBeenCalledWith({
      event: "turnstile.verify.http_fail",
      status: 500,
    });
  });

  it("HTTP 429 (rate-limited por Cloudflare) → reason 'http-error'", async () => {
    mockFetchJson({}, 429);

    const result = await verifyTurnstileToken("tok");

    expect(result).toEqual({
      success: false,
      errorCodes: ["http-429"],
      reason: "http-error",
    });
  });

  it("HTTP no-ok NO intenta parsear el JSON del body (corto-circuito)", async () => {
    // r.ok === false debe retornar antes de await r.json().
    const fn = vi.fn(async () => new Response("<<not-json>>", { status: 503 }));
    vi.stubGlobal("fetch", fn);

    const result = await verifyTurnstileToken("tok");

    expect(result).toEqual({
      success: false,
      errorCodes: ["http-503"],
      reason: "http-error",
    });
  });

  it("error de red (fetch throws) → reason 'network' (fail-CLOSED)", async () => {
    mockFetchThrows(new Error("ECONNREFUSED"));

    const result = await verifyTurnstileToken("tok");

    expect(result).toEqual({
      success: false,
      errorCodes: ["exception"],
      reason: "network",
    });
    expect(logger.error).toHaveBeenCalledWith({
      event: "turnstile.verify.exception",
      err: "ECONNREFUSED",
    });
  });

  it("timeout (AbortError) → reason 'network', captcha NO se salta", async () => {
    const abortErr = new DOMException("The operation was aborted", "AbortError");
    mockFetchThrows(abortErr);

    const result = await verifyTurnstileToken("tok");

    expect(result).toEqual({
      success: false,
      errorCodes: ["exception"],
      reason: "network",
    });
  });

  it("JSON inválido en respuesta 200 (parse throws) → cae a reason 'network'", async () => {
    // r.ok === true pero el body no es JSON → await r.json() lanza → catch.
    const fn = vi.fn(async () => new Response("definitely not json", { status: 200 }));
    vi.stubGlobal("fetch", fn);

    const result = await verifyTurnstileToken("tok");

    expect(result).toEqual({
      success: false,
      errorCodes: ["exception"],
      reason: "network",
    });
  });

  it("excepción no-Error (string raw) → se serializa con String() en el log", async () => {
    mockFetchThrows("raw string failure");

    const result = await verifyTurnstileToken("tok");

    expect(result).toEqual({
      success: false,
      errorCodes: ["exception"],
      reason: "network",
    });
    expect(logger.error).toHaveBeenCalledWith({
      event: "turnstile.verify.exception",
      err: "raw string failure",
    });
  });
});

// =============================================================================
// Invariantes de seguridad transversales
// =============================================================================
describe("verifyTurnstileToken — invariantes de seguridad", () => {
  it("con secret presente, NINGÚN fallo de red devuelve success: true (no fail-open en prod)", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", SECRET);
    vi.stubEnv("NODE_ENV", "production");

    const scenarios: Array<() => ReturnType<typeof vi.fn>> = [
      () => mockFetchJson({}, 500),
      () => mockFetchJson({ success: false, "error-codes": ["x"] }),
      () => mockFetchThrows(new Error("net down")),
    ];

    for (const setup of scenarios) {
      setup();
      const result = await verifyTurnstileToken("tok");
      expect(result.success).toBe(false);
    }
  });

  it("el secret real NUNCA se devuelve al caller (solo success/errorCodes/reason)", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", SECRET);
    vi.stubEnv("NODE_ENV", "production");
    mockFetchJson({ success: false, "error-codes": ["invalid-input-secret"] });

    const result = await verifyTurnstileToken("tok");

    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  it("una sola llamada a Cloudflare por verificación (sin reintentos ocultos)", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", SECRET);
    vi.stubEnv("NODE_ENV", "production");
    const fetchFn = mockFetchJson({ success: true });

    await verifyTurnstileToken("tok");

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
