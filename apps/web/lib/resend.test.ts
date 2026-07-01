/*
 * Test para lib/resend.ts — cliente centralizado de Resend (envío de email)
 * con retry exponencial + circuit breaker, sobre fetch directo a la REST API.
 *
 * FOCO (envío de email transaccional):
 *  - PAYLOAD: el cuerpo POST a https://api.resend.com/emails lleva exactamente
 *    from/to/subject/html/text (+ reply_to/tags solo si se pasan). Headers
 *    Authorization Bearer <key>, Content-Type JSON e Idempotency-Key (opcional).
 *  - HAPPY PATH: HTTP 200 → { sent: true, id } con el id que devuelve Resend.
 *  - ERROR DE API: 4xx (bad request / email inválido) NO se reintenta y propaga
 *    el `message` del body; 5xx / 429 / red SÍ se reintentan (4 intentos) con
 *    backoff exponencial; tras agotar, { sent: false, reason, status }.
 *  - MODO DEV sin RESEND_API_KEY → no-op: { sent: false, reason: "no-api-key",
 *    skipped: true } y NUNCA pega a la red (loguea dev_stub). En PROD sin key
 *    el resultado es el mismo pero loguea un error operacional.
 *  - CIRCUIT BREAKER: tras >50% de fallos en los últimos >=6 envíos se "abre"
 *    y los siguientes devuelven { reason: "circuit-open", skipped: true } sin
 *    tocar la red.
 *
 * Estrategia: FETCH. Mockeamos `fetch` con vi.stubGlobal → 100% determinista y
 * OFFLINE (NUNCA se pega a api.resend.com). El backoff usa setTimeout real
 * (1s/2s/4s) → usamos vi.useFakeTimers + runAllTimersAsync para no esperar 7s.
 *
 * Estado de módulo (IMPORTANTE): el circuit breaker es estado in-memory a nivel
 * de módulo (`breaker.recentResults`). Para que cada test arranque con un
 * breaker LIMPIO importamos `sendEmail` vía `vi.resetModules()` + import()
 * dinámico en un helper `loadFresh()`. Si se importara estático, los fallos de
 * un test contaminarían el breaker del siguiente.
 *
 * Las env vars (RESEND_API_KEY, EMAIL_FROM, NODE_ENV) se controlan con
 * vi.stubEnv porque el módulo las lee EN CADA llamada (no al importar).
 * OJO: en este repo `.env.local` deja RESEND_API_KEY presente y NODE_ENV en
 * "development" durante los tests → cada test FIJA explícitamente lo que
 * necesita; nunca asume el valor heredado.
 *
 * El logger se mockea para silenciar stdout/stderr y afirmar los eventos
 * operacionales. El módulo solo importa server-only + logger → unit test puro
 * (NO DB-coupled). `server-only` lo stubea vitest.config.ts.
 *
 * Comportamiento verificado contra la fuente con probes temporales ANTES de
 * fijar las aserciones (conteos de intento, payload, defaults de `from`).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Logger mockeado: silencia salida y permite afirmar los eventos operacionales
// (email.send.success / .fail / .dev_stub / .no_key_in_prod / .circuit_open_skip).
vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { logger } from "@/lib/logger";
import type { SendEmailInput, SendEmailResult } from "./resend";

const RESEND_URL = "https://api.resend.com/emails";
const DEFAULT_FROM = "Lucams_shop <onboarding@resend.dev>";

type SendEmailFn = (input: SendEmailInput) => Promise<SendEmailResult>;

/**
 * Carga una instancia FRESCA del módulo (breaker in-memory limpio). Cada test
 * que quiera empezar sin estado de circuit breaker debe usar esto en lugar de
 * un import estático.
 */
async function loadFresh(): Promise<SendEmailFn> {
  vi.resetModules();
  const mod = await import("./resend");
  return mod.sendEmail;
}

/** Mock de fetch que devuelve una Response JSON con status dado. */
function mockFetchJson(payload: unknown, status = 200): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async () => new Response(JSON.stringify(payload), { status }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

/** Mock de fetch que lanza (simula caída de red / timeout / AbortError). */
function mockFetchThrows(err: unknown): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async () => {
    throw err;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

/** Input mínimo válido para sendEmail. */
function baseInput(overrides: Partial<SendEmailInput> = {}): SendEmailInput {
  return {
    to: "lucy@example.com",
    subject: "Bienvenida",
    html: "<h1>Hola</h1>",
    text: "Hola",
    ...overrides,
  };
}

/**
 * Ejecuta sendEmail bajo fake timers, drenando los backoffs (setTimeout
 * 1s/2s/4s) para que la promesa resuelva sin esperar tiempo real. Devuelve el
 * resultado. Requiere que el caller haya hecho vi.useFakeTimers().
 */
async function runDrained(send: SendEmailFn, input: SendEmailInput): Promise<SendEmailResult> {
  const p = send(input);
  await vi.runAllTimersAsync();
  return p;
}

/** Configura una key + entorno productivo (camino real de envío). */
function withApiKey(key = "key_test_FIXED"): void {
  vi.stubEnv("RESEND_API_KEY", key);
  vi.stubEnv("NODE_ENV", "production");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  // EMAIL_FROM se hereda de .env.local; lo limpiamos para probar el default del
  // módulo de forma determinista. Tests que lo necesiten lo re-stubean.
  delete process.env.EMAIL_FROM;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// =============================================================================
// Modo DEV / sin API key (no-op, NUNCA toca la red)
// =============================================================================
describe("sendEmail — sin RESEND_API_KEY (no-op)", () => {
  it("DEV sin key → { sent:false, reason:'no-api-key', skipped:true } y NO hace fetch", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("NODE_ENV", "development");
    const fetchFn = vi.fn();
    vi.stubGlobal("fetch", fetchFn);

    const send = await loadFresh();
    const result = await send(baseInput());

    expect(result).toEqual({ sent: false, reason: "no-api-key", skipped: true });
    // Cortocircuita ANTES de la red: en dev sin key nunca se intenta el envío.
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("DEV sin key loguea el stub de desarrollo (info email.send.dev_stub) con to+subject", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubGlobal("fetch", vi.fn());

    const send = await loadFresh();
    await send(baseInput({ to: "dev@x.co", subject: "Asunto dev" }));

    expect(logger.info).toHaveBeenCalledWith({
      event: "email.send.dev_stub",
      to: "dev@x.co",
      subject: "Asunto dev",
    });
    // En dev no es un error: no debe escribir el error de misconfig.
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("DEV sin key con varios destinatarios → el log une los to con coma", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubGlobal("fetch", vi.fn());

    const send = await loadFresh();
    await send(baseInput({ to: ["a@x.co", "b@x.co"], subject: "Multi" }));

    expect(logger.info).toHaveBeenCalledWith({
      event: "email.send.dev_stub",
      to: "a@x.co,b@x.co",
      subject: "Multi",
    });
  });

  it("PROD sin key → MISMO resultado skipped pero loguea ERROR de misconfig (no info)", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("NODE_ENV", "production");
    const fetchFn = vi.fn();
    vi.stubGlobal("fetch", fetchFn);

    const send = await loadFresh();
    const result = await send(baseInput({ to: "prod@x.co", subject: "Crítico" }));

    expect(result).toEqual({ sent: false, reason: "no-api-key", skipped: true });
    expect(fetchFn).not.toHaveBeenCalled();
    // En prod la ausencia de key es un fallo operacional → logger.error.
    expect(logger.error).toHaveBeenCalledWith({
      event: "email.send.no_key_in_prod",
      to: "prod@x.co",
      subject: "Crítico",
    });
    // No debe degradar a dev_stub en producción.
    expect(logger.info).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Happy path: envío exitoso (HTTP 200 → { sent: true, id })
// =============================================================================
describe("sendEmail — envío exitoso", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    withApiKey();
  });

  it("HTTP 200 → { sent:true, id } con el id que devuelve Resend", async () => {
    mockFetchJson({ id: "em_abc123" }, 200);

    const send = await loadFresh();
    const result = await runDrained(send, baseInput());

    expect(result).toEqual({ sent: true, id: "em_abc123" });
  });

  it("POSTea al endpoint oficial de Resend con method POST y AbortSignal de timeout", async () => {
    const fetchFn = mockFetchJson({ id: "em_1" });

    const send = await loadFresh();
    await runDrained(send, baseInput());

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(RESEND_URL);
    expect(init.method).toBe("POST");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("envía headers Authorization Bearer <key> y Content-Type application/json", async () => {
    const fetchFn = mockFetchJson({ id: "em_1" });

    const send = await loadFresh();
    await runDrained(send, baseInput());

    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer key_test_FIXED");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("el body lleva exactamente from/to/subject/html/text (default from cuando EMAIL_FROM unset)", async () => {
    const fetchFn = mockFetchJson({ id: "em_1" });

    const send = await loadFresh();
    await runDrained(
      send,
      baseInput({ to: "a@b.co", subject: "S", html: "<p>H</p>", text: "T" }),
    );

    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      from: DEFAULT_FROM,
      to: "a@b.co",
      subject: "S",
      html: "<p>H</p>",
      text: "T",
    });
    // Sin reply_to/tags cuando no se pasan: el body no debe inventarlos.
    expect(body).not.toHaveProperty("reply_to");
    expect(body).not.toHaveProperty("tags");
  });

  it("respeta EMAIL_FROM como remitente por defecto cuando está configurado", async () => {
    vi.stubEnv("EMAIL_FROM", "Tienda <hola@lucamsshop.co>");
    const fetchFn = mockFetchJson({ id: "em_1" });

    const send = await loadFresh();
    await runDrained(send, baseInput());

    const body = JSON.parse((fetchFn.mock.calls[0][1] as RequestInit).body as string);
    expect(body.from).toBe("Tienda <hola@lucamsshop.co>");
  });

  it("input.from override gana sobre EMAIL_FROM y sobre el default", async () => {
    vi.stubEnv("EMAIL_FROM", "Tienda <hola@lucamsshop.co>");
    const fetchFn = mockFetchJson({ id: "em_1" });

    const send = await loadFresh();
    await runDrained(send, baseInput({ from: "Soporte <soporte@lucamsshop.co>" }));

    const body = JSON.parse((fetchFn.mock.calls[0][1] as RequestInit).body as string);
    expect(body.from).toBe("Soporte <soporte@lucamsshop.co>");
  });

  it("to como array se reenvía tal cual (array) en el body — sin aplanar", async () => {
    const fetchFn = mockFetchJson({ id: "em_1" });

    const send = await loadFresh();
    await runDrained(send, baseInput({ to: ["a@x.co", "b@x.co"] }));

    const body = JSON.parse((fetchFn.mock.calls[0][1] as RequestInit).body as string);
    expect(body.to).toEqual(["a@x.co", "b@x.co"]);
  });

  it("reply_to y tags se incluyen SOLO cuando se pasan (mapeo replyTo → reply_to)", async () => {
    const fetchFn = mockFetchJson({ id: "em_1" });

    const send = await loadFresh();
    await runDrained(
      send,
      baseInput({
        replyTo: "responde@x.co",
        tags: [
          { name: "category", value: "welcome" },
          { name: "lang", value: "es" },
        ],
      }),
    );

    const body = JSON.parse((fetchFn.mock.calls[0][1] as RequestInit).body as string);
    expect(body.reply_to).toBe("responde@x.co");
    expect(body.tags).toEqual([
      { name: "category", value: "welcome" },
      { name: "lang", value: "es" },
    ]);
  });

  it("idempotencyKey viaja como header Idempotency-Key (dedupe en Resend)", async () => {
    const fetchFn = mockFetchJson({ id: "em_1" });

    const send = await loadFresh();
    await runDrained(send, baseInput({ idempotencyKey: "order-42-confirm" }));

    const headers = (fetchFn.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe("order-42-confirm");
  });

  it("sin idempotencyKey NO se agrega el header Idempotency-Key", async () => {
    const fetchFn = mockFetchJson({ id: "em_1" });

    const send = await loadFresh();
    await runDrained(send, baseInput());

    const headers = (fetchFn.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers).not.toHaveProperty("Idempotency-Key");
  });

  it("éxito al primer intento → una sola llamada a fetch (sin reintentos ocultos)", async () => {
    const fetchFn = mockFetchJson({ id: "em_1" });

    const send = await loadFresh();
    await runDrained(send, baseInput());

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("éxito loguea email.send.success con id, attempt:1 y NO escribe warn/error", async () => {
    mockFetchJson({ id: "em_xyz" });

    const send = await loadFresh();
    await runDrained(send, baseInput({ to: "ok@x.co", subject: "OK" }));

    expect(logger.info).toHaveBeenCalledWith({
      event: "email.send.success",
      to: "ok@x.co",
      subject: "OK",
      attempt: 1,
      id: "em_xyz",
    });
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("la API key NUNCA aparece en el resultado devuelto al caller", async () => {
    mockFetchJson({ id: "em_1" });

    const send = await loadFresh();
    const result = await runDrained(send, baseInput());

    expect(JSON.stringify(result)).not.toContain("key_test_FIXED");
  });
});

// =============================================================================
// Error de API 4xx (bad request / email inválido) → SIN reintento
// =============================================================================
describe("sendEmail — error 4xx (no retry)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    withApiKey();
  });

  it("422 (email inválido) → propaga el `message` del body, status 422 y NO reintenta", async () => {
    const fetchFn = mockFetchJson({ message: "Invalid `to` field" }, 422);

    const send = await loadFresh();
    const result = await runDrained(send, baseInput({ to: "no-es-un-email" }));

    expect(result).toEqual({
      sent: false,
      reason: "Invalid `to` field",
      status: 422,
      skipped: false,
    });
    // 4xx es un error del request: reintentar no ayuda → un solo intento.
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("400 con body NO-JSON → reason cae a 'HTTP 400' (fallback) y NO reintenta", async () => {
    const fn = vi.fn(async () => new Response("<<not json>>", { status: 400 }));
    vi.stubGlobal("fetch", fn);

    const send = await loadFresh();
    const result = await runDrained(send, baseInput());

    expect(result).toEqual({
      sent: false,
      reason: "HTTP 400",
      status: 400,
      skipped: false,
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("401 (key inválida/revocada) → un solo intento, reason del body", async () => {
    const fetchFn = mockFetchJson({ message: "API key is invalid" }, 401);

    const send = await loadFresh();
    const result = await runDrained(send, baseInput());

    expect(result).toMatchObject({ sent: false, status: 401, reason: "API key is invalid" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("403 (forbidden) → no reintenta", async () => {
    const fetchFn = mockFetchJson({ message: "Forbidden" }, 403);

    const send = await loadFresh();
    const result = await runDrained(send, baseInput());

    expect(result).toMatchObject({ sent: false, status: 403 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("4xx loguea email.send.fail con reason+status (error operacional)", async () => {
    mockFetchJson({ message: "Invalid `to` field" }, 422);

    const send = await loadFresh();
    await runDrained(send, baseInput({ to: "x@y.co", subject: "Fallido" }));

    expect(logger.error).toHaveBeenCalledWith({
      event: "email.send.fail",
      to: "x@y.co",
      subject: "Fallido",
      reason: "Invalid `to` field",
      status: 422,
    });
  });
});

// =============================================================================
// Errores transient (5xx / 429 / red) → retry exponencial (4 intentos)
// =============================================================================
describe("sendEmail — errores transient (retry)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    withApiKey();
  });

  it("500 persistente → 4 intentos y luego { sent:false, status:500 } con el message del body", async () => {
    const fetchFn = mockFetchJson({ message: "Internal error" }, 500);

    const send = await loadFresh();
    const result = await runDrained(send, baseInput());

    expect(fetchFn).toHaveBeenCalledTimes(4); // 1 inicial + 3 reintentos
    expect(result).toEqual({
      sent: false,
      reason: "Internal error",
      status: 500,
      skipped: false,
    });
  });

  it("429 (rate-limited) se trata como transient → 4 intentos", async () => {
    const fetchFn = mockFetchJson({ message: "Too many requests" }, 429);

    const send = await loadFresh();
    const result = await runDrained(send, baseInput());

    expect(fetchFn).toHaveBeenCalledTimes(4);
    expect(result).toMatchObject({ sent: false, status: 429 });
  });

  it("503 luego 200 → recupera en el 2º intento, { sent:true, id } y attempt:2 en el log", async () => {
    let n = 0;
    const fetchFn = vi.fn(async () => {
      n++;
      return n === 1
        ? new Response(JSON.stringify({}), { status: 503 })
        : new Response(JSON.stringify({ id: "em_retry_ok" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchFn);

    const send = await loadFresh();
    const result = await runDrained(send, baseInput({ to: "r@x.co", subject: "Retry" }));

    expect(result).toEqual({ sent: true, id: "em_retry_ok" });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(logger.info).toHaveBeenCalledWith({
      event: "email.send.success",
      to: "r@x.co",
      subject: "Retry",
      attempt: 2,
      id: "em_retry_ok",
    });
  });

  it("error de red (fetch throws Error) → transient → 4 intentos, reason = mensaje del error", async () => {
    const fetchFn = mockFetchThrows(new Error("ECONNRESET"));

    const send = await loadFresh();
    const result = await runDrained(send, baseInput());

    expect(fetchFn).toHaveBeenCalledTimes(4);
    expect(result).toEqual({ sent: false, reason: "ECONNRESET", skipped: false });
    // Sin status (excepción de red), por eso es transient.
    expect(result).not.toHaveProperty("status");
  });

  it("timeout (AbortError) → transient → 4 intentos, reason con el mensaje del abort", async () => {
    const fetchFn = mockFetchThrows(
      new DOMException("The operation was aborted", "AbortError"),
    );

    const send = await loadFresh();
    const result = await runDrained(send, baseInput());

    expect(fetchFn).toHaveBeenCalledTimes(4);
    expect(result).toMatchObject({ sent: false, reason: "The operation was aborted" });
  });

  it("excepción no-Error (string crudo) → reason 'network' (fallback del catch)", async () => {
    const fetchFn = mockFetchThrows("raw blip");

    const send = await loadFresh();
    const result = await runDrained(send, baseInput());

    expect(fetchFn).toHaveBeenCalledTimes(4);
    expect(result).toEqual({ sent: false, reason: "network", skipped: false });
  });

  it("respeta el backoff exponencial 1s/2s/4s entre reintentos (suma 7s)", async () => {
    // Con un fetch que siempre falla 500, los 3 reintentos esperan 1s, 2s y 4s.
    // Verificamos que la promesa NO resuelve antes de drenar esos timers y que
    // el total de espera es exactamente 7s (no menos, no más).
    mockFetchJson({ message: "boom" }, 500);

    const send = await loadFresh();
    const p = send(baseInput());
    let settled = false;
    void p.then(() => {
      settled = true;
    });

    // Drenamos el primer intento (sin backoff) y avanzamos justo por debajo de 7s.
    await vi.advanceTimersByTimeAsync(6999);
    expect(settled).toBe(false); // aún esperando el último backoff de 4s

    await vi.advanceTimersByTimeAsync(1);
    await p;
    expect(settled).toBe(true);
  });

  it("agotar los reintentos loguea email.send.fail con reason+status finales", async () => {
    mockFetchJson({ message: "Service unavailable" }, 503);

    const send = await loadFresh();
    await runDrained(send, baseInput({ to: "f@x.co", subject: "Down" }));

    expect(logger.error).toHaveBeenCalledWith({
      event: "email.send.fail",
      to: "f@x.co",
      subject: "Down",
      reason: "Service unavailable",
      status: 503,
    });
  });
});

// =============================================================================
// Circuit breaker: se abre tras >50% de fallos y cortocircuita los envíos
// =============================================================================
describe("sendEmail — circuit breaker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    withApiKey();
  });

  it("6 envíos fallidos (500) abren el breaker → el 7º devuelve circuit-open SIN fetch", async () => {
    const fetchFn = mockFetchJson({ message: "down" }, 500);

    const send = await loadFresh();
    // 6 envíos que fallan: cada uno registra UN false en el breaker.
    for (let i = 0; i < 6; i++) {
      await runDrained(send, baseInput());
    }
    expect(fetchFn).toHaveBeenCalled();
    const callsBeforeOpen = fetchFn.mock.calls.length;

    // El 7º debe cortocircuitar: ni un fetch más.
    const result = await runDrained(send, baseInput({ subject: "Tras apertura" }));

    expect(result).toEqual({ sent: false, reason: "circuit-open", skipped: true });
    expect(fetchFn.mock.calls.length).toBe(callsBeforeOpen); // 0 fetch nuevos
  });

  it("breaker abierto loguea email.send.circuit_open_skip con el subject", async () => {
    mockFetchJson({ message: "down" }, 500);

    const send = await loadFresh();
    for (let i = 0; i < 6; i++) await runDrained(send, baseInput());

    vi.clearAllMocks(); // aislar el log del 7º envío
    await runDrained(send, baseInput({ subject: "Skip me" }));

    expect(logger.warn).toHaveBeenCalledWith({
      event: "email.send.circuit_open_skip",
      subject: "Skip me",
    });
  });

  it("abrir el breaker loguea resend.circuit_open con fails/total", async () => {
    mockFetchJson({ message: "down" }, 500);

    const send = await loadFresh();
    for (let i = 0; i < 6; i++) await runDrained(send, baseInput());

    // En el 6º envío, recentResults = [false x6] → fails 6 / total 6 > 0.5 → abre.
    expect(logger.warn).toHaveBeenCalledWith({
      event: "resend.circuit_open",
      fails: 6,
      total: 6,
    });
  });

  it("5 fallos NO abren el breaker (umbral mínimo es 6 resultados) → el 6º intento sí pega a la red", async () => {
    const fetchFn = mockFetchJson({ message: "down" }, 500);

    const send = await loadFresh();
    for (let i = 0; i < 5; i++) await runDrained(send, baseInput());
    const callsAfter5 = fetchFn.mock.calls.length;

    const result = await runDrained(send, baseInput());

    // Con solo 5 resultados el breaker no evalúa; el 6º envío intenta (y reintenta).
    expect(fetchFn.mock.calls.length).toBeGreaterThan(callsAfter5);
    expect(result).not.toMatchObject({ reason: "circuit-open" });
  });

  it("una racha de éxitos NO abre el breaker (>50% deben ser fallos)", async () => {
    const fetchFn = mockFetchJson({ id: "em_ok" }, 200);

    const send = await loadFresh();
    for (let i = 0; i < 8; i++) {
      const r = await runDrained(send, baseInput());
      expect(r).toEqual({ sent: true, id: "em_ok" });
    }
    expect(logger.warn).not.toHaveBeenCalled(); // nunca abrió
    // Sigue enviando normalmente tras 8 éxitos.
    expect(fetchFn).toHaveBeenCalledTimes(8);
  });

  it("el breaker es estado de módulo: una instancia FRESCA (loadFresh) arranca cerrada", async () => {
    // Primera instancia: la abrimos con 6 fallos.
    mockFetchJson({ message: "down" }, 500);
    const send1 = await loadFresh();
    for (let i = 0; i < 6; i++) await runDrained(send1, baseInput());
    const blocked = await runDrained(send1, baseInput());
    expect(blocked).toMatchObject({ reason: "circuit-open" });

    // Segunda instancia fresca: el breaker NO heredó el estado → envía OK.
    const fetchOk = mockFetchJson({ id: "em_fresh" }, 200);
    const send2 = await loadFresh();
    const ok = await runDrained(send2, baseInput());
    expect(ok).toEqual({ sent: true, id: "em_fresh" });
    expect(fetchOk).toHaveBeenCalled();
  });
});

// =============================================================================
// Bordes / invariantes transversales
// =============================================================================
describe("sendEmail — bordes e invariantes", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    withApiKey();
  });

  it("BORDE: EMAIL_FROM='' (cadena vacía) NO cae al default (?? solo cubre null/undefined) → from vacío", async () => {
    // El módulo usa `process.env.EMAIL_FROM ?? <default>`: el nullish coalescing
    // NO trata "" como ausente, así que un EMAIL_FROM vacío produce from:"".
    // Documentado como comportamiento real (potencialmente un bug latente: un
    // remitente vacío sería rechazado por Resend con 4xx). Ver bugsFound.
    vi.stubEnv("EMAIL_FROM", "");
    const fetchFn = mockFetchJson({ id: "em_1" });

    const send = await loadFresh();
    await runDrained(send, baseInput());

    const body = JSON.parse((fetchFn.mock.calls[0][1] as RequestInit).body as string);
    expect(body.from).toBe("");
  });

  it("body que viene 200 pero sin `id` → { sent:true, id: undefined } (confía en el contrato de Resend)", async () => {
    // El módulo castea la respuesta a { id: string } sin validar; un 200 sin id
    // devuelve sent:true con id undefined. Documenta el contrato asumido.
    mockFetchJson({}, 200);

    const send = await loadFresh();
    const result = await runDrained(send, baseInput());

    expect(result).toMatchObject({ sent: true });
    expect((result as { id?: string }).id).toBeUndefined();
  });

  it("contenido HTML/text se reenvía sin sanitizar (responsabilidad del caller)", async () => {
    const fetchFn = mockFetchJson({ id: "em_1" });
    const html = "<h1>Hola <b>Lucy</b></h1><a href='https://x'>link</a>";
    const text = "Hola Lucy — link: https://x";

    const send = await loadFresh();
    await runDrained(send, baseInput({ html, text }));

    const body = JSON.parse((fetchFn.mock.calls[0][1] as RequestInit).body as string);
    expect(body.html).toBe(html);
    expect(body.text).toBe(text);
  });

  it("subject con caracteres especiales (acentos/emoji) se serializa correctamente en el JSON", async () => {
    const fetchFn = mockFetchJson({ id: "em_1" });
    const subject = "¡Tu pedido está en camino! 🦝";

    const send = await loadFresh();
    await runDrained(send, baseInput({ subject }));

    const body = JSON.parse((fetchFn.mock.calls[0][1] as RequestInit).body as string);
    expect(body.subject).toBe(subject);
  });

  it("INVARIANTE: ante 200 nunca reintenta; ante !200 transient siempre 4 intentos; ante 4xx siempre 1", async () => {
    const cases: Array<{ status: number; expectedCalls: number }> = [
      { status: 200, expectedCalls: 1 },
      { status: 400, expectedCalls: 1 },
      { status: 404, expectedCalls: 1 },
      { status: 422, expectedCalls: 1 },
      { status: 429, expectedCalls: 4 },
      { status: 500, expectedCalls: 4 },
      { status: 502, expectedCalls: 4 },
      { status: 503, expectedCalls: 4 },
    ];

    for (const { status, expectedCalls } of cases) {
      const payload = status === 200 ? { id: "em_ok" } : { message: "x" };
      const fetchFn = mockFetchJson(payload, status);
      const send = await loadFresh(); // breaker limpio por caso
      await runDrained(send, baseInput());
      expect(fetchFn, `status ${status}`).toHaveBeenCalledTimes(expectedCalls);
    }
  });

  it("INVARIANTE: ningún modo de fallo de red/HTTP devuelve sent:true", async () => {
    const failures: Array<() => void> = [
      () => mockFetchJson({ message: "x" }, 400),
      () => mockFetchJson({ message: "x" }, 422),
      () => mockFetchJson({ message: "x" }, 500),
      () => mockFetchJson({ message: "x" }, 503),
      () => mockFetchThrows(new Error("down")),
      () => mockFetchThrows("blip"),
    ];

    for (const setup of failures) {
      setup();
      const send = await loadFresh();
      const result = await runDrained(send, baseInput());
      expect(result.sent).toBe(false);
    }
  });
});
