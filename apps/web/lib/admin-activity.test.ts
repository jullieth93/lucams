/*
 * Tests de la marca de actividad admin firmada (B-8, auditoría 2026-08-24).
 *
 * sealAdminActivityMark/readAdminActivityMark son puros (HMAC-SHA256 con
 * CSRF_SECRET, digest base64url, timing-safe compare — mismo patrón que
 * lib/checkout-session.ts): se ejercitan sin mocks, fijando CSRF_SECRET con
 * vi.stubEnv para determinismo. Cubren el round-trip, el rechazo de marcas
 * forjadas (timestamp plano pre-B-8, timestamp alterado, secreto equivocado)
 * y el guard fail-closed cuando el secreto no está configurado.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ADMIN_ACTIVITY_COOKIE,
  adminActivityCookieOptions,
  readAdminActivityMark,
  sealAdminActivityMark,
} from "./admin-activity";

const TEST_SECRET = "test-secret-fijo-admin-activity";

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("CSRF_SECRET", TEST_SECRET);
});

describe("sealAdminActivityMark / readAdminActivityMark", () => {
  it("round-trip: una marca sellada verifica y devuelve su timestamp", () => {
    const now = Date.now();
    expect(readAdminActivityMark(sealAdminActivityMark(now))).toBe(now);
  });

  it("el formato es `<ts>.<firma base64url>`", () => {
    expect(sealAdminActivityMark(1724900000000)).toMatch(/^1724900000000\.[A-Za-z0-9_-]+$/);
  });

  it("RECHAZA el timestamp plano sin firma (formato pre-B-8 / forjado con cookies robadas)", () => {
    expect(readAdminActivityMark(String(Date.now()))).toBeNull();
  });

  it("rechaza un timestamp alterado sobre una firma legítima", () => {
    const mark = sealAdminActivityMark(1724900000000);
    const forged = `1724900000001.${mark.slice(mark.indexOf(".") + 1)}`;
    expect(readAdminActivityMark(forged)).toBeNull();
  });

  it("rechaza una firma truncada o extendida (length check antes del compare)", () => {
    const mark = sealAdminActivityMark(1724900000000);
    const sig = mark.slice(mark.indexOf(".") + 1);
    expect(readAdminActivityMark(`1724900000000.${sig.slice(0, -1)}`)).toBeNull();
    expect(readAdminActivityMark(`1724900000000.${sig}xx`)).toBeNull();
  });

  it("rechaza una marca firmada con OTRO secreto", () => {
    const mark = sealAdminActivityMark(1724900000000);
    vi.stubEnv("CSRF_SECRET", "otro-secreto-distinto");
    expect(readAdminActivityMark(mark)).toBeNull();
  });

  it("rechaza valores malformados (ausente, vacío, sin punto, ts no numérico)", () => {
    expect(readAdminActivityMark(undefined)).toBeNull();
    expect(readAdminActivityMark(null)).toBeNull();
    expect(readAdminActivityMark("")).toBeNull();
    expect(readAdminActivityMark("abc.def")).toBeNull();
    expect(readAdminActivityMark(".soloFirma")).toBeNull();
    expect(readAdminActivityMark("123.")).toBeNull();
  });

  it("fail-closed: lanza si CSRF_SECRET falta o es el placeholder (mismo guard que checkout-session)", () => {
    vi.stubEnv("CSRF_SECRET", "");
    expect(() => sealAdminActivityMark(Date.now())).toThrow(/CSRF_SECRET no configurado/);
    expect(() => readAdminActivityMark("1.c2ln")).toThrow(/CSRF_SECRET no configurado/);
    vi.stubEnv("CSRF_SECRET", "GENERATE_WITH_openssl_rand_hex_32");
    expect(() => sealAdminActivityMark(Date.now())).toThrow(/CSRF_SECRET no configurado/);
  });
});

describe("adminActivityCookieOptions", () => {
  it("secure=false fuera de despliegues Vercel (dev local por HTTP)", () => {
    expect(adminActivityCookieOptions().secure).toBe(false);
  });

  it.each(["production", "preview"])("secure=true con VERCEL_ENV=%s", (vercelEnv) => {
    vi.stubEnv("VERCEL_ENV", vercelEnv);
    expect(adminActivityCookieOptions().secure).toBe(true);
  });

  it("mantiene httpOnly + sameSite=lax + path=/admin y maxAge >> ventana de inactividad", () => {
    const opts = adminActivityCookieOptions();
    expect(opts).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/admin" });
    expect(opts.maxAge).toBeGreaterThan(30 * 60);
  });
});

it("el nombre de la cookie es estable (lo referencian proxy.ts y la acción de login)", () => {
  expect(ADMIN_ACTIVITY_COOKIE).toBe("admin_last_activity");
});
