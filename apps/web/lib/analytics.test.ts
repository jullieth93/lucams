// @vitest-environment jsdom
/*
 * Test de lib/analytics.ts (E09 — GA4).
 *
 * El módulo lee NEXT_PUBLIC_GA_MEASUREMENT_ID al importarse (const de
 * módulo), así que cada escenario re-importa con vi.resetModules() y la
 * env fijada ANTES del import.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { acceptAllPreferences, rejectAllPreferences } from "./cookie-consent";
import { writeClientCookiePreferences } from "./cookie-consent";

async function loadAnalytics(env?: string) {
  vi.resetModules();
  if (env === undefined) delete process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  else process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = env;
  return import("./analytics");
}

function setConsent(analytics: boolean) {
  const prefs = analytics ? acceptAllPreferences() : rejectAllPreferences();
  writeClientCookiePreferences(prefs);
}

afterEach(() => {
  delete process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  // Limpiar la cookie de consentimiento y el estado global de gtag entre tests.
  document.cookie = "cookie_consent_v1=; Max-Age=0; Path=/";
  delete (window as { dataLayer?: unknown[] }).dataLayer;
  delete (window as { gtag?: unknown }).gtag;
});

describe("GA_MEASUREMENT_ID — validación de la env", () => {
  it("sin env → null (integración no-op)", async () => {
    const mod = await loadAnalytics(undefined);
    expect(mod.GA_MEASUREMENT_ID).toBeNull();
  });

  it("formato inválido → null (fail-closed: un valor mal pegado no se interpola en la URL)", async () => {
    for (const bad of ["", "UA-123", "G-", "G-CON ESPACIOS", "<script>alert(1)</script>"]) {
      const mod = await loadAnalytics(bad);
      expect(mod.GA_MEASUREMENT_ID).toBeNull();
    }
  });

  it("formato G-XXXXXXX → se acepta (trim incluido)", async () => {
    const mod = await loadAnalytics("  G-ABC123XY  ");
    expect(mod.GA_MEASUREMENT_ID).toBe("G-ABC123XY");
  });
});

describe("centsToCOP / toGa4Item — dinero en pesos, nunca centavos", () => {
  it("convierte centavos COP a pesos", async () => {
    const mod = await loadAnalytics("G-ABC123XY");
    expect(mod.centsToCOP(450000)).toBe(4500);
    expect(mod.centsToCOP(0)).toBe(0);
  });

  it("toGa4Item mapea sku → item_id y priceCents → price en pesos", async () => {
    const mod = await loadAnalytics("G-ABC123XY");
    expect(
      mod.toGa4Item({
        sku: "IMN-001-6X6",
        name: "Imán Nevera",
        variantName: "6×6 cm",
        categoryName: "Fotoimanes",
        priceCents: 450000,
        quantity: 2,
      }),
    ).toEqual({
      item_id: "IMN-001-6X6",
      item_name: "Imán Nevera",
      item_variant: "6×6 cm",
      item_category: "Fotoimanes",
      price: 4500,
      quantity: 2,
    });
  });
});

describe("trackEvent — gates de seguridad y consentimiento", () => {
  it("sin env → no-op total (ni dataLayer se siembra)", async () => {
    const mod = await loadAnalytics(undefined);
    mod.initGa4Queue();
    setConsent(true);
    mod.trackEvent("view_item", { currency: "COP", value: 1, items: [] });
    expect(window.dataLayer ?? []).toHaveLength(0);
  });

  it("sin consentimiento de analíticas → no emite aunque gtag esté cargado", async () => {
    const mod = await loadAnalytics("G-ABC123XY");
    mod.initGa4Queue();
    // Sin cookie de consentimiento (el visitante no ha respondido el banner).
    mod.trackEvent("view_item", { currency: "COP", value: 4500, items: [] });
    expect(window.dataLayer ?? []).toHaveLength(0);
    // Rechazo explícito: tampoco.
    setConsent(false);
    mod.trackEvent("view_item", { currency: "COP", value: 4500, items: [] });
    expect(window.dataLayer ?? []).toHaveLength(0);
  });

  it("con env + consentimiento → empuja el evento a dataLayer", async () => {
    const mod = await loadAnalytics("G-ABC123XY");
    mod.initGa4Queue();
    setConsent(true);
    mod.trackEvent("view_item", {
      currency: "COP",
      value: 4500,
      items: [{ item_id: "SKU-1", item_name: "Imán", price: 4500, quantity: 1 }],
    });
    expect(window.dataLayer).toHaveLength(1);
    expect(window.dataLayer![0]).toEqual([
      "event",
      "view_item",
      expect.objectContaining({ currency: "COP", value: 4500 }),
    ]);
  });

  it("revocación mid-session: tras rechazar, deja de emitir aunque gtag siga cargado", async () => {
    const mod = await loadAnalytics("G-ABC123XY");
    mod.initGa4Queue();
    setConsent(true);
    mod.trackEvent("view_cart", { currency: "COP", value: 1, items: [] });
    expect(window.dataLayer).toHaveLength(1);
    setConsent(false);
    mod.trackEvent("view_cart", { currency: "COP", value: 1, items: [] });
    expect(window.dataLayer).toHaveLength(1);
  });
});
