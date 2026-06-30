/*
 * Test de seguridad para lib/pwned-passwords.ts — verificación de contraseña
 * contra HaveIBeenPwned (Pwned Passwords) usando el modelo k-anonymity.
 *
 * FOCO (anti credential-stuffing, privacy-preserving):
 *  - HASH: la password se hashea con SHA-1, en MAYÚSCULAS. El request lleva
 *    SOLO el prefijo de 5 chars (k-anonymity) — la API nunca ve la password
 *    ni el hash completo. Verificamos la URL exacta y el prefijo enviado.
 *  - MATCH: el sufijo (chars 6..40 del hash) se busca localmente en el cuerpo
 *    "range" que devuelve la API. Sufijo presente → { pwned: true, count }.
 *    Sufijo ausente → { pwned: false }.
 *  - FAIL-OPEN: si HIBP cae (red, timeout, HTTP no-ok) NO se bloquea el
 *    registro — devuelve { pwned: false, failed: true, reason }. Es una
 *    decisión explícita del módulo (ver header: "Si HIBP cae, fail-open").
 *
 * Estrategia: FETCH. Mockeamos `fetch` con vi.stubGlobal → 100% determinista
 * y OFFLINE (NUNCA se pega a api.pwnedpasswords.com). Los hashes esperados se
 * verificaron con probes (node:crypto) ANTES de fijar las aserciones; las
 * respuestas "range" mock usan el sufijo REAL de cada password.
 *
 * El logger se mockea para silenciar ruido y poder afirmar los eventos de
 * auditoría (api_fail / fetch_error). El módulo NO es DB-coupled (solo
 * node:crypto + logger) → unit test puro.
 *
 * NOTA: este test documenta comportamientos REALES verificados, incluyendo
 * dos bordes benignos (ver bloque "bordes de parsing"): filas de padding con
 * count 0 cuentan como pwned, y un count no-numérico produce NaN.
 */

import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { logger } from "@/lib/logger";
import { checkPwnedPassword } from "./pwned-passwords";

const API_URL = "https://api.pwnedpasswords.com/range/";

/** SHA-1 hex MAYÚSCULAS de una password — misma fórmula que el módulo. */
function sha1Upper(password: string): string {
  return createHash("sha1").update(password).digest("hex").toUpperCase();
}

function prefixOf(password: string): string {
  return sha1Upper(password).slice(0, 5);
}

function suffixOf(password: string): string {
  return sha1Upper(password).slice(5);
}

/**
 * Construye un cuerpo "range" estilo HIBP: cada línea es
 * "<SUFIJO_35_CHARS>:<count>" separadas por CRLF (como la API real). Acepta
 * filas extra de relleno para simular que el sufijo buscado convive con ~500
 * vecinos del mismo prefijo.
 */
function rangeBody(rows: Array<[suffix: string, count: number | string]>): string {
  return rows.map(([s, c]) => `${s}:${c}`).join("\r\n");
}

/** Mock de fetch que devuelve un Response de texto con status dado. */
function mockFetchText(body: string, status = 200): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async () => new Response(body, { status }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

/** Mock de fetch que lanza (caída de red / timeout). */
function mockFetchThrows(err: unknown): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async () => {
    throw err;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// =============================================================================
// k-anonymity: hash SHA-1 + prefijo de 5 chars enviado a la API
// =============================================================================
describe("checkPwnedPassword — k-anonymity (hash + prefijo)", () => {
  it("hashea con SHA-1 y pega SOLO al endpoint range con el prefijo de 5 chars", async () => {
    // "password" → 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8, prefijo 5BAA6.
    const fetchFn = mockFetchText(rangeBody([["AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", 1]]));

    await checkPwnedPassword("password");

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_URL}5BAA6`);
    // El prefijo es exactamente 5 chars hex en mayúsculas.
    const sentPrefix = url.slice(API_URL.length);
    expect(sentPrefix).toBe(prefixOf("password"));
    expect(sentPrefix).toHaveLength(5);
    expect(sentPrefix).toMatch(/^[0-9A-F]{5}$/);
  });

  it("la URL NUNCA contiene la password ni el hash completo (privacy k-anonymity)", async () => {
    const fetchFn = mockFetchText(rangeBody([["AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", 1]]));

    const secret = "MyS3cretP@ss";
    await checkPwnedPassword(secret);

    const [url] = fetchFn.mock.calls[0] as [string];
    expect(url).not.toContain(secret);
    // El hash completo (40 chars) jamás viaja; solo los primeros 5.
    expect(url).not.toContain(sha1Upper(secret));
    expect(url).not.toContain(suffixOf(secret));
  });

  it("usa GET con headers User-Agent y Add-Padding (defensa de tamaño de respuesta)", async () => {
    const fetchFn = mockFetchText(rangeBody([["AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", 1]]));

    await checkPwnedPassword("whatever");

    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("GET");
    const headers = init.headers as Record<string, string>;
    expect(headers["User-Agent"]).toBe("lucams-shop");
    // Add-Padding evita inferir el count por el tamaño de la respuesta.
    expect(headers["Add-Padding"]).toBe("true");
  });

  it("incluye un AbortSignal de timeout (no se cuelga si HIBP no responde)", async () => {
    const fetchFn = mockFetchText(rangeBody([["AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", 1]]));

    await checkPwnedPassword("whatever");

    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("una sola llamada por verificación (sin reintentos ocultos)", async () => {
    const fetchFn = mockFetchText(rangeBody([["AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", 1]]));

    await checkPwnedPassword("password");

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("passwords distintas generan prefijos distintos (el prefijo deriva del hash)", async () => {
    const fetchFn = mockFetchText(rangeBody([["AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", 1]]));

    await checkPwnedPassword("password");
    await checkPwnedPassword("hunter2");

    const url1 = (fetchFn.mock.calls[0] as [string])[0];
    const url2 = (fetchFn.mock.calls[1] as [string])[0];
    expect(url1).toBe(`${API_URL}${prefixOf("password")}`); // 5BAA6
    expect(url2).toBe(`${API_URL}${prefixOf("hunter2")}`); // F3BBB
    expect(url1).not.toBe(url2);
  });
});

// =============================================================================
// Password COMPROMETIDA: sufijo presente en la respuesta range → pwned: true
// =============================================================================
describe("checkPwnedPassword — comprometida (sufijo presente)", () => {
  it("sufijo del hash presente en el range → { pwned: true, count } con el count exacto", async () => {
    const suffix = suffixOf("password"); // 1E4C9B93F3F0682250B6CF8331B7EE68FD8
    mockFetchText(
      rangeBody([
        ["0018A45C4D1DEF81644B54AB7F969B88D65", 10], // vecino
        [suffix, 3_730_471], // nuestro sufijo
        ["FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF", 7], // vecino
      ]),
    );

    const result = await checkPwnedPassword("password");

    expect(result).toEqual({ pwned: true, count: 3_730_471 });
  });

  it("el match NO depende de la posición: sufijo en la primera línea funciona", async () => {
    const suffix = suffixOf("hunter2");
    mockFetchText(
      rangeBody([
        [suffix, 17_000],
        ["1111111111111111111111111111111111", 1],
      ]),
    );

    const result = await checkPwnedPassword("hunter2");

    expect(result).toEqual({ pwned: true, count: 17_000 });
  });

  it("sufijo en la última línea (sin CRLF final) también matchea", async () => {
    const suffix = suffixOf("password");
    // Construido a mano para garantizar que NO hay newline al final.
    const body = `2222222222222222222222222222222222:5\r\n${suffix}:99`;
    mockFetchText(body);

    const result = await checkPwnedPassword("password");

    expect(result).toEqual({ pwned: true, count: 99 });
  });

  it("count = 1 (aparición única en breaches) sigue siendo comprometida", async () => {
    const suffix = suffixOf("password");
    mockFetchText(rangeBody([[suffix, 1]]));

    const result = await checkPwnedPassword("password");

    expect(result).toEqual({ pwned: true, count: 1 });
  });

  it("string vacío también se hashea y verifica (DA39A es el SHA-1 de '')", async () => {
    // SHA-1("") = DA39A3EE5E6B4B0D3255BFEF95601890AFD80709 → prefijo DA39A.
    const fetchFn = mockFetchText(rangeBody([[suffixOf(""), 8]]));

    const result = await checkPwnedPassword("");

    const [url] = fetchFn.mock.calls[0] as [string];
    expect(url).toBe(`${API_URL}DA39A`);
    expect(result).toEqual({ pwned: true, count: 8 });
  });

  it("una password comprometida NO escribe logs de warn/error (camino feliz)", async () => {
    mockFetchText(rangeBody([[suffixOf("password"), 100]]));

    await checkPwnedPassword("password");

    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Password NO comprometida: sufijo ausente del range → pwned: false
// =============================================================================
describe("checkPwnedPassword — no comprometida (sufijo ausente)", () => {
  it("sufijo del hash ausente del range (solo vecinos) → { pwned: false }", async () => {
    // Vecinos del mismo prefijo pero NINGUNO es el sufijo de "password".
    mockFetchText(
      rangeBody([
        ["0018A45C4D1DEF81644B54AB7F969B88D65", 10],
        ["00D4F6E8FA6EECAD2A3AA415EEC418D38EC", 2],
        ["FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF", 7],
      ]),
    );

    const result = await checkPwnedPassword("password");

    expect(result).toEqual({ pwned: false });
    // pwned:false "limpio" NO lleva failed (se distingue del fail-open).
    expect(result).not.toHaveProperty("failed");
  });

  it("range vacío (cuerpo en blanco) → no hay match → { pwned: false }", async () => {
    mockFetchText("");

    const result = await checkPwnedPassword("password");

    expect(result).toEqual({ pwned: false });
  });

  it("match es case-SENSITIVE: un sufijo en minúscula NO matchea (HIBP devuelve mayúsculas)", async () => {
    // El sufijo del módulo es uppercase; una línea lowercase no debe matchear.
    // Documenta la dependencia de que la API responde en mayúsculas.
    const suffixLower = suffixOf("password").toLowerCase();
    mockFetchText(rangeBody([[suffixLower, 999]]));

    const result = await checkPwnedPassword("password");

    expect(result).toEqual({ pwned: false });
  });

  it("un sufijo que es PREFIJO del nuestro no se confunde (no hay match parcial inverso)", async () => {
    // startsWith(suffix) requiere que la LÍNEA empiece con el sufijo COMPLETO.
    // Una línea cuyo sufijo es solo un prefijo del nuestro NO debe matchear.
    const fullSuffix = suffixOf("password"); // 35 chars
    const shorterNeighbor = fullSuffix.slice(0, 20); // prefijo de 20 chars
    mockFetchText(rangeBody([[shorterNeighbor, 50]]));

    const result = await checkPwnedPassword("password");

    expect(result).toEqual({ pwned: false });
  });
});

// =============================================================================
// FAIL-OPEN: caída de HIBP NO bloquea el registro
// =============================================================================
describe("checkPwnedPassword — fail-open ante fallos de HIBP", () => {
  it("error de red (fetch throws Error) → { pwned: false, failed: true, reason } y NO bloquea", async () => {
    mockFetchThrows(new Error("ECONNREFUSED"));

    const result = await checkPwnedPassword("password");

    expect(result).toEqual({
      pwned: false,
      failed: true,
      reason: "ECONNREFUSED",
    });
    // Invariante de fail-open: jamás reporta pwned:true ante un fallo.
    expect(result.pwned).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith({
      event: "security.pwned.fetch_error",
      err: "ECONNREFUSED",
    });
  });

  it("timeout (AbortError) → fail-open con la razón del abort", async () => {
    const abortErr = new DOMException("The operation was aborted", "AbortError");
    mockFetchThrows(abortErr);

    const result = await checkPwnedPassword("password");

    expect(result).toMatchObject({ pwned: false, failed: true });
    expect((result as { reason: string }).reason).toBe("The operation was aborted");
  });

  it("excepción no-Error (string crudo) → reason 'unknown' pero el LOG sí usa String(err)", async () => {
    // ASIMETRÍA REAL: el `reason` devuelto al caller es la literal "unknown"
    // para cualquier throw que no sea instanceof Error; en cambio el campo
    // `err` del log se serializa con String(err). Documentado como benigno
    // (el caller solo necesita saber que falló; el detalle queda en el log).
    mockFetchThrows("raw network blip");

    const result = await checkPwnedPassword("password");

    expect(result).toEqual({
      pwned: false,
      failed: true,
      reason: "unknown",
    });
    expect(logger.warn).toHaveBeenCalledWith({
      event: "security.pwned.fetch_error",
      err: "raw network blip",
    });
  });

  it("excepción no-Error (objeto plano) → reason 'unknown'; log con String() = '[object Object]'", async () => {
    mockFetchThrows({ weird: true });

    const result = await checkPwnedPassword("password");

    expect(result).toEqual({ pwned: false, failed: true, reason: "unknown" });
    expect(logger.warn).toHaveBeenCalledWith({
      event: "security.pwned.fetch_error",
      err: "[object Object]",
    });
  });

  it("HTTP no-ok (500) → fail-open con reason 'HTTP 500' y log de api_fail", async () => {
    mockFetchText("server error", 500);

    const result = await checkPwnedPassword("password");

    expect(result).toEqual({
      pwned: false,
      failed: true,
      reason: "HTTP 500",
    });
    expect(logger.warn).toHaveBeenCalledWith({
      event: "security.pwned.api_fail",
      status: 500,
    });
  });

  it("HTTP 429 (rate-limited por HIBP) → fail-open, no se parsea el body", async () => {
    // Con !res.ok el módulo retorna antes de res.text(): un body que parecería
    // un match NO debe interpretarse como pwned.
    const suffix = suffixOf("password");
    mockFetchText(rangeBody([[suffix, 12345]]), 429);

    const result = await checkPwnedPassword("password");

    expect(result).toEqual({
      pwned: false,
      failed: true,
      reason: "HTTP 429",
    });
    expect(logger.warn).toHaveBeenCalledWith({
      event: "security.pwned.api_fail",
      status: 429,
    });
  });

  it("HTTP 404 → fail-open con reason 'HTTP 404'", async () => {
    mockFetchText("not found", 404);

    const result = await checkPwnedPassword("password");

    expect(result).toEqual({
      pwned: false,
      failed: true,
      reason: "HTTP 404",
    });
  });

  it("INVARIANTE fail-open: ningún modo de fallo devuelve pwned:true", async () => {
    const failures: Array<() => void> = [
      () => mockFetchThrows(new Error("net down")),
      () => mockFetchThrows("string err"),
      () => mockFetchText("x", 500),
      () => mockFetchText("x", 503),
      () => mockFetchText("x", 429),
    ];

    for (const setup of failures) {
      vi.clearAllMocks();
      vi.unstubAllGlobals();
      setup();
      const result = await checkPwnedPassword("password");
      expect(result.pwned).toBe(false);
      expect(result).toHaveProperty("failed", true);
    }
  });
});

// =============================================================================
// Bordes de parsing del cuerpo range (comportamientos REALES verificados)
// =============================================================================
describe("checkPwnedPassword — bordes de parsing", () => {
  it("líneas con espacios alrededor se trimean antes del match/parse", async () => {
    const suffix = suffixOf("password");
    // Espacios al inicio/fin de la línea: el módulo hace .trim() por línea.
    const body = `  ${suffix}:42  \r\n3333333333333333333333333333333333:1`;
    mockFetchText(body);

    const result = await checkPwnedPassword("password");

    expect(result).toEqual({ pwned: true, count: 42 });
  });

  it("BORDE: fila de padding con count 0 igual cuenta como comprometida (no se filtra :0)", async () => {
    // Con Add-Padding:true, HIBP inyecta sufijos dummy con count 0. El módulo
    // NO filtra esas filas: si por colisión el sufijo real apareciera con :0,
    // reportaría pwned:true count:0. En la práctica los hashes de padding son
    // aleatorios → colisión con un sufijo real ≈ 0. Documentado como benigno.
    const suffix = suffixOf("password");
    mockFetchText(rangeBody([[suffix, 0]]));

    const result = await checkPwnedPassword("password");

    expect(result).toEqual({ pwned: true, count: 0 });
  });

  it("BORDE: línea con sufijo pero SIN ':count' → match con count 0 (split fallback)", async () => {
    // `match.split(":")[1] ?? "0"` → "0" cuando no hay separador.
    const suffix = suffixOf("password");
    const body = `${suffix}\r\n4444444444444444444444444444444444:9`;
    mockFetchText(body);

    const result = await checkPwnedPassword("password");

    expect(result).toEqual({ pwned: true, count: 0 });
  });

  it("BORDE: count no-numérico → parseInt da NaN (se propaga tal cual)", async () => {
    // Documenta el comportamiento real: count:"abc" → parseInt → NaN.
    const suffix = suffixOf("password");
    mockFetchText(rangeBody([[suffix, "abc"]]));

    const result = (await checkPwnedPassword("password")) as { pwned: boolean; count: number };

    expect(result.pwned).toBe(true);
    expect(Number.isNaN(result.count)).toBe(true);
  });

  it("count con basura tras el número → parseInt toma el prefijo numérico", async () => {
    const suffix = suffixOf("password");
    mockFetchText(rangeBody([[suffix, "123xyz"]]));

    const result = await checkPwnedPassword("password");

    expect(result).toEqual({ pwned: true, count: 123 });
  });

  it("BORDE startsWith: una línea = nuestro sufijo MÁS chars extra igual matchea (false-positive de startsWith)", async () => {
    // El módulo usa `.startsWith(suffix)`, NO igualdad exacta del sufijo. Una
    // línea "<suffix>ABC:5" empieza con nuestro sufijo de 35 chars y por tanto
    // matchea, aunque su sufijo REAL (38 chars) no sea el nuestro. Como HIBP
    // siempre devuelve sufijos de exactamente 35 chars, en producción esto no
    // ocurre; el test FIJA el comportamiento real (matchea → pwned) para que un
    // cambio futuro a igualdad exacta sea una decisión consciente, no accidental.
    // Además, split(":")[1] del "<suffix>ABC:5" toma "5" → count 5.
    const suffix = suffixOf("password");
    const body = `${suffix}ABC:5\r\n6666666666666666666666666666666666:1`;
    mockFetchText(body);

    const result = await checkPwnedPassword("password");

    expect(result).toEqual({ pwned: true, count: 5 });
  });

  it("BORDE: count con separador ':' extra ('<suffix>:5:9') → split(':')[1] toma '5' (ignora el resto)", async () => {
    // `match.split(":")[1]` toma SOLO el segundo segmento. Una línea
    // "<suffix>:5:9" parte en ["<suffix>", "5", "9"]; el índice [1] = "5" y el
    // ":9" sobrante se descarta. Documenta que un campo extra tras el count no
    // corrompe el parseo (toma el primer count, no el último ni una mezcla).
    const suffix = suffixOf("password");
    const body = `${suffix}:5:9\r\n7777777777777777777777777777777777:1`;
    mockFetchText(body);

    const result = await checkPwnedPassword("password");

    expect(result).toEqual({ pwned: true, count: 5 });
  });

  it("cuerpo con saltos de línea LF (sin CR) también parsea correctamente", async () => {
    const suffix = suffixOf("password");
    const body = `5555555555555555555555555555555555:1\n${suffix}:88`;
    mockFetchText(body);

    const result = await checkPwnedPassword("password");

    expect(result).toEqual({ pwned: true, count: 88 });
  });
});

// =============================================================================
// Determinismo del hash (mismo input → mismo prefijo/sufijo)
// =============================================================================
describe("checkPwnedPassword — determinismo del hash", () => {
  it("la misma password produce el mismo prefijo en llamadas repetidas", async () => {
    const fetchFn = mockFetchText(rangeBody([["AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", 1]]));

    await checkPwnedPassword("repeatable");
    await checkPwnedPassword("repeatable");

    const url1 = (fetchFn.mock.calls[0] as [string])[0];
    const url2 = (fetchFn.mock.calls[1] as [string])[0];
    expect(url1).toBe(url2);
    expect(url1).toBe(`${API_URL}${prefixOf("repeatable")}`);
  });

  it("passwords que difieren en un char generan hashes (y sufijos) distintos", async () => {
    expect(suffixOf("password")).not.toBe(suffixOf("passwore"));
    expect(prefixOf("password")).not.toBe(prefixOf("hunter2"));
  });
});

// =============================================================================
// Higiene de recursos: el timer de timeout se limpia en el `finally` también
// en el CAMINO FELIZ (no queda un setTimeout colgado tras una respuesta OK)
// =============================================================================
describe("checkPwnedPassword — limpieza del timer (clearTimeout en finally)", () => {
  // Fake timers locales a este bloque: capturamos el AbortSignal real y luego
  // adelantamos el reloj más allá de TIMEOUT_MS (3000). Si el `finally` NO
  // hubiera limpiado el timer, el callback `controller.abort()` dispararía y
  // signal.aborted pasaría a true; como SÍ se limpia, sigue en false y no
  // queda ningún timer pendiente (getTimerCount === 0).
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("respuesta OK (pwned) → no quedan timers colgados y el abort NUNCA dispara", async () => {
    const suffix = suffixOf("password");
    let captured: AbortSignal | undefined;
    const fetchFn = vi.fn(async (_url: string, init: RequestInit) => {
      captured = init.signal as AbortSignal;
      return new Response(rangeBody([[suffix, 42]]), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchFn);

    const result = await checkPwnedPassword("password");

    expect(result).toEqual({ pwned: true, count: 42 });
    expect(captured).toBeInstanceOf(AbortSignal);
    // Tras el camino feliz el signal no está abortado...
    expect(captured?.aborted).toBe(false);
    // ...y el timer ya fue limpiado por el finally (no hay nada pendiente).
    expect(vi.getTimerCount()).toBe(0);

    // Adelantar el reloj muy por encima del timeout NO debe abortar nada:
    // confirma que el setTimeout se canceló (de lo contrario abortaría aquí).
    vi.advanceTimersByTime(10_000);
    expect(captured?.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("respuesta OK (no comprometida) también limpia el timer del camino feliz", async () => {
    let captured: AbortSignal | undefined;
    const fetchFn = vi.fn(async (_url: string, init: RequestInit) => {
      captured = init.signal as AbortSignal;
      // Solo vecinos: el sufijo de "password" no está → pwned:false.
      return new Response(
        rangeBody([["0018A45C4D1DEF81644B54AB7F969B88D65", 10]]),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchFn);

    const result = await checkPwnedPassword("password");

    expect(result).toEqual({ pwned: false });
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(10_000);
    expect(captured?.aborted).toBe(false);
  });
});
