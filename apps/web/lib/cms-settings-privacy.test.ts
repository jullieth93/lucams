/*
 * isPublicSettingKey — filtro de privacidad del endpoint público
 * /api/cms/settings (certificación 2026-07-29, 2ª pasada): las claves
 * PICKUP_* (dirección/teléfono/contacto de recogida — posible casa del
 * negocio) y BUSINESS_NIT jamás salen por HTTP público.
 */

import { describe, it, expect } from "vitest";
import { isPublicSettingKey } from "./cms";

describe("isPublicSettingKey", () => {
  it("oculta TODAS las claves PICKUP_* (incluye las futuras, por prefijo)", () => {
    const pickupKeys = [
      "PICKUP_ADDRESS",
      "PICKUP_PHONE",
      "PICKUP_CONTACT_NAME",
      "PICKUP_CITY",
      "PICKUP_DEPARTMENT",
      "PICKUP_BARRIO", // futura, mencionada en features/shipping/aveonline.ts
    ];
    for (const key of pickupKeys) {
      expect(isPublicSettingKey(key)).toBe(false);
    }
  });

  it("oculta BUSINESS_NIT (solo la usa la guía Aveonline server-side)", () => {
    expect(isPublicSettingKey("BUSINESS_NIT")).toBe(false);
  });

  it("expone los settings que el sitio público sí necesita", () => {
    const publicKeys = [
      "CONTACT_EMAIL",
      "CONTACT_PHONE",
      "WHATSAPP_NUMBER",
      "BUSINESS_HOURS",
      "SOCIAL_INSTAGRAM",
      "COMMERCE_CURRENCY",
      "LEGAL_NIT_PUBLICO", // si algún día se exhibe un NIT público, sería otra clave
    ];
    for (const key of publicKeys) {
      expect(isPublicSettingKey(key)).toBe(true);
    }
  });
});
