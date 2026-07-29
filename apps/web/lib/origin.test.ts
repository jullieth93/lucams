/*
 * getTrustedSelfBaseUrl — base URL del propio deployment desde env CONFIABLE (no del header Host).
 * ADR-062: evita SSRF/reporte falso en el self-fetch de /api/health/all.
 */

import { describe, it, expect, afterEach, vi } from "vitest";

// Mock controlable de next/headers para getRequestOrigin (los tests de
// getTrustedSelfBaseUrl no lo usan, pero origin.ts lo importa a nivel módulo).
const headerStore = new Map<string, string>();
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (k: string) => headerStore.get(k) ?? null }),
}));

import { getTrustedSelfBaseUrl, getRequestOrigin } from "./origin";

const KEYS = ["VERCEL_URL", "VERCEL_ENV", "NEXT_PUBLIC_SITE_URL", "PORT"] as const;
const saved: Record<string, string | undefined> = {};
for (const k of KEYS) saved[k] = process.env[k];

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function clear() {
  for (const k of KEYS) delete process.env[k];
}

describe("getTrustedSelfBaseUrl", () => {
  // Regresión 2026-07-20: en producción la URL de deployment está detrás de Deployment
  // Protection y responde 302 al login de Vercel → /api/health/all parseaba HTML y reportaba
  // los 3 servicios "fail" estando sanos. El dominio canónico no está protegido.
  it("en PRODUCCIÓN usa el dominio canónico, NO la URL protegida del deployment", () => {
    clear();
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_URL = "lucams-shop-abc-jullieth93s-projects.vercel.app";
    process.env.NEXT_PUBLIC_SITE_URL = "https://lucamsshop.com/";
    expect(getTrustedSelfBaseUrl()).toBe("https://lucamsshop.com");
  });

  it("en producción SIN dominio canónico cae a VERCEL_URL (mejor eso que localhost)", () => {
    clear();
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_URL = "lucams-shop-abc-jullieth93s-projects.vercel.app";
    expect(getTrustedSelfBaseUrl()).toBe("https://lucams-shop-abc-jullieth93s-projects.vercel.app");
  });

  it("en PREVIEW se prueba a sí mismo (VERCEL_URL), no al dominio de producción", () => {
    clear();
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_URL = "lucams-shop-pr123-jullieth93s-projects.vercel.app";
    process.env.NEXT_PUBLIC_SITE_URL = "https://lucamsshop.com";
    expect(getTrustedSelfBaseUrl()).toBe(
      "https://lucams-shop-pr123-jullieth93s-projects.vercel.app",
    );
  });

  it("prioriza VERCEL_URL (hostname del propio deployment) con https", () => {
    clear();
    process.env.VERCEL_URL = "lucams-shop-abc-jullieth93s-projects.vercel.app";
    process.env.NEXT_PUBLIC_SITE_URL = "https://lucamsshop.com";
    expect(getTrustedSelfBaseUrl()).toBe("https://lucams-shop-abc-jullieth93s-projects.vercel.app");
  });

  it("respeta VERCEL_URL que ya trae protocolo", () => {
    clear();
    process.env.VERCEL_URL = "https://ya.con.protocolo";
    expect(getTrustedSelfBaseUrl()).toBe("https://ya.con.protocolo");
  });

  it("usa NEXT_PUBLIC_SITE_URL (sin trailing slash) si no hay VERCEL_URL", () => {
    clear();
    process.env.NEXT_PUBLIC_SITE_URL = "https://lucamsshop.com/";
    expect(getTrustedSelfBaseUrl()).toBe("https://lucamsshop.com");
  });

  it("cae a localhost:PORT en dev sin envs", () => {
    clear();
    process.env.PORT = "4321";
    expect(getTrustedSelfBaseUrl()).toBe("http://localhost:4321");
  });

  it("NUNCA deriva del Host del request (no acepta argumentos)", () => {
    clear();
    // Sin envs → localhost por defecto, jamás un host arbitrario.
    expect(getTrustedSelfBaseUrl()).toBe("http://localhost:3000");
  });
});

describe("getRequestOrigin", () => {
  afterEach(() => headerStore.clear());

  it("en PRODUCCIÓN ignora x-forwarded-host y usa el dominio canónico (anti-spoof de emails)", async () => {
    clear();
    process.env.VERCEL_ENV = "production";
    process.env.NEXT_PUBLIC_SITE_URL = "https://lucamsshop.com/";
    headerStore.set("x-forwarded-host", "evil.example.com");
    headerStore.set("x-forwarded-proto", "https");
    expect(await getRequestOrigin()).toBe("https://lucamsshop.com");
  });

  it("en producción SIN dominio canónico cae al header (no queda otra)", async () => {
    clear();
    process.env.VERCEL_ENV = "production";
    headerStore.set("x-forwarded-host", "lucams-shop-abc.vercel.app");
    headerStore.set("x-forwarded-proto", "https");
    expect(await getRequestOrigin()).toBe("https://lucams-shop-abc.vercel.app");
  });

  it("en PREVIEW deriva del header (el email apunta al deployment, no a prod)", async () => {
    clear();
    process.env.VERCEL_ENV = "preview";
    process.env.NEXT_PUBLIC_SITE_URL = "https://lucamsshop.com";
    headerStore.set("x-forwarded-host", "lucams-shop-pr123.vercel.app");
    headerStore.set("x-forwarded-proto", "https");
    expect(await getRequestOrigin()).toBe("https://lucams-shop-pr123.vercel.app");
  });

  it("en dev sin headers cae a localhost:3000", async () => {
    clear();
    expect(await getRequestOrigin()).toBe("http://localhost:3000");
  });
});
