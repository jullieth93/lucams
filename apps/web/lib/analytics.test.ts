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
  window.localStorage.clear();
  window.sessionStorage.clear();
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

describe("sanitizeAnalyticsUrl — privacidad y cero fuga de tokens ([ANA-01])", () => {
  it("excluye rutas del panel /admin*", async () => {
    const mod = await loadAnalytics("G-ABC123XY");
    expect(mod.sanitizeAnalyticsUrl("/admin")).toBeNull();
    expect(mod.sanitizeAnalyticsUrl("/admin/pedidos/LCM-2026-0001", "tab=items")).toBeNull();
  });

  it("enmascara todos los segmentos dinámicos con capability/bearer tokens", async () => {
    const mod = await loadAnalytics("G-ABC123XY");
    expect(mod.sanitizeAnalyticsUrl("/pedido/a1b2c3d4e5f60718293a4b5c6d7e8f90")).toEqual({
      pagePath: "/pedido/[token]",
      pageUrl: "/pedido/[token]",
    });
    expect(mod.sanitizeAnalyticsUrl("/carrito/recuperar/secret-recover-tok")).toEqual({
      pagePath: "/carrito/recuperar/[token]",
      pageUrl: "/carrito/recuperar/[token]",
    });
    expect(mod.sanitizeAnalyticsUrl("/resena/signed-review-token")).toEqual({
      pagePath: "/resena/[token]",
      pageUrl: "/resena/[token]",
    });
    expect(mod.sanitizeAnalyticsUrl("/d/share-token-xyz")).toEqual({
      pagePath: "/d/[token]",
      pageUrl: "/d/[token]",
    });
    expect(mod.sanitizeAnalyticsUrl("/cotizacion/quote-token-xyz")).toEqual({
      pagePath: "/cotizacion/[token]",
      pageUrl: "/cotizacion/[token]",
    });
    expect(mod.sanitizeAnalyticsUrl("/soporte/support-token-xyz")).toEqual({
      pagePath: "/soporte/[token]",
      pageUrl: "/soporte/[token]",
    });
  });

  it("descarta PII y tokens en query params y conserva solo la allowlist segura", async () => {
    const mod = await loadAnalytics("G-ABC123XY");
    const res = mod.sanitizeAnalyticsUrl(
      "/productos",
      "categoria=fotoimanes&email=ana%40test.com&phone=3001234567&token=abc&id=wompi-tx&q=secreto&utm_source=ig",
    );
    expect(res).toEqual({
      pagePath: "/productos",
      pageUrl: "/productos?categoria=fotoimanes&utm_source=ig",
    });
  });
});

describe("stashPersonalizedAddToCart / consumePersonalizedAddToCart / claimAnalyticsOnceKey", () => {
  it("consume de forma atómica el ítem personalizado guardado desde el Estudio", async () => {
    const mod = await loadAnalytics("G-ABC123XY");
    mod.stashPersonalizedAddToCart({
      sku: "POL-PACK6",
      name: "Fotoimanes Polaroid",
      variantName: "Pack × 6",
      categoryName: "Fotoimanes",
      priceCents: 3800000,
      quantity: 2,
      designId: "des_123",
      productSlug: "fotoimanes-polaroid",
      editorKind: "photo",
    });

    const first = mod.consumePersonalizedAddToCart();
    expect(first).toMatchObject({
      sku: "POL-PACK6",
      name: "Fotoimanes Polaroid",
      priceCents: 3800000,
      quantity: 2,
      designId: "des_123",
      productSlug: "fotoimanes-polaroid",
      editorKind: "photo",
    });
    expect(mod.consumePersonalizedAddToCart()).toBeNull();
  });

  it("claimAnalyticsOnceKey evita emisiones duplicadas en localStorage y sessionStorage", async () => {
    const mod = await loadAnalytics("G-ABC123XY");
    expect(mod.claimAnalyticsOnceKey("local", "ga4:purchase:LCM-2026-0099")).toBe(true);
    expect(mod.claimAnalyticsOnceKey("local", "ga4:purchase:LCM-2026-0099")).toBe(false);

    expect(mod.claimAnalyticsOnceKey("session", "ga4:shipping:Envía:3800000")).toBe(true);
    expect(mod.claimAnalyticsOnceKey("session", "ga4:shipping:Envía:3800000")).toBe(false);
  });
});
