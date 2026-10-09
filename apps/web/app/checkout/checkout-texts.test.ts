/*
 * Tests de resolveLucamsPromise (checkout-texts.ts): la promesa "Envío
 * Lucam's" se resuelve con los tokens {{cutoff}} / {{days}} / {{s}} y se lee
 * IDÉNTICA en el selector de envío (/checkout/envio) y en el resumen del paso
 * de pago (/checkout/pago). El copy debe ser fiel a la regla real de
 * lib/delivery-estimate.ts (producción a mano + hora de corte, entrega el
 * mismo día del despacho).
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_CHECKOUT_TEXTS, resolveLucamsPromise } from "./checkout-texts";

describe("resolveLucamsPromise", () => {
  it("deliveryDays = 0 → entrega hoy con la hora de corte, sin tokens", () => {
    const text = resolveLucamsPromise(DEFAULT_CHECKOUT_TEXTS.shipping, 0, 12);
    expect(text).toContain("hoy");
    expect(text).toContain("12:00");
    expect(text).not.toContain("{{");
  });

  it("deliveryDays = 1 → singular; > 1 → plural; siempre sin tokens", () => {
    const one = resolveLucamsPromise(DEFAULT_CHECKOUT_TEXTS.shipping, 1, 12);
    expect(one).toContain("1 día hábil");
    expect(one).not.toContain("1 días");
    const many = resolveLucamsPromise(DEFAULT_CHECKOUT_TEXTS.shipping, 3, 12);
    expect(many).toContain("3 días hábiles");
    for (const text of [one, many]) expect(text).not.toContain("{{");
  });

  it("el cutoff de un dígito se muestra con cero a la izquierda", () => {
    const texts = {
      ...DEFAULT_CHECKOUT_TEXTS.shipping,
      lucamsToday: "Pedido antes de las {{cutoff}}:00",
    };
    expect(resolveLucamsPromise(texts, 0, 9)).toBe("Pedido antes de las 09:00");
  });

  it("plantillas CMS antiguas con solo {{days}} siguen funcionando", () => {
    const texts = {
      ...DEFAULT_CHECKOUT_TEXTS.shipping,
      lucamsDays: "Entrega en {{days}} día(s) hábil(es)",
    };
    expect(resolveLucamsPromise(texts, 2, 12)).toBe("Entrega en 2 día(s) hábil(es)");
  });
});
