/* Unit — humanizeCarrierStatus (etiqueta humana del estado crudo del carrier). */

import { describe, expect, it } from "vitest";
import {
  buildShipmentEventDedupKey,
  friendlyCarrierEventLabel,
  humanizeCarrierStatus,
} from "./shipment-events";

describe("humanizeCarrierStatus", () => {
  it("EN BODEGA DESTINO → En bodega destino", () => {
    expect(humanizeCarrierStatus("EN BODEGA DESTINO")).toBe("En bodega destino");
  });
  it("conserva tildes y colapsa espacios", () => {
    expect(humanizeCarrierStatus("  MERCANCIA   RECOGIDA ")).toBe("Mercancia recogida");
    expect(humanizeCarrierStatus("DEVOLUCIÓN")).toBe("Devolución");
  });
  it("vacío → vacío (el caller cae a la etiqueta genérica)", () => {
    expect(humanizeCarrierStatus("   ")).toBe("");
  });
});

describe("buildShipmentEventDedupKey — GENERADA estable (caso LCM-2026-0004)", () => {
  it("GENERADA usa clave estable sin minuto (la guía se genera una sola vez por guía)", () => {
    const a = buildShipmentEventDedupKey({
      trackingNumber: "G1",
      carrierStatusRaw: "GENERADA",
      occurredAt: new Date("2026-11-04T01:24:35.000Z"), // nuestra creación vía API
    });
    const b = buildShipmentEventDedupKey({
      trackingNumber: "G1",
      carrierStatusRaw: "GENERADA",
      occurredAt: new Date("2026-11-04T11:07:14.000Z"), // el carrier la registra 10h después
    });
    expect(a).toBe(b);
    expect(a).toBe("G1|GENERADA");
  });
});

describe("friendlyCarrierEventLabel", () => {
  it("traduce los estados crudos conocidos a lenguaje de cliente", () => {
    expect(friendlyCarrierEventLabel("GENERADA")).toBe("Guía generada con la transportadora");
    expect(friendlyCarrierEventLabel("MERCANCIA RECOGIDA")).toBe(
      "Paquete recogido por la transportadora",
    );
    expect(friendlyCarrierEventLabel("EN BODEGA DESTINO")).toBe(
      "Llegó a la bodega de tu ciudad — pronto sale a reparto",
    );
    expect(friendlyCarrierEventLabel("EN REPARTO")).toBe("En reparto hacia tu dirección");
  });
  it("estado desconocido cae a humanización (no a la genérica)", () => {
    expect(friendlyCarrierEventLabel("EN AGENCIA LOCAL")).toBe("En agencia local");
  });
});
