/*
 * Resiliencia de cotización Aveonline (2026-08-08) — tests con fetch mockeado.
 *
 * Cubre las dos reglas introducidas tras el bug de producción "No pudimos
 * cotizar el envío" (que era un destino SIN cobertura reportado como fallo
 * transitorio):
 *
 *   1. all_failed (todas las transportadoras con numbererror≠"-0-") → devuelve
 *      [] (respuesta definitiva: la UI muestra "No encontramos transportadoras
 *      que cubran esa ciudad"). NO lanza.
 *   2. Fallo TRANSITORIO (red/timeout/HTTP) con cotización buena en caché →
 *      devuelve la cacheada con `estimated: true`. Sin caché → lanza.
 *
 * ORDEN DE TESTS IMPORTA: el circuit breaker de quote (threshold 5) y la caché
 * son estado de módulo. Los tests que disparan fallos de red van al final.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AveonlineProvider } from "./aveonline";
import type { ShipmentItem } from "./provider";

const AUTH_URL = "https://app.aveonline.co/api/comunes/v1.0/autenticarusuario.php";
const QUOTE_URL = "https://app.aveonline.co/api/nal/v1.0/generarGuiaTransporteNacional.php";

const items: ShipmentItem[] = [
  {
    productSlug: "fotoimanes-cuadrados",
    qty: 2,
    weightGrams: 120,
    widthCm: 10,
    heightCm: 10,
    depthCm: 2,
    declaredValueCop: 5_000_000,
  },
];

const ORIGIN = { city: "Bogotá", department: "Cundinamarca" };

const authOk = () =>
  new Response(
    JSON.stringify({
      status: "ok",
      token: "token-test",
      cuentas: [{ usuarios: [{ id: 15289 }] }],
    }),
    { status: 200 },
  );

const carrierOk = (cod: string, nombre: string, total: number) => ({
  numbererror: "-0-",
  dataerror: "",
  codTransportadora: cod,
  nombreTransportadora: nombre,
  total,
  diasentrega: 2,
});

const carrierFail = (nombre: string) => ({
  numbererror: "999",
  dataerror: "Se ha presentado un problema con el calculo… trayecto no valido…",
  codTransportadora: "",
  nombreTransportadora: nombre,
  total: 0,
  diasentrega: "000",
});

const quoteResponse = (rows: Array<Record<string, unknown>>) =>
  new Response(
    JSON.stringify({ status: "ok", message: "cotizaciones encontradas", cotizaciones: rows }),
    {
      status: 200,
    },
  );

function stubFetch(handler: (url: string) => Response | never) {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => handler(String(input)));
}

describe("AveonlineProvider.quote — resiliencia (mock fetch)", () => {
  beforeAll(() => {
    process.env.AVEONLINE_USUARIO = "test-user";
    process.env.AVEONLINE_CLAVE = "test-pass";
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("all_failed (todas 999) → devuelve [] sin lanzar (sin cobertura = definitivo)", async () => {
    stubFetch((url) => {
      if (url === AUTH_URL) return authOk();
      if (url === QUOTE_URL) return quoteResponse([carrierFail("ENVIA"), carrierFail("TCC SA")]);
      throw new Error(`URL inesperada: ${url}`);
    });
    const provider = new AveonlineProvider();
    const quotes = await provider.quote({
      origin: ORIGIN,
      destination: { city: "Narnia", department: "Cundinamarca" },
      items,
      contraentrega: false,
    });
    expect(quotes).toEqual([]);
  });

  it("cotización viva exitosa: devuelve las opciones SIN flag estimated", async () => {
    stubFetch((url) => {
      if (url === AUTH_URL) return authOk();
      if (url === QUOTE_URL)
        return quoteResponse([carrierOk("29", "ENVIA", 12_500), carrierFail("TCC SA")]);
      throw new Error(`URL inesperada: ${url}`);
    });
    const provider = new AveonlineProvider();
    const quotes = await provider.quote({
      origin: ORIGIN,
      destination: { city: "Medellín", department: "Antioquia" },
      items,
      contraentrega: false,
    });
    expect(quotes).toHaveLength(1);
    expect(quotes[0]).toMatchObject({ carrierName: "ENVIA", fleteCop: 1_250_000 });
    expect(quotes[0].estimated).toBeUndefined();
  });

  it("fallo transitorio (red) CON caché de la misma clave → sirve la cacheada con estimated:true", async () => {
    // La clave Medellín quedó cacheada por el test anterior (misma ruta+paquete).
    stubFetch(() => {
      throw new TypeError("fetch failed");
    });
    const provider = new AveonlineProvider();
    const quotes = await provider.quote({
      origin: ORIGIN,
      destination: { city: "Medellín", department: "Antioquia" },
      items,
      contraentrega: false,
    });
    expect(quotes).toHaveLength(1);
    expect(quotes[0].estimated).toBe(true);
    expect(quotes[0].carrierName).toBe("ENVIA");
  });

  it("fallo transitorio SIN caché (clave distinta) → lanza", async () => {
    stubFetch(() => {
      throw new TypeError("fetch failed");
    });
    const provider = new AveonlineProvider();
    await expect(
      provider.quote({
        origin: ORIGIN,
        destination: { city: "Cali", department: "Valle del Cauca" },
        items,
        contraentrega: false,
      }),
    ).rejects.toThrow();
  });

  it("la caché expirada (> TTL) NO se sirve: el fallo transitorio lanza", async () => {
    // Espía Date.now (NO fake timers: el sleep del backoff de withRetry usa
    // setTimeout real y colgaría el test). 11 min > QUOTE_CACHE_TTL_MS (10 min)
    // → la entrada de Medellín expiró; el token cache de auth (1 h) sigue vivo.
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 11 * 60_000);
    try {
      stubFetch(() => {
        throw new TypeError("fetch failed");
      });
      const provider = new AveonlineProvider();
      await expect(
        provider.quote({
          origin: ORIGIN,
          destination: { city: "Medellín", department: "Antioquia" },
          items,
          contraentrega: false,
        }),
      ).rejects.toThrow();
    } finally {
      nowSpy.mockRestore();
    }
  });
});
