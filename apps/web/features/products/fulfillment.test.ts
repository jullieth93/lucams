import { describe, expect, it } from "vitest";
import {
  hasStockForSale,
  netAvailableStock,
  requiresMadeToOrder,
  tracksPhysicalStock,
} from "./fulfillment";

describe("requiresMadeToOrder", () => {
  it.each([
    { personalizationKind: "PHOTO_PACK" },
    { isPersonalizable: true },
    { personalizationSchema: { letterSet: "full" } },
    { personalizationSchema: { letterSet: "vowels" } },
    { variants: [{ attributes: { variant: "name" } }] },
  ])("reconoce la familia de Estudio %j", (input) => {
    expect(requiresMadeToOrder(input)).toBe(true);
  });

  it("mantiene físico un producto estándar sin Estudio", () => {
    expect(
      requiresMadeToOrder({
        personalizationKind: "NONE",
        isPersonalizable: false,
        personalizationSchema: null,
        variants: [{ attributes: { quantity: 6 } }],
      }),
    ).toBe(false);
  });
});

describe("stock por modalidad", () => {
  it("MADE_TO_ORDER no depende del stock legado", () => {
    expect(tracksPhysicalStock("MADE_TO_ORDER")).toBe(false);
    expect(hasStockForSale("MADE_TO_ORDER", 0)).toBe(true);
  });

  it("PHYSICAL_STOCK conserva el control real y descuenta safetyStock", () => {
    expect(tracksPhysicalStock("PHYSICAL_STOCK")).toBe(true);
    expect(hasStockForSale("PHYSICAL_STOCK", 0)).toBe(false);
    expect(hasStockForSale("PHYSICAL_STOCK", 1)).toBe(true);
    expect(hasStockForSale("PHYSICAL_STOCK", 5, 2)).toBe(true);
    expect(hasStockForSale("PHYSICAL_STOCK", 5, 5)).toBe(false);
    expect(hasStockForSale("PHYSICAL_STOCK", 5, 8)).toBe(false);
    expect(hasStockForSale("MADE_TO_ORDER", 5, 5)).toBe(true);
  });

  it("el disponible neto descuenta la reserva sin quedar negativo", () => {
    expect(netAvailableStock(10, 2)).toBe(8);
    expect(netAvailableStock(5, 2)).toBe(3);
    expect(netAvailableStock(5, 5)).toBe(0);
    expect(netAvailableStock(2, 5)).toBe(0);
  });
});
