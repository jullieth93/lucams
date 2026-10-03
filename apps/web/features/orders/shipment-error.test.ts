/*
 * Unit tests del registro sanitizado del intento fallido de guía (Paquete G,
 * Order.shipmentLastError): construcción sin PII, parse defensivo del JSON
 * persistido y sugerencias operativas según el mensaje de la transportadora
 * (docs/INTEGRATIONS_AVEONLINE.md §4.4).
 */

import { describe, expect, it } from "vitest";
import {
  buildShipmentLastError,
  parseShipmentLastError,
  suggestShipmentFailureCause,
} from "./shipment-error";

describe("buildShipmentLastError", () => {
  it("persiste el mensaje de la transportadora con shape completo", () => {
    const rec = buildShipmentLastError({
      err: new Error("Aveonline createShipment falló: Guía Anulada automáticamente"),
      carrier: "coordinadora",
      destination: { city: "Bogotá", department: "Cundinamarca" },
      timeout: false,
      now: new Date("2026-10-02T13:00:00.000Z"),
    });
    expect(rec).toEqual({
      message: "Aveonline createShipment falló: Guía Anulada automáticamente",
      at: "2026-10-02T13:00:00.000Z",
      carrier: "coordinadora",
      destination: { city: "Bogotá", department: "Cundinamarca" },
      timeout: false,
    });
  });

  it("sanitiza PII embebida en el mensaje (emails y teléfonos enmascarados)", () => {
    const rec = buildShipmentLastError({
      err: new Error("falló para cliente@correo.com tel 300 887 3826"),
      carrier: null,
      destination: {},
      timeout: false,
    });
    expect(rec.message).not.toContain("cliente@correo.com");
    expect(rec.message).not.toContain("300 887 3826");
    expect(rec.message).toContain("[EMAIL]");
    expect(rec.message).toContain("[PHONE]");
  });

  it("acota mensajes gigantes (respuesta cruda) a 500 chars", () => {
    const rec = buildShipmentLastError({
      err: new Error("x".repeat(2_000)),
      carrier: null,
      destination: {},
      timeout: false,
    });
    expect(rec.message).toHaveLength(500);
  });

  it("acepta errores no-Error (string) sin romper", () => {
    const rec = buildShipmentLastError({
      err: "falla rara",
      carrier: null,
      destination: {},
      timeout: true,
    });
    expect(rec.message).toBe("falla rara");
    expect(rec.timeout).toBe(true);
  });
});

describe("parseShipmentLastError", () => {
  it("round-trip: lo que construye build, lo parsea", () => {
    const rec = buildShipmentLastError({
      err: new Error("Destino no existe"),
      carrier: "tcc-sa",
      destination: { city: "Usme" },
      timeout: false,
    });
    expect(parseShipmentLastError(JSON.parse(JSON.stringify(rec)))).toEqual(rec);
  });

  it("basura persistida → null (no se muestra nada)", () => {
    expect(parseShipmentLastError(null)).toBeNull();
    expect(parseShipmentLastError("string")).toBeNull();
    expect(parseShipmentLastError([1, 2])).toBeNull();
    expect(parseShipmentLastError({})).toBeNull();
    expect(parseShipmentLastError({ message: 42 })).toBeNull();
  });
});

describe("suggestShipmentFailureCause", () => {
  const base = { at: "2026-10-02T13:00:00.000Z", carrier: null, destination: {} };

  it("'Guía Anulada automáticamente' → sugiere cobertura/cuenta demo", () => {
    const s = suggestShipmentFailureCause({
      ...base,
      timeout: false,
      message: "Aveonline createShipment falló: Guía Anulada automáticamente",
    });
    expect(s).toMatch(/cobertura|demo/i);
  });

  it("timeout → advierte verificar en el panel ANTES de reintentar (anti doble guía)", () => {
    const s = suggestShipmentFailureCause({ ...base, timeout: true, message: "timeout 20s" });
    expect(s).toContain("duplicada");
  });

  it("errores catalogados: destino/origen/credenciales/productos", () => {
    expect(
      suggestShipmentFailureCause({ ...base, timeout: false, message: "Destino no existe" }),
    ).toContain("destino");
    expect(
      suggestShipmentFailureCause({ ...base, timeout: false, message: "Origen no existe" }),
    ).toContain("PICKUP_CITY");
    expect(
      suggestShipmentFailureCause({ ...base, timeout: false, message: "credenciales incorrectas" }),
    ).toContain("Aveonline");
    expect(
      suggestShipmentFailureCause({
        ...base,
        timeout: false,
        message: "no se encontraron productos",
      }),
    ).toContain("empaque");
  });

  it("mensaje desconocido → remite a la tabla de errores del doc", () => {
    const s = suggestShipmentFailureCause({ ...base, timeout: false, message: "algo exótico" });
    expect(s).toContain("INTEGRATIONS_AVEONLINE");
  });
});
