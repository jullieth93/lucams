// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  acceptAllPreferences,
  COOKIE_CONSENT_NAME,
  COOKIE_CONSENT_VERSION,
  emptyPreferences,
  readClientCookiePreferences,
  rejectAllPreferences,
  writeClientCookiePreferences,
} from "./cookie-consent";

afterEach(() => {
  // limpiar la cookie entre tests
  document.cookie = `${COOKIE_CONSENT_NAME}=; Max-Age=0; Path=/`;
});

describe("CookiePreferences factories", () => {
  it("emptyPreferences: only necessary true", () => {
    const p = emptyPreferences();
    expect(p.necessary).toBe(true);
    expect(p.functional).toBe(false);
    expect(p.analytics).toBe(false);
    expect(p.marketing).toBe(false);
    expect(p.v).toBe(COOKIE_CONSENT_VERSION);
  });

  it("rejectAllPreferences: same as empty pero con savedAt", () => {
    const p = rejectAllPreferences();
    expect(p.functional).toBe(false);
    expect(p.analytics).toBe(false);
    expect(p.marketing).toBe(false);
    expect(p.savedAt).not.toBe("");
  });

  it("acceptAllPreferences: all toggles true + savedAt", () => {
    const p = acceptAllPreferences();
    expect(p.necessary).toBe(true);
    expect(p.functional).toBe(true);
    expect(p.analytics).toBe(true);
    expect(p.marketing).toBe(true);
    expect(p.savedAt).not.toBe("");
  });
});

describe("read/write client cookie", () => {
  it("returns null if no cookie", () => {
    expect(readClientCookiePreferences()).toBeNull();
  });

  it("round-trips a saved preference set", () => {
    const original = acceptAllPreferences();
    writeClientCookiePreferences(original);
    const read = readClientCookiePreferences();
    expect(read).not.toBeNull();
    expect(read?.functional).toBe(true);
    expect(read?.analytics).toBe(true);
    expect(read?.marketing).toBe(true);
  });

  it("invalidates cookie of older version", () => {
    document.cookie = `${COOKIE_CONSENT_NAME}=${encodeURIComponent(
      JSON.stringify({ v: 0, necessary: true, functional: true }),
    )}; Path=/`;
    expect(readClientCookiePreferences()).toBeNull();
  });

  it("returns null if cookie value is malformed JSON", () => {
    document.cookie = `${COOKIE_CONSENT_NAME}=not-a-json-value; Path=/`;
    expect(readClientCookiePreferences()).toBeNull();
  });
});
