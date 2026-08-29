/*
 * isPublicSettingKey — filtro de privacidad del endpoint público
 * /api/cms/settings. Auditoría 2026-08-24 (C-2): es una ALLOWLIST explícita
 * (fail-closed) — una clave nueva o desconocida es PRIVADA por defecto y solo
 * sale por HTTP público si se agrega a PUBLIC_SETTING_KEYS en lib/cms.ts.
 * Las claves PICKUP_* (dirección/teléfono de recogida — posible casa del
 * negocio, certificación 2026-07-29 2ª pasada), BUSINESS_NIT y ALERT_EMAIL
 * jamás salen por HTTP público.
 */

import { describe, it, expect } from "vitest";
import { isPublicSettingKey } from "./cms";

describe("isPublicSettingKey (allowlist)", () => {
  it("oculta TODAS las claves PICKUP_* (incluye las futuras, por no estar en la lista)", () => {
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

  it("oculta BUSINESS_NIT y ALERT_EMAIL (solo se leen server-side)", () => {
    expect(isPublicSettingKey("BUSINESS_NIT")).toBe(false);
    expect(isPublicSettingKey("ALERT_EMAIL")).toBe(false);
  });

  it("fail-closed: cualquier clave NUEVA/desconocida es privada por defecto", () => {
    const futureKeys = [
      "STRIPE_SECRET_KEY", // setting sensible futuro — el defecto debe ser NO exponer
      "INTERNAL_API_TOKEN",
      "LEGAL_NIT_PUBLICO", // ni siquiera existen en el sitio hoy
      "WHATSAPP_NUMBER", // la clave real es WA_NUMBER
      "",
    ];
    for (const key of futureKeys) {
      expect(isPublicSettingKey(key)).toBe(false);
    }
  });

  it("expone los settings que el sitio público sí consume", () => {
    const publicKeys = [
      "CONTACT_EMAIL",
      "SECURITY_EMAIL",
      "BUSINESS_HOURS",
      "BUSINESS_LOCATION",
      "APP_NAME",
      "SITE_URL",
      "COPYRIGHT_YEAR",
      "COPYRIGHT_TAGLINE",
      "GOVT_SIC_URL",
      "SOCIAL_INSTAGRAM_URL",
      "SOCIAL_INSTAGRAM_ENABLED",
      "SOCIAL_TIKTOK_URL",
      "SOCIAL_TIKTOK_ENABLED",
      "SOCIAL_FACEBOOK_URL",
      "SOCIAL_FACEBOOK_ENABLED",
      "WA_NUMBER",
      "WA_MSG_PRODUCT",
      "WA_MSG_PERSONALIZE",
      "WA_MSG_SUPPORT",
      "WA_MSG_SUPPORT_SUBJECT",
      "WA_MSG_ORDER",
      "WA_MSG_QUOTE",
      "WA_MSG_WHOLESALE",
      "COD_ENABLED",
      "PRODUCTION_DAYS_DEFAULT",
      "DELIVERY_DAYS_ESTIMATE",
      "DELIVERY_COVERAGE_COUNT",
      "home.hero.cta-primary.href",
      "home.hero.cta-secondary.href",
    ];
    for (const key of publicKeys) {
      expect(isPublicSettingKey(key)).toBe(true);
    }
  });
});
