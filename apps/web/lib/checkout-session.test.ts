/*
 * Tests para checkout-session — estado multi-step del checkout en una cookie
 * firmada con HMAC-SHA256.
 *
 * Estrategia: COOKIES + CRYPTO. Mockeamos `cookies()` de next/headers con un
 * store en memoria que imita la superficie de RequestCookies/ResponseCookies
 * que consume el módulo (get/set/delete). Para el HMAC fijamos `CSRF_SECRET`
 * con vi.stubEnv → totalmente determinista y offline, sin depender del valor
 * real de .env.local.
 *
 * Reproducimos la firma del módulo (HMAC-SHA256 → base64url, payload base64url
 * unidos por ".") con `crypto` nativo en los helpers de test, para poder
 * sembrar cookies válidas, expiradas y manipuladas y afirmar comportamiento
 * concreto en cada rama.
 *
 * Cubrimos:
 *   - getCheckoutState: ausente, firma válida, firma manipulada, secreto
 *     equivocado, JSON corrupto, sin punto separador, expirada vs vigente,
 *     borde exacto del TTL, payloads no-objeto (null/number), round-trip.
 *   - setCheckoutState: merge sobre estado previo, defaults cuando no hay
 *     cookie, refresco de updatedAt, opciones de cookie (httpOnly/sameSite/
 *     path/maxAge) y `secure` según NODE_ENV (SEGURIDAD).
 *   - clearCheckoutState: borra la cookie.
 *   - getSecret: lanza si CSRF_SECRET falta o es el placeholder GENERATE_WITH*.
 *   - SEGURIDAD: un atacante no puede cambiar el JSON (precio/step) sin
 *     invalidar la firma; el secreto equivocado no verifica.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";

// --- Mock store en memoria para next/headers cookies() -----------------------
type CookieEntry = { name: string; value: string };
type SetCall = { name: string; value: string; options: Record<string, unknown> };

class MockCookieStore {
  private map = new Map<string, string>();
  public setCalls: SetCall[] = [];
  public deleteCalls: string[] = [];

  get(name: string): CookieEntry | undefined {
    if (!this.map.has(name)) return undefined;
    return { name, value: this.map.get(name)! };
  }

  set(name: string, value: string, options: Record<string, unknown> = {}): void {
    this.map.set(name, value);
    this.setCalls.push({ name, value, options });
  }

  delete(name: string): void {
    this.map.delete(name);
    this.deleteCalls.push(name);
  }

  // helper de test: sembrar una cookie sin registrar setCall
  seed(name: string, value: string): void {
    this.map.set(name, value);
  }
}

let store: MockCookieStore;

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => store),
}));

// Importamos DESPUÉS del mock. El módulo importa "server-only", aliasado al
// stub no-op en vitest.config.ts.
import {
  clearCheckoutState,
  getCheckoutState,
  setCheckoutState,
  type CheckoutState,
} from "./checkout-session";

const COOKIE_NAME = "checkout_state";
const TTL_SECONDS = 60 * 60;
const TEST_SECRET = "test-csrf-secret-deadbeefcafebabe1234567890abcdef";

// --- Helpers que reproducen el wire-format del módulo ------------------------
// El módulo firma: payload = base64url(JSON.stringify(state)); cookie =
// `${payload}.${base64url(HMAC-SHA256(payload, secret))}`. La replicamos para
// sembrar cookies válidas/manipuladas con un secreto controlado.
function signWith(secret: string, payload: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function encodePayload(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf-8").toString("base64url");
}

function buildCookie(value: unknown, secret = TEST_SECRET): string {
  const payload = encodePayload(value);
  return `${payload}.${signWith(secret, payload)}`;
}

function validState(overrides: Partial<CheckoutState> = {}): CheckoutState {
  return {
    step: 1,
    updatedAt: Date.now(),
    ...overrides,
  } as CheckoutState;
}

beforeEach(() => {
  store = new MockCookieStore();
  vi.stubEnv("CSRF_SECRET", TEST_SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// =============================================================================
describe("getCheckoutState", () => {
  it("returns null when the cookie is absent", async () => {
    await expect(getCheckoutState()).resolves.toBeNull();
  });

  it("returns the deserialized state for a valid signed cookie", async () => {
    const state = validState({
      step: 2,
      contact: { fullName: "Ana Pérez", email: "ana@example.co", phone: "3001112233" },
    });
    store.seed(COOKIE_NAME, buildCookie(state));

    const result = await getCheckoutState();
    expect(result).toEqual(state);
    expect(result?.step).toBe(2);
    expect(result?.contact?.email).toBe("ana@example.co");
  });

  it("preserves the full nested shape (address + shippingSelection + paymentMethod)", async () => {
    const state = validState({
      step: 3,
      address: {
        kind: "urban",
        deptCode: "11",
        cityCode: "11001",
        department: "Bogotá D.C.",
        city: "Bogotá",
        viaType: "Carrera",
        viaNumber: "7",
        cruceNumber: "12-34",
      },
      shippingSelection: {
        carrier: "coordinadora",
        carrierName: "Coordinadora",
        fleteCop: 1_200_000,
        deliveryDays: 3,
        contraentrega: true,
        quoteId: "q-abc-123",
      },
      paymentMethod: "COD",
    });
    store.seed(COOKIE_NAME, buildCookie(state));

    const result = await getCheckoutState();
    expect(result).toEqual(state);
    // fleteCop debe sobrevivir como entero (centavos COP) intacto.
    expect(result?.shippingSelection?.fleteCop).toBe(1_200_000);
    expect(result?.paymentMethod).toBe("COD");
  });

  it("does NOT write or delete any cookie while reading (read-only)", async () => {
    store.seed(COOKIE_NAME, buildCookie(validState({ step: 2 })));
    await getCheckoutState();
    expect(store.setCalls).toHaveLength(0);
    expect(store.deleteCalls).toHaveLength(0);
  });

  // --- Firma / integridad (SEGURIDAD) ----------------------------------------
  it("returns null when the cookie has no '.' separator", async () => {
    store.seed(COOKIE_NAME, "no-dot-here-just-garbage");
    await expect(getCheckoutState()).resolves.toBeNull();
  });

  it("returns null when the signature is tampered (single char flip)", async () => {
    const good = buildCookie(validState({ step: 2 }));
    const dot = good.lastIndexOf(".");
    const payload = good.slice(0, dot);
    const sig = good.slice(dot + 1);
    // Cambiamos el primer char de la firma por otro distinto del mismo largo.
    const flipped = (sig[0] === "A" ? "B" : "A") + sig.slice(1);
    store.seed(COOKIE_NAME, `${payload}.${flipped}`);
    await expect(getCheckoutState()).resolves.toBeNull();
  });

  it("returns null when the PAYLOAD is mutated but the old signature is kept (attacker rewrites JSON)", async () => {
    // Cliente intenta bajar el flete a 0 sin re-firmar.
    const honest = validState({
      step: 3,
      shippingSelection: {
        carrier: "coordinadora",
        carrierName: "Coordinadora",
        fleteCop: 1_200_000,
        deliveryDays: 3,
        contraentrega: false,
        quoteId: "q-1",
      },
    });
    const honestCookie = buildCookie(honest);
    const dot = honestCookie.lastIndexOf(".");
    const honestSig = honestCookie.slice(dot + 1);

    const tampered = { ...honest, shippingSelection: { ...honest.shippingSelection, fleteCop: 0 } };
    const tamperedPayload = encodePayload(tampered);
    // Reusa la firma del payload honesto → no verifica.
    store.seed(COOKIE_NAME, `${tamperedPayload}.${honestSig}`);

    await expect(getCheckoutState()).resolves.toBeNull();
  });

  it("returns null when the cookie was signed with a DIFFERENT secret", async () => {
    // Mismo payload, firma válida pero con otro secreto. Como el módulo usa
    // TEST_SECRET (vía stubEnv), la verificación debe fallar.
    store.seed(COOKIE_NAME, buildCookie(validState({ step: 2 }), "some-other-secret"));
    await expect(getCheckoutState()).resolves.toBeNull();
  });

  it("returns null when a signature of a different LENGTH is supplied (length guard before timingSafeEqual)", async () => {
    const good = buildCookie(validState({ step: 1 }));
    const payload = good.slice(0, good.lastIndexOf("."));
    // Firma demasiado corta: timingSafeEqual lanzaría con largos distintos,
    // pero verify() corta antes por la guarda de longitud → null limpio.
    store.seed(COOKIE_NAME, `${payload}.abc`);
    await expect(getCheckoutState()).resolves.toBeNull();
  });

  it("returns null when the payload is valid-signed but decodes to corrupt JSON", async () => {
    // Firmamos un payload base64url cuyo contenido NO es JSON válido.
    const payload = Buffer.from("{not json at all", "utf-8").toString("base64url");
    store.seed(COOKIE_NAME, `${payload}.${signWith(TEST_SECRET, payload)}`);
    await expect(getCheckoutState()).resolves.toBeNull();
  });

  // --- Expiración (TTL) ------------------------------------------------------
  it("returns null when the state is older than the 60-min TTL", async () => {
    const expired = validState({
      step: 2,
      updatedAt: Date.now() - (TTL_SECONDS * 1000 + 5_000), // 5s pasado el límite
    });
    store.seed(COOKIE_NAME, buildCookie(expired));
    await expect(getCheckoutState()).resolves.toBeNull();
  });

  it("returns the state when it is just inside the TTL window", async () => {
    const fresh = validState({
      step: 2,
      updatedAt: Date.now() - (TTL_SECONDS * 1000 - 60_000), // 1 min de margen
    });
    store.seed(COOKIE_NAME, buildCookie(fresh));
    const result = await getCheckoutState();
    expect(result).not.toBeNull();
    expect(result?.step).toBe(2);
  });

  it("treats exactly-at-TTL as still valid (boundary is strict '>' )", async () => {
    // Date.now() - updatedAt === TTL*1000 → NO es > TTL*1000 → válida.
    // Fijamos el reloj para que la resta sea exacta.
    const now = 1_700_000_000_000;
    vi.useFakeTimers();
    vi.setSystemTime(now);
    try {
      const atBoundary = validState({ step: 1, updatedAt: now - TTL_SECONDS * 1000 });
      store.seed(COOKIE_NAME, buildCookie(atBoundary));
      const result = await getCheckoutState();
      expect(result).not.toBeNull();
      expect(result?.step).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("treats one millisecond past TTL as expired", async () => {
    const now = 1_700_000_000_000;
    vi.useFakeTimers();
    vi.setSystemTime(now);
    try {
      const justPast = validState({ step: 1, updatedAt: now - TTL_SECONDS * 1000 - 1 });
      store.seed(COOKIE_NAME, buildCookie(justPast));
      await expect(getCheckoutState()).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  // --- Payloads no-objeto: documentan el comportamiento ACTUAL ---------------
  it("returns null when the signed payload is literal `null` (null.updatedAt throws → caught)", async () => {
    const payload = encodePayload(null);
    store.seed(COOKIE_NAME, `${payload}.${signWith(TEST_SECRET, payload)}`);
    // JSON.parse → null; luego `null.updatedAt` lanza TypeError → catch → null.
    await expect(getCheckoutState()).resolves.toBeNull();
  });

  it("returns a non-object payload as-is when it has no updatedAt (NaN-expiry quirk, documented)", async () => {
    // BUG benigno: no hay validación de esquema. Un número firmado pasa porque
    // (number).updatedAt es undefined → Date.now()-undefined = NaN → NaN > x es
    // false → el código devuelve el valor crudo (5). El módulo confía en la
    // firma HMAC para garantizar la forma, no en un schema runtime.
    const payload = encodePayload(5);
    store.seed(COOKIE_NAME, `${payload}.${signWith(TEST_SECRET, payload)}`);
    const result = await getCheckoutState();
    expect(result).toBe(5 as unknown as CheckoutState);
  });

  it("returns an object WITHOUT updatedAt as-is (missing updatedAt → NaN compare → not expired)", async () => {
    // Mismo quirk con un objeto: sin updatedAt, nunca se considera expirada.
    const noTimestamp = { step: 2, contact: { fullName: "X" } };
    const payload = encodePayload(noTimestamp);
    store.seed(COOKIE_NAME, `${payload}.${signWith(TEST_SECRET, payload)}`);
    const result = await getCheckoutState();
    expect(result).toEqual(noTimestamp);
  });
});

// =============================================================================
describe("setCheckoutState", () => {
  it("writes a signed cookie that getCheckoutState can read back (round-trip)", async () => {
    const written = await setCheckoutState({
      step: 2,
      contact: { fullName: "Beto", email: "beto@example.co", phone: "3010000000" },
    });
    expect(written.step).toBe(2);
    expect(store.setCalls).toHaveLength(1);

    // El valor sembrado debe leerse de vuelta idéntico.
    const readBack = await getCheckoutState();
    expect(readBack).toEqual(written);
  });

  it("defaults to step 1 and a fresh updatedAt when no prior cookie exists", async () => {
    const before = Date.now();
    const written = await setCheckoutState({ contact: { fullName: "C", email: "c@x.co", phone: "3" } });
    expect(written.step).toBe(1);
    expect(written.updatedAt).toBeGreaterThanOrEqual(before);
    expect(written.updatedAt).toBeLessThanOrEqual(Date.now());
  });

  it("merges partial fields over the existing state (each step only sends its own fields)", async () => {
    // Step 1: contacto.
    await setCheckoutState({
      step: 1,
      contact: { fullName: "Dina", email: "dina@x.co", phone: "3001234567" },
    });
    // Step 2: dirección, sin reenviar contacto.
    const merged = await setCheckoutState({
      step: 2,
      address: {
        kind: "rural",
        deptCode: "05",
        cityCode: "05001",
        department: "Antioquia",
        city: "Medellín",
        vereda: "La Honda",
        referencia: "Casa azul",
      },
    });

    expect(merged.step).toBe(2);
    // El contacto del step 1 sobrevive al merge.
    expect(merged.contact).toEqual({ fullName: "Dina", email: "dina@x.co", phone: "3001234567" });
    expect(merged.address?.kind).toBe("rural");
  });

  it("partial fields OVERRIDE prior values for the same key", async () => {
    await setCheckoutState({ step: 1, paymentMethod: "COD" });
    const updated = await setCheckoutState({ step: 3, paymentMethod: "WOMPI" });
    expect(updated.step).toBe(3);
    expect(updated.paymentMethod).toBe("WOMPI");
  });

  it("always refreshes updatedAt on each write (sliding TTL)", async () => {
    const t0 = 1_700_000_000_000;
    vi.useFakeTimers();
    vi.setSystemTime(t0);
    try {
      const first = await setCheckoutState({ step: 1 });
      expect(first.updatedAt).toBe(t0);

      vi.setSystemTime(t0 + 30_000);
      const second = await setCheckoutState({ step: 2 });
      expect(second.updatedAt).toBe(t0 + 30_000);
      expect(second.updatedAt).toBeGreaterThan(first.updatedAt);
    } finally {
      vi.useRealTimers();
    }
  });

  it("starts from defaults (step 1) when the existing cookie is expired", async () => {
    // Sembramos una cookie EXPIRADA; getCheckoutState (interno) la descarta,
    // así que setCheckoutState parte de {step:1} en vez de mergear.
    const expired = validState({
      step: 3,
      contact: { fullName: "Old", email: "old@x.co", phone: "3" },
      updatedAt: Date.now() - (TTL_SECONDS * 1000 + 10_000),
    });
    store.seed(COOKIE_NAME, buildCookie(expired));

    const written = await setCheckoutState({ paymentMethod: "WOMPI" });
    expect(written.step).toBe(1); // no se heredó el step 3 expirado
    expect(written.contact).toBeUndefined(); // contacto viejo descartado
    expect(written.paymentMethod).toBe("WOMPI");
  });

  it("starts from defaults when the existing cookie has a tampered signature", async () => {
    const honest = buildCookie(validState({ step: 3, paymentMethod: "COD" }));
    const dot = honest.lastIndexOf(".");
    const badSig = (honest.slice(dot + 1)[0] === "A" ? "B" : "A") + honest.slice(dot + 2);
    store.seed(COOKIE_NAME, `${honest.slice(0, dot)}.${badSig}`);

    const written = await setCheckoutState({ step: 2 });
    // Cookie manipulada se ignora → no hereda paymentMethod COD.
    expect(written.paymentMethod).toBeUndefined();
    expect(written.step).toBe(2);
  });

  // --- Opciones de cookie (SEGURIDAD) ----------------------------------------
  it("sets the security-relevant cookie options (httpOnly, sameSite lax, path, maxAge=TTL)", async () => {
    await setCheckoutState({ step: 1 });
    expect(store.setCalls).toHaveLength(1);
    const { name, options } = store.setCalls[0];
    expect(name).toBe(COOKIE_NAME);
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe("/");
    expect(options.maxAge).toBe(TTL_SECONDS);
  });

  it("writes a cookie value of the form `<payload>.<signature>` (single dot, base64url)", async () => {
    await setCheckoutState({ step: 1 });
    const { value } = store.setCalls[0];
    const dot = value.lastIndexOf(".");
    expect(dot).toBeGreaterThan(0);
    const payload = value.slice(0, dot);
    const sig = value.slice(dot + 1);
    // base64url: solo A-Za-z0-9-_ (sin '.', '+' ni '/').
    expect(payload).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(sig).toMatch(/^[A-Za-z0-9_-]+$/);
    // La firma escrita debe coincidir con HMAC(payload, TEST_SECRET).
    expect(sig).toBe(signWith(TEST_SECRET, payload));
  });

  it("marks the cookie Secure in production (SECURITY)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await setCheckoutState({ step: 1 });
    expect(store.setCalls[0].options.secure).toBe(true);
  });

  it("does NOT mark the cookie Secure outside production (dev over http)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await setCheckoutState({ step: 1 });
    expect(store.setCalls[0].options.secure).toBe(false);
  });

  it("does NOT mark the cookie Secure in the test environment", async () => {
    vi.stubEnv("NODE_ENV", "test");
    await setCheckoutState({ step: 1 });
    expect(store.setCalls[0].options.secure).toBe(false);
  });
});

// =============================================================================
describe("clearCheckoutState", () => {
  it("deletes the checkout_state cookie", async () => {
    store.seed(COOKIE_NAME, buildCookie(validState({ step: 2 })));
    await clearCheckoutState();
    expect(store.deleteCalls).toEqual([COOKIE_NAME]);
    // Tras borrar, una lectura ya no la encuentra.
    await expect(getCheckoutState()).resolves.toBeNull();
  });

  it("is a no-op-safe delete when there is no cookie", async () => {
    await clearCheckoutState();
    expect(store.deleteCalls).toEqual([COOKIE_NAME]);
  });
});

// =============================================================================
describe("getSecret (CSRF_SECRET configuration guard)", () => {
  it("throws on read when CSRF_SECRET is unset", async () => {
    vi.stubEnv("CSRF_SECRET", "");
    store.seed(COOKIE_NAME, "anything.with.dots"); // fuerza llegar a verify()→sign()→getSecret()
    await expect(getCheckoutState()).rejects.toThrow(/CSRF_SECRET no configurado/);
  });

  it("throws when CSRF_SECRET is the placeholder (starts with GENERATE_WITH)", async () => {
    vi.stubEnv("CSRF_SECRET", "GENERATE_WITH_openssl_rand_hex_32");
    store.seed(COOKIE_NAME, "anything.x");
    await expect(getCheckoutState()).rejects.toThrow(/CSRF_SECRET no configurado/);
  });

  it("throws on setCheckoutState when CSRF_SECRET is unset (cannot sign)", async () => {
    vi.stubEnv("CSRF_SECRET", "   "); // solo whitespace → trim() vacío
    await expect(setCheckoutState({ step: 1 })).rejects.toThrow(/CSRF_SECRET no configurado/);
  });

  it("trims surrounding whitespace from the secret (a padded secret still verifies)", async () => {
    // El módulo hace .trim(); sembramos una cookie firmada con el secreto
    // SIN espacios y configuramos CSRF_SECRET CON espacios → debe verificar.
    vi.stubEnv("CSRF_SECRET", `  ${TEST_SECRET}  `);
    store.seed(COOKIE_NAME, buildCookie(validState({ step: 2 }), TEST_SECRET));
    const result = await getCheckoutState();
    expect(result?.step).toBe(2);
  });
});
