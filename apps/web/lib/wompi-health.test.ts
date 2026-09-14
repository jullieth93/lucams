/*
 * probeWompiHealth (lib/wompi.ts) — sonda real de Wompi compartida por
 * /api/health/wompi y el panel admin (CF-03).
 *
 * Fija el contrato que el panel y el agregador consumen:
 *  - Sin las 4 llaves → "skipped" (no es un fallo: modo catálogo) y NO hay fetch.
 *  - El ambiente declarado (WOMPI_ENV) decide el HOST sondeado: sandbox jamás
 *    pega contra production.wompi.co y viceversa (② del encargo N-03).
 *  - HTTP no-ok / error de red → "fail" con detalle estático (la URL lleva la
 *    llave pública embebida: nunca se arrastra al detalle).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { probeWompiHealth } from "./wompi";

const ENV_KEYS = [
  "WOMPI_PUBLIC_KEY",
  "WOMPI_PRIVATE_KEY",
  "WOMPI_EVENTS_SECRET",
  "WOMPI_INTEGRITY_SECRET",
  "WOMPI_ENV",
] as const;

function stubWompiEnv(env: "sandbox" | "production") {
  vi.stubEnv("WOMPI_PUBLIC_KEY", env === "production" ? "pub_prod_abc" : "pub_test_abc");
  vi.stubEnv("WOMPI_PRIVATE_KEY", env === "production" ? "prv_prod_abc" : "prv_test_abc");
  vi.stubEnv("WOMPI_EVENTS_SECRET", "test_events_abc");
  vi.stubEnv("WOMPI_INTEGRITY_SECRET", "test_integrity_abc");
  vi.stubEnv("WOMPI_ENV", env);
}

function mockFetchOk() {
  return vi.fn(
    async (_url: string | URL) =>
      new Response(JSON.stringify({ data: { id: 1 } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  );
}

beforeEach(() => {
  for (const k of ENV_KEYS) vi.stubEnv(k, "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("probeWompiHealth", () => {
  it("sin las 4 llaves → skipped SIN llamar a la red (no es una caída)", async () => {
    const fetchFn = vi.fn();
    vi.stubGlobal("fetch", fetchFn);

    const r = await probeWompiHealth();
    expect(r.status).toBe("skipped");
    expect(r.latencyMs).toBe(0);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("config sandbox → pega contra sandbox.wompi.co y declara env sandbox", async () => {
    stubWompiEnv("sandbox");
    const fetchFn = mockFetchOk();
    vi.stubGlobal("fetch", fetchFn);

    const r = await probeWompiHealth();
    expect(r.status).toBe("ok");
    expect(r.env).toBe("sandbox");
    const url = String(fetchFn.mock.calls[0][0]);
    expect(url).toBe("https://sandbox.wompi.co/v1/merchants/pub_test_abc");
    expect(url).not.toContain("production.wompi.co");
  });

  it("config production → pega contra production.wompi.co y declara env production", async () => {
    stubWompiEnv("production");
    const fetchFn = mockFetchOk();
    vi.stubGlobal("fetch", fetchFn);

    const r = await probeWompiHealth();
    expect(r.status).toBe("ok");
    expect(r.env).toBe("production");
    expect(String(fetchFn.mock.calls[0][0])).toBe(
      "https://production.wompi.co/v1/merchants/pub_prod_abc",
    );
  });

  it("Wompi responde HTTP no-ok → fail con el status, conservando el env", async () => {
    stubWompiEnv("production");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 502 })),
    );

    const r = await probeWompiHealth();
    expect(r.status).toBe("fail");
    expect(r.env).toBe("production");
    expect(r.detail).toContain("HTTP 502");
  });

  it("error de red → fail con detalle ESTÁTICO (sin arrastrar la URL con la llave)", async () => {
    stubWompiEnv("sandbox");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("getaddrinfo ENOTFOUND sandbox.wompi.co/v1/merchants/pub_test_abc");
      }),
    );

    const r = await probeWompiHealth();
    expect(r.status).toBe("fail");
    expect(r.detail).toBe("Wompi healthcheck falló (timeout o error de red).");
    expect(r.detail).not.toContain("pub_test_abc");
  });
});
