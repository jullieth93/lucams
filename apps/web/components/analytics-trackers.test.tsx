// @vitest-environment jsdom
/*
 * Suite de componentes — trackers GA4 + embudo propio anónimo ([ANA-01], S06/S07).
 *
 * Verifica:
 *  - Idempotencia de `TrackPurchase` por `transactionId` ante recargas/remounts
 *    (cubre tanto Wompi en /checkout/gracias como contraentrega en /pedido/[token]).
 *  - `TrackPersonalizedAddToCart` consumiendo el stash del Estudio o el fallback.
 *  - `TrackAddShippingInfo` deduplicado por sesión (transportadora + subtotal).
 *  - `ProductCardSelectLink` disparando `select_item`.
 *  - Separación estricta de consentimiento: sin `COOKIES_ANALYTICS`, GA4 no recibe
 *    un solo evento mientras que el contador anónimo sin cookies (`FunnelEventDaily`)
 *    sí registra el avance operativo.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import {
  acceptAllPreferences,
  rejectAllPreferences,
  writeClientCookiePreferences,
} from "@/lib/cookie-consent";
import type { FunnelPayloadInput } from "@/features/analytics/funnel-schema";

let mockPathname = "/producto/fotoimanes-polaroid";
let mockSearch = "";

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useSearchParams: () => new URLSearchParams(mockSearch),
}));

async function loadModules(gaId = "G-TEST12345") {
  vi.resetModules();
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = gaId;
  const analytics = await import("@/lib/analytics");
  const funnelClient = await import("@/lib/funnel-client");
  const trackers = await import("./analytics-trackers");
  return { analytics, funnelClient, trackers };
}

function setAnalyticsConsent(accepted: boolean) {
  writeClientCookiePreferences(accepted ? acceptAllPreferences() : rejectAllPreferences());
}

beforeEach(() => {
  mockPathname = "/producto/fotoimanes-polaroid";
  mockSearch = "";
  window.localStorage.clear();
  window.sessionStorage.clear();
  document.cookie = "cookie_consent_v1=; Max-Age=0; Path=/";
  delete (window as { dataLayer?: unknown[] }).dataLayer;
  delete (window as { gtag?: unknown }).gtag;
});

afterEach(() => {
  cleanup();
  delete process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
});

describe("TrackPurchase — idempotencia Wompi + Contraentrega", () => {
  it("emite purchase y purchase_completed una sola vez por orden aunque se recargue la vista", async () => {
    const { analytics, funnelClient, trackers } = await loadModules();
    analytics.initGa4Queue();
    setAnalyticsConsent(true);

    const funnelPayloads: FunnelPayloadInput[] = [];
    funnelClient.setFunnelTestTransport((p) => funnelPayloads.push(p));

    const props = {
      transactionId: "LCM-2026-0401",
      valueCents: 5200000,
      shippingCents: 1200000,
      taxCents: 0,
      items: [{ sku: "POL-6", name: "Polaroid", priceCents: 4000000, quantity: 1 }],
      funnelLines: [{ productSlug: "fotoimanes-polaroid", editorKind: "photo" as const }],
    };

    const first = render(<trackers.TrackPurchase {...props} />);
    first.unmount();
    // Simula que el comprador recarga /pedido/[token] o vuelve desde otra pestaña:
    render(<trackers.TrackPurchase {...props} />);

    expect(window.dataLayer).toHaveLength(1);
    expect(window.dataLayer![0]).toEqual([
      "event",
      "purchase",
      expect.objectContaining({
        transaction_id: "LCM-2026-0401",
        currency: "COP",
        value: 52000,
        shipping: 12000,
      }),
    ]);

    expect(funnelPayloads).toHaveLength(1);
    expect(funnelPayloads[0]).toEqual({
      events: [
        expect.objectContaining({
          eventName: "purchase_completed",
          productSlug: "_all",
          editorKind: "all",
        }),
        expect.objectContaining({
          eventName: "purchase_completed",
          productSlug: "fotoimanes-polaroid",
          editorKind: "photo",
        }),
      ],
    });

    funnelClient.setFunnelTestTransport(null);
  });
});

describe("TrackPersonalizedAddToCart — retorno desde el Estudio", () => {
  it("consume el ítem depositado por el Estudio en ?personalized=1 y emite GA4 + embudo propio", async () => {
    mockPathname = "/carrito";
    mockSearch = "personalized=1";

    const { analytics, funnelClient, trackers } = await loadModules();
    analytics.initGa4Queue();
    setAnalyticsConsent(true);

    const funnelPayloads: FunnelPayloadInput[] = [];
    funnelClient.setFunnelTestTransport((p) => funnelPayloads.push(p));

    analytics.stashPersonalizedAddToCart({
      sku: "LET-ABC",
      name: "Abecedario Magnético",
      priceCents: 6500000,
      quantity: 1,
      designId: "des_abc",
      productSlug: "abecedario-magnetico",
      editorKind: "letterset",
    });

    render(<trackers.TrackPersonalizedAddToCart fallbackItems={[]} />);

    expect(window.dataLayer).toHaveLength(1);
    expect(window.dataLayer![0]).toEqual([
      "event",
      "add_to_cart",
      expect.objectContaining({
        currency: "COP",
        value: 65000,
      }),
    ]);
    expect(funnelPayloads).toEqual([
      expect.objectContaining({
        eventName: "cart_add",
        productSlug: "abecedario-magnetico",
        editorKind: "letterset",
      }),
    ]);

    funnelClient.setFunnelTestTransport(null);
  });
});

describe("TrackAddShippingInfo y ProductCardSelectLink", () => {
  it("emite add_shipping_info una vez por tarifa y vuelve a emitir solo si cambia la transportadora", async () => {
    mockPathname = "/checkout/pago";
    const { analytics, funnelClient, trackers } = await loadModules();
    analytics.initGa4Queue();
    setAnalyticsConsent(true);

    const funnelPayloads: FunnelPayloadInput[] = [];
    funnelClient.setFunnelTestTransport((p) => funnelPayloads.push(p));

    const items = [{ sku: "CUAD-9", name: "Cuadrados", priceCents: 4200000, quantity: 1 }];
    const r1 = render(
      <trackers.TrackAddShippingInfo
        shippingTier="Envía"
        valueCents={4200000}
        items={items}
        funnelLines={[{ productSlug: "fotoimanes-cuadrados", editorKind: "photo" }]}
      />,
    );
    r1.unmount();

    // Re-montaje con la misma tarifa → deduplicado en sessionStorage.
    const r2 = render(
      <trackers.TrackAddShippingInfo
        shippingTier="Envía"
        valueCents={4200000}
        items={items}
        funnelLines={[{ productSlug: "fotoimanes-cuadrados", editorKind: "photo" }]}
      />,
    );
    r2.unmount();

    // Cambio real de transportadora → sí emite de nuevo.
    render(
      <trackers.TrackAddShippingInfo
        shippingTier="Envío Lucams"
        valueCents={4200000}
        items={items}
        funnelLines={[{ productSlug: "fotoimanes-cuadrados", editorKind: "photo" }]}
      />,
    );

    expect(window.dataLayer).toHaveLength(2);
    expect(funnelPayloads).toHaveLength(2);
    funnelClient.setFunnelTestTransport(null);
  });

  it("ProductCardSelectLink dispara select_item al hacer clic", async () => {
    const { analytics, trackers } = await loadModules();
    analytics.initGa4Queue();
    setAnalyticsConsent(true);

    const { getByRole } = render(
      <trackers.ProductCardSelectLink
        href="/producto/separadores-magneticos"
        ariaLabel="Ver Separadores Magnéticos"
        listId="catalog"
        listName="Catálogo"
        item={{ sku: "SEP-01", name: "Separadores Magnéticos", priceCents: 2800000 }}
      />,
    );

    fireEvent.click(getByRole("link", { name: "Ver Separadores Magnéticos" }));
    expect(window.dataLayer).toHaveLength(1);
    expect(window.dataLayer![0]).toEqual([
      "event",
      "select_item",
      expect.objectContaining({
        item_list_id: "catalog",
        item_list_name: "Catálogo",
      }),
    ]);
  });
});

describe("Separación estricta: rechazo de cookies bloquea GA4 pero preserva el conteo anónimo propio", () => {
  it("con COOKIES_ANALYTICS rechazado: 0 eventos GA4 y 1 conteo anónimo sin cookies", async () => {
    const { analytics, funnelClient, trackers } = await loadModules();
    analytics.initGa4Queue();
    setAnalyticsConsent(false);

    const funnelPayloads: FunnelPayloadInput[] = [];
    funnelClient.setFunnelTestTransport((p) => funnelPayloads.push(p));

    render(
      <trackers.TrackViewItem
        productSlug="fotoimanes-polaroid"
        editorKind="photo"
        item={{ sku: "POL-6", name: "Polaroid", priceCents: 3800000 }}
      />,
    );

    expect(window.dataLayer ?? []).toHaveLength(0);
    expect(funnelPayloads).toEqual([
      expect.objectContaining({
        eventName: "product_view",
        productSlug: "fotoimanes-polaroid",
        editorKind: "photo",
      }),
    ]);

    funnelClient.setFunnelTestTransport(null);
  });
});
