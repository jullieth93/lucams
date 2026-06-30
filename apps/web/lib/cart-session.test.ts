/*
 * Tests para cart-session — token de sesión de carrito anónimo.
 *
 * Estrategia: COOKIES. Mockeamos `cookies()` de next/headers con un store
 * en memoria que imita la superficie de RequestCookies/ResponseCookies que
 * usa el módulo (get/set/delete). Así los tests son deterministas y offline.
 *
 * Cubrimos:
 *   - peekCartSession: cookie ausente, UUID válido, UUID manipulado/inválido,
 *     mayúsculas (regex case-insensitive), vacío, valores casi-UUID.
 *   - getOrCreateCartSession: reutiliza sesión válida (no re-emite cookie),
 *     genera UUID v4 nuevo cuando falta o cuando la existente está corrupta.
 *   - setCartSessionCookie: opciones de cookie correctas (httpOnly, sameSite,
 *     path, maxAge) y `secure` dependiente de NODE_ENV (caso de SEGURIDAD).
 *   - clearCartSession: borra la cookie.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Mock store en memoria para next/headers cookies() -----------------------
//
// Modelamos lo mínimo que el módulo consume:
//   c.get(name)?.value
//   c.set(name, value, options)
//   c.delete(name)
// Guardamos las llamadas a set/delete para poder afirmar las opciones.

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

// Importamos DESPUÉS del mock. El módulo importa "server-only", que vitest
// aliasa al stub no-op (ver vitest.config.ts).
import {
  clearCartSession,
  getOrCreateCartSession,
  peekCartSession,
  setCartSessionCookie,
} from "./cart-session";

const COOKIE_NAME = "cart_session";
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VALID_UUID = "5a54a5e2-9b39-4ea2-8026-9edfbaf57a27";

beforeEach(() => {
  store = new MockCookieStore();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("peekCartSession", () => {
  it("returns null when the cookie is absent", async () => {
    await expect(peekCartSession()).resolves.toBeNull();
  });

  it("returns the value when a valid UUID v4 cookie is present", async () => {
    store.seed(COOKIE_NAME, VALID_UUID);
    await expect(peekCartSession()).resolves.toBe(VALID_UUID);
  });

  it("accepts an uppercase UUID (regex is case-insensitive)", async () => {
    const upper = VALID_UUID.toUpperCase();
    store.seed(COOKIE_NAME, upper);
    // El módulo devuelve el valor crudo, sin normalizar el casing.
    await expect(peekCartSession()).resolves.toBe(upper);
  });

  it("returns null for an empty-string cookie value", async () => {
    store.seed(COOKIE_NAME, "");
    await expect(peekCartSession()).resolves.toBeNull();
  });

  it("returns null for a tampered token that is not a UUID", async () => {
    store.seed(COOKIE_NAME, "not-a-uuid");
    await expect(peekCartSession()).resolves.toBeNull();
  });

  it("returns null for an arbitrary attacker-supplied string", async () => {
    store.seed(COOKIE_NAME, "'; DROP TABLE carts; --");
    await expect(peekCartSession()).resolves.toBeNull();
  });

  it("returns null when the UUID has trailing characters (anchored regex)", async () => {
    store.seed(COOKIE_NAME, `${VALID_UUID}x`);
    await expect(peekCartSession()).resolves.toBeNull();
  });

  it("returns null when the UUID has leading whitespace (anchored regex)", async () => {
    store.seed(COOKIE_NAME, ` ${VALID_UUID}`);
    await expect(peekCartSession()).resolves.toBeNull();
  });

  it("returns null for a UUID with a wrong segment length", async () => {
    // Tercer grupo con 5 hex en vez de 4.
    store.seed(COOKIE_NAME, "5a54a5e2-9b39-4ea22-026-9edfbaf57a27");
    await expect(peekCartSession()).resolves.toBeNull();
  });

  it("returns null for a UUID containing a non-hex character (g)", async () => {
    store.seed(COOKIE_NAME, "5a54a5e2-9b39-4ea2-8026-9edfbaf57a2g");
    await expect(peekCartSession()).resolves.toBeNull();
  });

  it("does NOT write or delete any cookie while peeking (read-only)", async () => {
    store.seed(COOKIE_NAME, VALID_UUID);
    await peekCartSession();
    expect(store.setCalls).toHaveLength(0);
    expect(store.deleteCalls).toHaveLength(0);
  });
});

describe("getOrCreateCartSession", () => {
  it("reuses an existing valid session without re-issuing the cookie", async () => {
    store.seed(COOKIE_NAME, VALID_UUID);
    const result = await getOrCreateCartSession();
    expect(result).toBe(VALID_UUID);
    // No debe re-emitir la cookie si ya hay una válida.
    expect(store.setCalls).toHaveLength(0);
  });

  it("generates a fresh UUID v4 and sets the cookie when none exists", async () => {
    const result = await getOrCreateCartSession();
    expect(result).toMatch(UUID_V4_RE);
    expect(store.setCalls).toHaveLength(1);
    const call = store.setCalls[0];
    expect(call.name).toBe(COOKIE_NAME);
    expect(call.value).toBe(result);
  });

  it("treats a corrupted existing cookie as absent and mints a new session", async () => {
    store.seed(COOKIE_NAME, "tampered-value");
    const result = await getOrCreateCartSession();
    expect(result).toMatch(UUID_V4_RE);
    // La cookie corrupta se reemplaza por una nueva válida.
    expect(store.setCalls).toHaveLength(1);
    expect(store.setCalls[0].value).toBe(result);
    expect(store.setCalls[0].value).not.toBe("tampered-value");
  });

  it("produces a distinct token on each independent creation (entropy)", async () => {
    const first = await getOrCreateCartSession();
    store = new MockCookieStore(); // simula request nueva sin cookie
    const second = await getOrCreateCartSession();
    expect(first).not.toBe(second);
  });

  it("a freshly minted session is readable back by peekCartSession", async () => {
    const created = await getOrCreateCartSession();
    // El set del create sembró el store; un peek posterior debe devolverlo.
    const peeked = await peekCartSession();
    expect(peeked).toBe(created);
  });
});

describe("setCartSessionCookie", () => {
  it("sets the security-relevant cookie options (httpOnly, sameSite lax, path, maxAge)", async () => {
    await setCartSessionCookie(VALID_UUID);
    expect(store.setCalls).toHaveLength(1);
    const { name, value, options } = store.setCalls[0];
    expect(name).toBe(COOKIE_NAME);
    expect(value).toBe(VALID_UUID);
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe("/");
    // 30 días en segundos.
    expect(options.maxAge).toBe(60 * 60 * 24 * 30);
  });

  it("marks the cookie Secure in production (SECURITY)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await setCartSessionCookie(VALID_UUID);
    expect(store.setCalls[0].options.secure).toBe(true);
  });

  it("does NOT mark the cookie Secure outside production (dev over http)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await setCartSessionCookie(VALID_UUID);
    expect(store.setCalls[0].options.secure).toBe(false);
  });

  it("does NOT mark the cookie Secure in the test environment", async () => {
    vi.stubEnv("NODE_ENV", "test");
    await setCartSessionCookie(VALID_UUID);
    expect(store.setCalls[0].options.secure).toBe(false);
  });
});

describe("clearCartSession", () => {
  it("deletes the cart_session cookie", async () => {
    store.seed(COOKIE_NAME, VALID_UUID);
    await clearCartSession();
    expect(store.deleteCalls).toEqual([COOKIE_NAME]);
    // Tras borrar, un peek ya no la encuentra.
    await expect(peekCartSession()).resolves.toBeNull();
  });

  it("is a no-op-safe delete when there is no cookie", async () => {
    await clearCartSession();
    expect(store.deleteCalls).toEqual([COOKIE_NAME]);
  });
});
