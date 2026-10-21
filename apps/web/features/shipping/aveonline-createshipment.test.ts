/*
 * createShipment — relacion_envios por carrier (doc oficial generacionGuia,
 * verificada 2026-10-20: «Todas las transportadoras a excepción de Envia (29)
 * deben tener este campo en 1 para funcionar») + creación de la relación de
 * envíos por API tras generar la guía.
 *
 * Reglas bajo prueba:
 *   1. Envía NUNCA declara relación ("0") ni llama relacionEnvios.
 *   2. Otro carrier con guía REAL (doble gate de facturación abierto) →
 *      relacion_envios "1" + POST relacionEnvios inmediato con la guía.
 *   3. En simulación (gate cerrado) NO se declara relación para ningún carrier
 *      (la guía no entra a la red logística; no hay nada que manifestar).
 *   4. Si relacionEnvios falla, la guía igual se devuelve OK (best-effort).
 *
 * Mismo patrón de fetch mockeado que aveonline-quote-resilience.test.ts; el
 * discriminat aquí es el `tipo` del body (mismo endpoint PHP para todo).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  unstable_cache:
    (fn: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      fn(...args),
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}));

const SETTINGS: Record<string, string> = {
  PICKUP_CITY: "Bogotá",
  PICKUP_DEPARTMENT: "Cundinamarca",
  PICKUP_ADDRESS: "Cra 1 # 2-34",
  PICKUP_PHONE: "3001234567",
  PICKUP_CONTACT_NAME: "Lucams",
  BUSINESS_NIT: "900123456",
};
vi.mock("@/lib/cms", () => ({
  getSettingValue: async (key: string, fallback = "") => SETTINGS[key] ?? fallback,
}));

import { AveonlineProvider } from "./aveonline";
import type { ShipmentItem } from "./provider";

const BASE = "https://app.aveonline.co/api";
const AUTH_URL = `${BASE}/comunes/v1.0/autenticarusuario.php`;
const NAL_URL = `${BASE}/nal/v1.0/generarGuiaTransporteNacional.php`;
const AGENTES_URL = `${BASE}/comunes/v1.0/agentes.php`;

const ITEMS: ShipmentItem[] = [
  {
    productSlug: "separadores-alargados",
    qty: 1,
    weightGrams: 300,
    widthCm: 15,
    heightCm: 4,
    depthCm: 2,
    declaredValueCop: 4_000_000,
  },
];

const PARAMS = {
  quoteId: undefined as string | undefined,
  pickup: {
    city: "",
    department: "",
    address: "",
    phone: "",
    contactName: "",
  },
  delivery: {
    city: "Medellín",
    department: "Antioquia",
    address: "Calle 1 # 2-3",
    phone: "3007654321",
    contactName: "Cliente Prueba",
    email: "cliente@test.co",
  },
  items: ITEMS,
  contraentrega: false,
  orderId: "ord-test-1",
};

type FetchCall = { url: string; tipo?: string; body?: Record<string, unknown> };

function stubFetch(calls: FetchCall[]) {
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      calls.push({ url, tipo: typeof body.tipo === "string" ? body.tipo : undefined, body });
      if (url === AUTH_URL) {
        return new Response(
          JSON.stringify({
            status: "ok",
            token: "token-test",
            cuentas: [{ usuarios: [{ id: 43562 }] }],
          }),
          { status: 200 },
        );
      }
      if (url === AGENTES_URL) {
        return new Response(
          JSON.stringify({ status: "ok", agentes: [{ id: 20362, ciudad: "BOGOTA" }] }),
          { status: 200 },
        );
      }
      if (url === NAL_URL && body.tipo === "generarGuia2") {
        return new Response(
          JSON.stringify({
            status: "ok",
            resultado: {
              guia: {
                numguia: "123456789",
                rutaguia: "https://app.aveonline.co/guia.pdf",
                rutasticker: "https://app.aveonline.co/sticker.pdf",
                transportadora: "TCC SA",
              },
            },
          }),
          { status: 200 },
        );
      }
      if (url === NAL_URL && body.tipo === "relacionEnvios") {
        return new Response(JSON.stringify({ status: "ok", relacionenvio: "555" }), {
          status: 200,
        });
      }
      throw new Error(`URL/tipo inesperado: ${url} tipo=${String(body.tipo)}`);
    },
  );
}

describe("AveonlineProvider.createShipment — relacion_envios por carrier", () => {
  beforeAll(() => {
    process.env.AVEONLINE_USUARIO = "test-user";
    process.env.AVEONLINE_CLAVE = "test-pass";
  });

  beforeEach(() => {
    delete process.env.AVEONLINE_GENERATE_REAL;
    delete process.env.AVEONLINE_FORCE_BILLING;
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("Envía (guía real): relacion_envios '0' y NUNCA llama relacionEnvios", async () => {
    process.env.AVEONLINE_GENERATE_REAL = "true";
    process.env.AVEONLINE_FORCE_BILLING = "true";
    const calls: FetchCall[] = [];
    stubFetch(calls);

    const provider = new AveonlineProvider();
    const res = await provider.createShipment({ ...PARAMS, carrier: "envia", quoteId: "29" });

    expect(res.trackingNumber).toBe("123456789");
    const guia = calls.find((c) => c.tipo === "generarGuia2");
    expect(guia?.body?.bloquegenerarguia).toBe("0"); // gate abierto → guía real
    expect(guia?.body?.relacion_envios).toBe("0");
    expect(calls.some((c) => c.tipo === "relacionEnvios")).toBe(false);
  });

  it("TCC (guía real): relacion_envios '1' y crea la relación por API con la guía", async () => {
    process.env.AVEONLINE_GENERATE_REAL = "true";
    process.env.AVEONLINE_FORCE_BILLING = "true";
    const calls: FetchCall[] = [];
    stubFetch(calls);

    const provider = new AveonlineProvider();
    await provider.createShipment({ ...PARAMS, carrier: "tcc-sa", quoteId: "1010" });

    const guia = calls.find((c) => c.tipo === "generarGuia2");
    expect(guia?.body?.relacion_envios).toBe("1");
    const relacion = calls.find((c) => c.tipo === "relacionEnvios");
    expect(relacion).toBeTruthy();
    expect(relacion?.body?.transportadora).toBe("1010");
    expect(relacion?.body?.guias).toBe("123456789");
  });

  it("TCC en SIMULACIÓN (gate cerrado): relacion_envios '0' y sin llamada de relación", async () => {
    const calls: FetchCall[] = [];
    stubFetch(calls);

    const provider = new AveonlineProvider();
    await provider.createShipment({ ...PARAMS, carrier: "tcc-sa", quoteId: "1010" });

    const guia = calls.find((c) => c.tipo === "generarGuia2");
    expect(guia?.body?.bloquegenerarguia).toBe("1"); // default seguro
    expect(guia?.body?.relacion_envios).toBe("0");
    expect(calls.some((c) => c.tipo === "relacionEnvios")).toBe(false);
  });

  it("barrio y notas de entrega viajan a la guía (dsbarrio/dscom — antes vacíos)", async () => {
    const calls: FetchCall[] = [];
    stubFetch(calls);

    const provider = new AveonlineProvider();
    await provider.createShipment({
      ...PARAMS,
      carrier: "envia",
      quoteId: "29",
      delivery: {
        ...PARAMS.delivery,
        neighborhood: "La Candelaria",
        notes: "Portería norte, preguntar por recepción",
      },
    });

    const guia = calls.find((c) => c.tipo === "generarGuia2");
    expect(guia?.body?.dsbarrio).toBe("La Candelaria");
    expect(guia?.body?.dscom).toBe("Portería norte, preguntar por recepción");
  });

  it("si relacionEnvios falla, la guía igual se entrega OK (best-effort, logueado)", async () => {
    process.env.AVEONLINE_GENERATE_REAL = "true";
    process.env.AVEONLINE_FORCE_BILLING = "true";
    const calls: FetchCall[] = [];
    stubFetch(calls);
    // Sabotear solo la relación:
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (body.tipo === "relacionEnvios") {
        return new Response(JSON.stringify({ status: "error", message: "boom" }), {
          status: 200,
        });
      }
      return realFetch(input, init);
    });

    const provider = new AveonlineProvider();
    const res = await provider.createShipment({ ...PARAMS, carrier: "tcc-sa", quoteId: "1010" });
    expect(res.trackingNumber).toBe("123456789");
  });
});
