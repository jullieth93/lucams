/*
 * Copy customer-safe de los errores de Orders (2026-09-29):
 *  - OrderUnavailableItemsError nombra el/los productos retirados.
 *  - InsufficientStockError expone customerMessage() con el nombre del
 *    producto agotado (el message técnico queda para logs).
 *  - OrderAlreadyPaidError (carrera TOCTOU de reconciliación) carga
 *    orderId/number para que finalizeCheckout arme el redirect seguro.
 */

import { describe, expect, it } from "vitest";
import {
  InsufficientStockError,
  OrderAlreadyPaidError,
  OrderUnavailableItemsError,
} from "./errors";

describe("OrderUnavailableItemsError", () => {
  it("un solo producto: lo nombra entre comillas", () => {
    const err = new OrderUnavailableItemsError([
      { variantId: "v1", sku: "IMN-DEFAULT", name: "Imán Nevera" },
    ]);
    expect(err.message).toBe(
      "«Imán Nevera» ya no está disponible. Revisa tu carrito y confirma de nuevo.",
    );
    expect(err.items).toHaveLength(1);
  });

  it("varios productos: los lista en un solo mensaje", () => {
    const err = new OrderUnavailableItemsError([
      { variantId: "v1", sku: "IMN-DEFAULT", name: "Imán Nevera" },
      { variantId: "v2", sku: "CAL-DEFAULT", name: "Calendario 2027" },
    ]);
    expect(err.message).toBe(
      "Estos productos ya no están disponibles: Imán Nevera, Calendario 2027. " +
        "Revisa tu carrito y confirma de nuevo.",
    );
  });

  it("dedupúplica el nombre cuando dos variantes del mismo producto caen", () => {
    const err = new OrderUnavailableItemsError([
      { variantId: "v1", sku: "IMN-6", name: "Imán Nevera (Set 6)" },
      { variantId: "v2", sku: "IMN-12", name: "Imán Nevera (Set 6)" },
    ]);
    expect(err.message).toContain("«Imán Nevera (Set 6)»");
    expect(err.message).not.toContain("Estos productos");
  });

  it("sin nombres (caller legacy): fallback genérico", () => {
    const err = new OrderUnavailableItemsError([{ variantId: "v1", sku: "IMN-DEFAULT" }]);
    expect(err.message).toBe(
      "Un producto de tu carrito ya no está disponible. Revisa tu carrito y confirma de nuevo.",
    );
  });
});

describe("InsufficientStockError", () => {
  it("customerMessage nombra el producto y las unidades que quedan", () => {
    const err = new InsufficientStockError("v1", 5, 3, "Imán Nevera");
    expect(err.customerMessage()).toBe(
      "Solo quedan 3 unidades de «Imán Nevera». Ajusta la cantidad en tu carrito.",
    );
  });

  it("singular cuando queda 1 unidad", () => {
    const err = new InsufficientStockError("v1", 2, 1, "Imán Nevera");
    expect(err.customerMessage()).toContain("Solo quedan 1 unidad de «Imán Nevera»");
  });

  it("stock 0: copy de agotado", () => {
    const err = new InsufficientStockError("v1", 2, 0, "Imán Nevera");
    expect(err.customerMessage()).toBe(
      "«Imán Nevera» se agotó. Revisa tu carrito y confirma de nuevo.",
    );
  });

  it("sin nombre de producto: customerMessage es null (caller usa su fallback)", () => {
    const err = new InsufficientStockError("v1", 5);
    expect(err.customerMessage()).toBeNull();
    // El message técnico conserva el variantId para logs.
    expect(err.message).toContain("v1");
  });
});

describe("OrderAlreadyPaidError", () => {
  it("carga orderId + orderNumber y no expone internals pensados para el cliente", () => {
    const err = new OrderAlreadyPaidError("ord_1", "LCM-2026-0042");
    expect(err.orderId).toBe("ord_1");
    expect(err.orderNumber).toBe("LCM-2026-0042");
    expect(err.name).toBe("OrderAlreadyPaidError");
    expect(err.message).toContain("LCM-2026-0042");
  });
});
