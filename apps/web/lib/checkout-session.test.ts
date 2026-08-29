/*
 * Tests para checkout-session — estado multi-step del checkout en una cookie
 * SELLADA con AES-256-GCM (F-9, auditoría 2026-08-24: antes solo firmada HMAC
 * y el JSON con PII era legible en base64).
 *
 * Estrategia: COOKIES + CRYPTO. Mockeamos `cookies()` de next/headers con un
 * store en memoria que imita la superficie de RequestCookies/ResponseCookies
 * que consume el módulo (get/set/delete). Para el sellado fijamos `CSRF_SECRET`
 * con vi.stubEnv → totalmente determinista y offline, sin depender del valor
 * real de .env.local.
 *
 * Reproducimos el wire-format del módulo (base64url(iv).base64url(tag).
 * base64url(ciphertext), clave sha256("checkout-session:"+CSRF_SECRET)) con
 * `crypto` nativo en los helpers de test, para sembrar cookies válidas,
 * manipuladas, legacy (HMAC pre-F-9) y corruptas, y afirmar cada rama.
 *
 * Cubrimos:
 *   - getCheckoutState: ausente, round-trip, tag manipulado, ct manipulado,
 *     secreto equivocado, segmentos malformados, JSON corrupto, legacy HMAC
 *     (degrada a "sin sesión"), expirada vs vigente, borde exacto del TTL,
 *     payloads no-objeto (null/number).
 *   - setCheckoutState: merge sobre estado previo, defaults cuando no hay
 *     cookie o es legacy/inválida, refresco de updatedAt, opciones de cookie
 *     (httpOnly/sameSite/path/maxAge) y `secure` según NODE_ENV (SEGURIDAD),
 *     IV aleatorio por escritura, y que la cookie NO expone PII legible (F-9).
 *   - clearCheckoutState: borra la cookie.
 *   - getSecret: lanza si CSRF_SECRET falta o es el placeholder GENERATE_WITH*.
 *   - SEGURIDAD: un atacante no puede leer NI cambiar el JSON (precio/step).
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
// El módulo sella: `base64url(iv).base64url(tag).base64url(ct)` con
// AES-256-GCM y clave sha256("checkout-session:" + CSRF_SECRET). Lo replicamos
// para sembrar cookies válidas/manipuladas con un secreto controlado.
function sealRawWith(secret: string, json: string): string {
  const key = crypto.createHash("sha256").update(`checkout-session:${secret}`).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(json, "utf-8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((b) => b.toString("base64url")).join(".");
}

function buildCookie(value: unknown, secret = TEST_SECRET): string {
  return sealRawWith(secret, JSON.stringify(value));
}

/** Formato LEGACY pre-F-9 (HMAC): `base64url(payload).base64url(firma)`. */
function buildLegacyCookie(value: unknown, secret = TEST_SECRET): string {
  const payload = Buffer.from(JSON.stringify(value), "utf-8").toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
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

  // --- Sello / integridad (SEGURIDAD) ----------------------------------------
  it("returns null when the cookie has no '.' separator", async () => {
    store.seed(COOKIE_NAME, "no-dot-here-just-garbage");
    await expect(getCheckoutState()).resolves.toBeNull();
  });

  it("returns null when the auth tag is tampered (single char flip)", async () => {
    const good = buildCookie(validState({ step: 2 }));
    const [iv, tag, ct] = good.split(".");
    // Cambiamos el primer char del tag por otro distinto del mismo largo.
    const flipped = (tag[0] === "A" ? "B" : "A") + tag.slice(1);
    store.seed(COOKIE_NAME, [iv, flipped, ct].join("."));
    await expect(getCheckoutState()).resolves.toBeNull();
  });

  it("returns null when the CIPHERTEXT is swapped from another valid cookie (attacker rewrites state)", async () => {
    // Cliente intenta bajar el flete a 0: sella su propio estado manipulado... no
    // puede (no tiene la clave); lo único que puede hacer es recombinar segmentos.
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
    const other = buildCookie(validState({ step: 1 }));
    const [iv, tag] = buildCookie(honest).split(".");
    const otherCt = other.split(".")[2];
    // ct ajeno + iv/tag propios → el auth tag no verifica → null.
    store.seed(COOKIE_NAME, [iv, tag, otherCt].join("."));
    await expect(getCheckoutState()).resolves.toBeNull();
  });

  it("returns null when the cookie was sealed with a DIFFERENT secret", async () => {
    // Mismo estado, sello válido pero con otro secreto. Como el módulo usa
    // TEST_SECRET (vía stubEnv), el unseal debe fallar.
    store.seed(COOKIE_NAME, buildCookie(validState({ step: 2 }), "some-other-secret"));
    await expect(getCheckoutState()).resolves.toBeNull();
  });

  it("returns null for malformed 3-segment values (bad iv/tag lengths throw inside unseal)", async () => {
    store.seed(COOKIE_NAME, "aa.bb.cc");
    await expect(getCheckoutState()).resolves.toBeNull();
  });

  it("returns null when the sealed payload decodes to corrupt JSON", async () => {
    // Sellamos un cuerpo cuyo contenido NO es JSON válido.
    store.seed(COOKIE_NAME, sealRawWith(TEST_SECRET, "{not json at all"));
    await expect(getCheckoutState()).resolves.toBeNull();
  });

  // --- Formato LEGACY (HMAC pre-F-9): degrada a "sin sesión" ------------------
  it("treats a legacy HMAC cookie (payload.signature) as NO session", async () => {
    // Cookies escritas antes del despliegue de F-9 (TTL 60 min): el cliente
    // simplemente vuelve al step 1 en vez de reventar.
    store.seed(COOKIE_NAME, buildLegacyCookie(validState({ step: 3 })));
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
  it("returns null when the sealed payload is literal `null` (null.updatedAt throws → caught)", async () => {
    store.seed(COOKIE_NAME, buildCookie(null));
    // JSON.parse → null; luego `null.updatedAt` lanza TypeError → catch → null.
    await expect(getCheckoutState()).resolves.toBeNull();
  });

  it("returns a non-object payload as-is when it has no updatedAt (NaN-expiry quirk, documented)", async () => {
    // BUG benigno: no hay validación de esquema. Un número sellado pasa porque
    // (number).updatedAt es undefined → Date.now()-undefined = NaN → NaN > x es
    // false → el código devuelve el valor crudo (5). El módulo confía en el
    // sellado GCM para garantizar la forma, no en un schema runtime.
    store.seed(COOKIE_NAME, buildCookie(5));
    const result = await getCheckoutState();
    expect(result).toBe(5 as unknown as CheckoutState);
  });

  it("returns an object WITHOUT updatedAt as-is (missing updatedAt → NaN compare → not expired)", async () => {
    // Mismo quirk con un objeto: sin updatedAt, nunca se considera expirada.
    const noTimestamp = { step: 2, contact: { fullName: "X" } };
    store.seed(COOKIE_NAME, buildCookie(noTimestamp));
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
    const written = await setCheckoutState({
      contact: { fullName: "C", email: "c@x.co", phone: "3" },
    });
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

  it("starts from defaults when the existing cookie has a tampered ciphertext", async () => {
    const honest = buildCookie(validState({ step: 3, paymentMethod: "COD" }));
    const [iv, tag, ct] = honest.split(".");
    const badCt = (ct[0] === "A" ? "B" : "A") + ct.slice(1);
    store.seed(COOKIE_NAME, [iv, tag, badCt].join("."));

    const written = await setCheckoutState({ step: 2 });
    // Cookie manipulada se ignora → no hereda paymentMethod COD.
    expect(written.paymentMethod).toBeUndefined();
    expect(written.step).toBe(2);
  });

  it("starts from defaults when the existing cookie is LEGACY HMAC format (pre-F-9)", async () => {
    store.seed(COOKIE_NAME, buildLegacyCookie(validState({ step: 3, paymentMethod: "COD" })));
    const written = await setCheckoutState({ step: 2 });
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

  it("writes a cookie value of the form `<iv>.<tag>.<ciphertext>` (3 base64url segments)", async () => {
    await setCheckoutState({ step: 1 });
    const { value } = store.setCalls[0];
    const parts = value.split(".");
    expect(parts).toHaveLength(3);
    for (const seg of parts) {
      // base64url: solo A-Za-z0-9-_ (sin '.', '+' ni '/').
      expect(seg).toMatch(/^[A-Za-z0-9_-]+$/);
    }
    // iv de 12 bytes → 16 chars base64url; tag GCM de 16 bytes → 22 chars.
    expect(parts[0]).toHaveLength(16);
    expect(parts[1]).toHaveLength(22);
  });

  it("uses a random IV per write: two identical states produce different cookie values", async () => {
    const state = { step: 2 as const, contact: { fullName: "E", email: "e@x.co", phone: "3" } };
    await setCheckoutState(state);
    const first = store.setCalls[0].value;
    await clearCheckoutState();
    await setCheckoutState(state);
    const second = store.setCalls[1].value;
    expect(second).not.toBe(first);
    // Ambos des-sellan al mismo estado.
    expect((await getCheckoutState())?.contact?.email).toBe("e@x.co");
  });

  it("F-9: the sealed cookie carries NO readable PII (plaintext or base64-decodable)", async () => {
    const pii = {
      fullName: "María Fernanda Ríos",
      email: "mafer.rios@example.co",
      phone: "3009998877",
      documentType: "CC" as const,
      documentNumber: "1037654321",
    };
    await setCheckoutState({ step: 2, contact: pii });
    const { value } = store.setCalls[0];

    // Ni el valor crudo ni NINGÚN segmento decodificado exponen la PII.
    expect(value).not.toContain(pii.email);
    for (const seg of value.split(".")) {
      const decoded = Buffer.from(seg, "base64url").toString("utf-8");
      expect(decoded).not.toContain(pii.email);
      expect(decoded).not.toContain(pii.fullName);
      expect(decoded).not.toContain(pii.documentNumber);
    }
    // Y el valor completo no es base64url-decodificable al JSON (era el leak F-9).
    const whole = Buffer.from(value, "base64url").toString("utf-8");
    expect(whole).not.toContain(pii.email);
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
    store.seed(COOKIE_NAME, "anything.with.dots"); // 3 segmentos → fuerza llegar a unseal→getSecret()
    await expect(getCheckoutState()).rejects.toThrow(/CSRF_SECRET no configurado/);
  });

  it("throws when CSRF_SECRET is the placeholder (starts with GENERATE_WITH)", async () => {
    vi.stubEnv("CSRF_SECRET", "GENERATE_WITH_openssl_rand_hex_32");
    store.seed(COOKIE_NAME, "aa.bb.cc"); // 3 segmentos → llega a derivar la clave
    await expect(getCheckoutState()).rejects.toThrow(/CSRF_SECRET no configurado/);
  });

  it("throws on setCheckoutState when CSRF_SECRET is unset (cannot seal)", async () => {
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
