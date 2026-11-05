/* Unit — humanizeCarrierStatus (etiqueta humana del estado crudo del carrier). */

import { describe, expect, it } from "vitest";
import { humanizeCarrierStatus } from "./shipment-events";

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
