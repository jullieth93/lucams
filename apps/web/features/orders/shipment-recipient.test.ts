/*
 * Unit tests de resolveShipmentRecipient (FLUJO REGALO — 2026-10-05):
 * la guía de la transportadora va a nombre/teléfono del DESTINATARIO cuando el
 * pedido lo tiene ("compro yo, lo recibe otra persona"); sin destinatario, al
 * contacto del comprador (comportamiento histórico). Función pura, sin mocks.
 */

import { describe, expect, it } from "vitest";
import { resolveShipmentRecipient } from "./shipment-recipient";

const SHIP = { fullName: "Comprador Uno", phone: "3001112233" };

describe("resolveShipmentRecipient", () => {
  it("sin destinatario (null): usa el contacto del comprador", () => {
    const r = resolveShipmentRecipient({ recipientName: null, recipientPhone: null }, SHIP);
    expect(r).toEqual({ contactName: "Comprador Uno", phone: "3001112233" });
  });

  it("con destinatario: la guía va a su nombre y teléfono", () => {
    const r = resolveShipmentRecipient(
      { recipientName: "Camila Torres", recipientPhone: "3109998877" },
      SHIP,
    );
    expect(r).toEqual({ contactName: "Camila Torres", phone: "3109998877" });
  });

  it("destinatario con solo espacios se trata como ausente (state manipulado)", () => {
    const r = resolveShipmentRecipient({ recipientName: "   ", recipientPhone: " " }, SHIP);
    expect(r).toEqual({ contactName: "Comprador Uno", phone: "3001112233" });
  });

  it("destinatario parcial: cada campo cae a su propio fallback", () => {
    const r = resolveShipmentRecipient(
      { recipientName: "Camila Torres", recipientPhone: null },
      SHIP,
    );
    expect(r).toEqual({ contactName: "Camila Torres", phone: "3001112233" });
  });
});
