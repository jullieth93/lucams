/*
 * Tests de la marca de actividad del CLIENTE (idle-timeout 30 días deslizante,
 * 2026-10-12 — lib/customer-activity.ts).
 *
 * El primitivo HMAC (seal/read) está cubierto exhaustivamente en
 * admin-activity.test.ts (ambos módulos delegan en lib/activity-mark.ts); acá
 * se prueba el CONTRATO del cliente: nombre estable de la cookie, opciones
 * (httpOnly, path=/, maxAge > ventana — a diferencia de admin, path=/ porque
 * la sesión de cliente aplica a toda la tienda), round-trip y fail-closed.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CUSTOMER_ACTIVITY_COOKIE,
  CUSTOMER_IDLE_LIMIT_MS,
  CUSTOMER_SESSION_REQUIRED_PREFIXES,
  customerActivityCookieOptions,
  readCustomerActivityMark,
  sealCustomerActivityMark,
} from "./customer-activity";

const TEST_SECRET = "test-secret-fijo-customer-activity";

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("CSRF_SECRET", TEST_SECRET);
});

describe("sealCustomerActivityMark / readCustomerActivityMark", () => {
  it("round-trip: una marca sellada verifica y devuelve su timestamp", () => {
    const now = Date.now();
    expect(readCustomerActivityMark(sealCustomerActivityMark(now))).toBe(now);
  });

  it("rechaza timestamp plano, firma alterada y marca firmada con otro secreto", () => {
    expect(readCustomerActivityMark(String(Date.now()))).toBeNull();
    const mark = sealCustomerActivityMark(1724900000000);
    const forged = `1724900000001.${mark.slice(mark.indexOf(".") + 1)}`;
    expect(readCustomerActivityMark(forged)).toBeNull();
    vi.stubEnv("CSRF_SECRET", "otro-secreto-distinto");
    expect(readCustomerActivityMark(mark)).toBeNull();
  });

  it("fail-closed: lanza si CSRF_SECRET falta o es el placeholder", () => {
    vi.stubEnv("CSRF_SECRET", "");
    expect(() => sealCustomerActivityMark(Date.now())).toThrow(/CSRF_SECRET no configurado/);
    vi.stubEnv("CSRF_SECRET", "GENERATE_WITH_openssl_rand_hex_32");
    expect(() => readCustomerActivityMark("1.c2ln")).toThrow(/CSRF_SECRET no configurado/);
  });
});

describe("customerActivityCookieOptions", () => {
  it("secure=false fuera de despliegues Vercel (dev local por HTTP)", () => {
    expect(customerActivityCookieOptions().secure).toBe(false);
  });

  it.each(["production", "preview"])("secure=true con VERCEL_ENV=%s", (vercelEnv) => {
    vi.stubEnv("VERCEL_ENV", vercelEnv);
    expect(customerActivityCookieOptions().secure).toBe(true);
  });

  it("httpOnly + sameSite=lax + path=/ y maxAge > ventana de inactividad de 30 días", () => {
    const opts = customerActivityCookieOptions();
    expect(opts).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    expect(opts.maxAge * 1000).toBeGreaterThan(CUSTOMER_IDLE_LIMIT_MS);
  });
});

it("constantes estables: cookie, ventana de 30 días y prefijos que requieren sesión", () => {
  expect(CUSTOMER_ACTIVITY_COOKIE).toBe("customer_last_activity");
  expect(CUSTOMER_IDLE_LIMIT_MS).toBe(30 * 24 * 60 * 60 * 1000);
  expect(CUSTOMER_SESSION_REQUIRED_PREFIXES).toContain("/mi-cuenta");
});
