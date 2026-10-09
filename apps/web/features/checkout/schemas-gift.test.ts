/*
 * Unit tests de GiftSchema (FLUJO REGALO — 2026-10-05): la validación zod del
 * bloque "¿Lo recibe otra persona?" del checkout. saveDatosAction solo la
 * aplica cuando el toggle viene on; acá se ejerce el schema aislado.
 */

import { describe, expect, it } from "vitest";
import { GiftSchema } from "./schemas";

const VALID = {
  recipientName: "Camila Torres",
  recipientPhone: "3109998877",
  isGift: true,
  giftMessage: "¡Feliz cumple!",
};

describe("GiftSchema", () => {
  it("happy path: destinatario válido + regalo con mensaje", () => {
    const r = GiftSchema.safeParse(VALID);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual(VALID);
  });

  it("regalo sin mensaje: válido (el mensaje es opcional)", () => {
    const { giftMessage: _omit, ...sinMensaje } = VALID;
    expect(GiftSchema.safeParse(sinMensaje).success).toBe(true);
  });

  it("destinatario sin marcar regalo: válido (isGift=false)", () => {
    const r = GiftSchema.safeParse({ ...VALID, isGift: false, giftMessage: undefined });
    expect(r.success).toBe(true);
  });

  it("nombre con números: inválido (misma regla que el contacto del comprador)", () => {
    expect(GiftSchema.safeParse({ ...VALID, recipientName: "Camila 123" }).success).toBe(false);
  });

  it("nombre vacío: inválido (requerido cuando el toggle está on)", () => {
    expect(GiftSchema.safeParse({ ...VALID, recipientName: "" }).success).toBe(false);
  });

  it("teléfono que no es móvil CO de 10 dígitos: inválido", () => {
    expect(GiftSchema.safeParse({ ...VALID, recipientPhone: "12345" }).success).toBe(false);
    expect(GiftSchema.safeParse({ ...VALID, recipientPhone: "2109998877" }).success).toBe(false);
  });

  it("mensaje de más de 300 caracteres: inválido", () => {
    expect(GiftSchema.safeParse({ ...VALID, giftMessage: "x".repeat(301) }).success).toBe(false);
  });
});
