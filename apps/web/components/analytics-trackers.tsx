"use client";

/*
 * Trackers de eventos ecommerce GA4 (auditoría SEO 2026-10-28, E09).
 *
 * Un componente mínimo por evento, montado en la página donde vive la
 * acción (las páginas son RSC — los datos bajan por props serializadas y
 * el evento se dispara en un useEffect del cliente). Todos pasan por
 * trackEvent (lib/analytics.ts): sin env / sin consentimiento / sin gtag
 * cargado → no-op silencioso.
 *
 * Guards de disparo — App Router PRESERVA el estado de los client
 * components que quedan en la misma posición del árbol al navegar, así que
 * "fire once por instancia" mediría mal (no re-dispararía al VOLVER a la
 * página). Cada tracker guarda la última clave disparada en un ref:
 *  - Page-level (view_item / view_cart / begin_checkout / view_item_list):
 *    clave = URL actual. Misma URL (re-render, server refresh por server
 *    action) → no re-dispara; URL distinta (navegación real, ir y volver)
 *    → dispara. view_item usa solo el pathname: cambiar de variante en la
 *    PDP (?variant=) es una interacción intra-página, no otra vista.
 *  - add_to_cart: dispara en la TRANSICIÓN a ?added=1 (el redirect de éxito
 *    de la server action); RouteToasts limpia el param y rearma el
 *    disparador para el siguiente add (agregar 2 veces lo mismo re-dispara).
 *  - purchase: idempotente por transaction_id en localStorage (la página de
 *    gracias se puede recargar y el auto-refresh la recarga de verdad).
 *
 * Los effects leen las props del render vigente: cuando la URL cambia el RSC
 * ya re-renderizó con datos frescos, así que el closure captura los ítems
 * correctos (por eso los eslint-disable de exhaustive-deps — las props NO
 * deben re-disparar el evento por sí solas, solo la URL/clave).
 *
 * Cableados: view_item (PDP), select_item (ProductCard), add_to_cart (PDP
 * post-redirect ?added=1 y Estudio post-redirect /carrito?personalized=1),
 * view_cart (/carrito), begin_checkout (/checkout/datos), add_shipping_info
 * (/checkout/pago tras validar oferta HMAC), add_payment_info (/checkout/pago
 * al confirmar Wompi o COD), purchase (/checkout/gracias y /pedido/[token]?nueva=1
 * para COD), view_item_list (/productos).
 */

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  centsToCOP,
  claimAnalyticsOnceKey,
  consumePersonalizedAddToCart,
  toGa4Item,
  trackEvent,
  type AnalyticsEditorKind,
  type Ga4ItemInput,
} from "@/lib/analytics";
import { emitFunnelEvent, emitSessionFunnelStep } from "@/lib/funnel-client";

export type FunnelLineAttribution = {
  productSlug: string;
  editorKind: AnalyticsEditorKind;
};

/** URL actual completa (path + query) — clave de "vista" para los trackers. */
function useCurrentUrl(): string {
  const pathname = usePathname();
  const qs = useSearchParams().toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/**
 * Dispara `fire` cuando cambia la clave de vista (navegación real); ignora
 * re-renders sobre la misma clave. El ref sobrevive al double-effect de
 * StrictMode (dev) → un solo evento por vista, también en dev.
 */
function useTrackOnViewChange(viewKey: string, fire: () => void) {
  const lastFiredRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastFiredRef.current === viewKey) return;
    lastFiredRef.current = viewKey;
    fire();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey]);
}

/** view_item — PDP. La página es RSC: baja sku/precio (centavos) ya resueltos
 *  (variante elegida si la hay, fallback al producto). Se clavea por pathname:
 *  elegir otra variante (?variant=) es una interacción intra-página, no otra
 *  vista del producto. */
export function TrackViewItem({
  item,
  productSlug,
  editorKind,
}: {
  item: Ga4ItemInput;
  productSlug?: string;
  editorKind?: AnalyticsEditorKind;
}) {
  const pathname = usePathname();
  useTrackOnViewChange(pathname, () => {
    trackEvent("view_item", {
      currency: "COP",
      value: centsToCOP(item.priceCents),
      items: [toGa4Item({ ...item, quantity: item.quantity ?? 1 })],
    });
    if (productSlug) {
      emitFunnelEvent({
        eventName: "product_view",
        productSlug,
        editorKind: editorKind ?? "all",
      });
    }
  });
  return null;
}

/**
 * add_to_cart — PDP. La action del carrito es SERVER (redirect tras éxito),
 * así que el evento no puede dispararse en el submit: se dispara en el
 * cliente cuando llega el redirect de ÉXITO (`?added=1`, mismo disparador
 * del toast "Agregado al carrito"). La action adjunta `cartQty` y
 * `cartVariant` (id de la variante) para reconstruir el ítem exacto;
 * RouteToasts limpia esos params junto con `added`, lo que rearma el
 * disparador para el siguiente add (agregar 2 veces lo mismo re-dispara).
 *
 * Requiere <Suspense> en el call site (useSearchParams).
 */
export function TrackAddToCartSuccess({
  itemsByVariantId,
  fallbackItem,
  productSlug,
  editorKind,
}: {
  /** Variante elegida → ítem GA4 (precio de ESA variante en centavos). */
  itemsByVariantId: Record<string, Ga4ItemInput>;
  /** Producto sin selector de variantes (o id no resuelto): ítem de producto. */
  fallbackItem: Ga4ItemInput;
  productSlug?: string;
  editorKind?: AnalyticsEditorKind;
}) {
  const searchParams = useSearchParams();
  const wasAddedRef = useRef(false);
  useEffect(() => {
    const isAdded = searchParams.get("added") === "1";
    if (isAdded && !wasAddedRef.current) {
      const variantId = searchParams.get("cartVariant");
      const item = (variantId ? itemsByVariantId[variantId] : undefined) ?? fallbackItem;
      const qtyRaw = Number.parseInt(searchParams.get("cartQty") ?? "1", 10);
      const quantity = Number.isFinite(qtyRaw) ? Math.min(99, Math.max(1, qtyRaw)) : 1;
      trackEvent("add_to_cart", {
        currency: "COP",
        value: centsToCOP(item.priceCents * quantity),
        items: [toGa4Item({ ...item, quantity })],
      });
      if (productSlug) {
        emitFunnelEvent({
          eventName: "cart_add",
          productSlug,
          editorKind: editorKind ?? "catalog",
        });
      }
    }
    wasAddedRef.current = isAdded;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  return null;
}

/** view_cart — /carrito (una por vista de la página; el stepper de qty hace
 *  server refresh sobre la MISMA URL → no re-dispara). */
export function TrackViewCart({
  items,
  valueCents,
}: {
  items: Ga4ItemInput[];
  valueCents: number;
}) {
  const url = useCurrentUrl();
  useTrackOnViewChange(url, () => {
    if (items.length === 0) return;
    trackEvent("view_cart", {
      currency: "COP",
      value: centsToCOP(valueCents),
      items: items.map(toGa4Item),
    });
  });
  return null;
}

/** begin_checkout — /checkout/datos (una por visita al paso 1). */
export function TrackBeginCheckout({
  items,
  valueCents,
  funnelLines = [],
}: {
  items: Ga4ItemInput[];
  valueCents: number;
  funnelLines?: ReadonlyArray<FunnelLineAttribution>;
}) {
  const url = useCurrentUrl();
  useTrackOnViewChange(url, () => {
    if (items.length === 0) return;
    trackEvent("begin_checkout", {
      currency: "COP",
      value: centsToCOP(valueCents),
      items: items.map(toGa4Item),
    });
    emitSessionFunnelStep("checkout_begin", funnelLines);
  });
  return null;
}

/**
 * add_to_cart para ítems personalizados creados en el Estudio ([ANA-01] / S06).
 *
 * Los 3 editores (`StudioEditor`, `NameEditor`, `LetterSetEditor`) depositan el
 * ítem en `sessionStorage` vía `stashPersonalizedAddToCart` y redirigen a
 * `/carrito?personalized=1`. Cuando el carrito monta con `personalized=1`, este
 * tracker consume ese ítem (o cae al último ítem personalizado del carrito si
 * `sessionStorage` estuvo bloqueado) y emite `add_to_cart` una sola vez por alta.
 *
 * Requiere `<Suspense>` en el call site (`useSearchParams`).
 */
export function TrackPersonalizedAddToCart({
  fallbackItems,
}: {
  fallbackItems: Array<
    Ga4ItemInput & {
      designId?: string | null;
      productSlug?: string;
      editorKind?: AnalyticsEditorKind;
    }
  >;
}) {
  const searchParams = useSearchParams();
  const wasPersonalizedRef = useRef(false);
  useEffect(() => {
    const isPersonalized = searchParams.get("personalized") === "1";
    if (isPersonalized && !wasPersonalizedRef.current) {
      const stashed = consumePersonalizedAddToCart();
      if (stashed) {
        const qty = stashed.quantity ?? 1;
        trackEvent("add_to_cart", {
          currency: "COP",
          value: centsToCOP(stashed.priceCents * qty),
          items: [toGa4Item({ ...stashed, quantity: qty })],
        });
        if (stashed.productSlug) {
          emitFunnelEvent({
            eventName: "cart_add",
            productSlug: stashed.productSlug,
            editorKind: stashed.editorKind ?? "photo",
          });
        }
      } else {
        const personalizedLines = fallbackItems.filter((i) => Boolean(i.designId));
        const candidate = personalizedLines[personalizedLines.length - 1];
        if (candidate) {
          const qty = candidate.quantity ?? 1;
          const dedupKey = `ga4:personalized:${candidate.designId ?? candidate.sku}:${qty}`;
          if (claimAnalyticsOnceKey("session", dedupKey)) {
            trackEvent("add_to_cart", {
              currency: "COP",
              value: centsToCOP(candidate.priceCents * qty),
              items: [toGa4Item({ ...candidate, quantity: qty })],
            });
            if (candidate.productSlug) {
              emitFunnelEvent({
                eventName: "cart_add",
                productSlug: candidate.productSlug,
                editorKind: candidate.editorKind ?? "photo",
              });
            }
          }
        }
      }
    }
    wasPersonalizedRef.current = isPersonalized;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  return null;
}

/**
 * add_shipping_info — `/checkout/pago` una vez validada la selección HMAC de
 * transportadora ([ANA-01] / S06). Deduplicado en `sessionStorage` por
 * transportadora + subtotal para que recargas o cambios de cupón en el paso 3
 * no inflen el conteo, pero volver al paso 2 y elegir otra tarifa sí emita.
 */
export function TrackAddShippingInfo({
  shippingTier,
  valueCents,
  coupon,
  items,
  funnelLines = [],
}: {
  shippingTier: string;
  valueCents: number;
  coupon?: string;
  items: Ga4ItemInput[];
  funnelLines?: ReadonlyArray<FunnelLineAttribution>;
}) {
  const firedTierRef = useRef<string | null>(null);
  useEffect(() => {
    if (items.length === 0 || !shippingTier) return;
    const sig = `${shippingTier}:${valueCents}`;
    if (firedTierRef.current === sig) return;
    firedTierRef.current = sig;
    if (!claimAnalyticsOnceKey("session", `ga4:shipping:${sig}`)) return;
    trackEvent("add_shipping_info", {
      currency: "COP",
      value: centsToCOP(valueCents),
      shipping_tier: shippingTier,
      ...(coupon ? { coupon } : {}),
      items: items.map(toGa4Item),
    });
    emitSessionFunnelStep("checkout_shipping_selected", funnelLines);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shippingTier, valueCents]);
  return null;
}

/**
 * select_item — enlace stretched-link mínimo para `ProductCard` ([ANA-01] / S06).
 * Mantiene `ProductCard` 100% Server Component: solo este `<Link>` hoja es client.
 */
export function ProductCardSelectLink({
  href,
  ariaLabel,
  className,
  item,
  listId,
  listName,
}: {
  href: string;
  ariaLabel: string;
  className?: string;
  item: Ga4ItemInput;
  listId?: string;
  listName?: string;
}) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className={className}
      onClick={() => {
        trackEvent("select_item", {
          ...(listId ? { item_list_id: listId } : {}),
          ...(listName ? { item_list_name: listName } : {}),
          items: [toGa4Item(item)],
        });
      }}
    />
  );
}
/**
 * purchase — /checkout/gracias (Wompi aprobado) y /pedido/[token]?nueva=1 (COD).
 *
 * IDEMPOTENTE por transaction_id: flag en localStorage
 * `ga4:purchase:<transaction_id>` — sobrevive reloads, el auto-refresh de
 * estados intermedios y nuevas pestañas del mismo navegador. localStorage
 * (no sessionStorage) porque la confirmación PENDING → APPROVED puede llegar
 * en OTRA pestaña/sesión. Si localStorage no está disponible (modo privado
 * estricto), queda el guard de ref por instancia. El flag se siembra ANTES
 * de emitir: si trackEvent es no-op por falta de consentimiento, el evento
 * NO se reintenta en el próximo render (la conversión sin consentimiento
 * simplemente no se mide — decisión consciente del gate duro).
 */
export function TrackPurchase({
  transactionId,
  valueCents,
  shippingCents,
  taxCents,
  items,
  funnelLines = [],
}: {
  /** Número de orden (LCM-YYYY-NNNN) — estable ante recargas y reintentos
   *  de pago (un segundo cobro sobre la misma orden NO debe re-contar). */
  transactionId: string;
  valueCents: number;
  shippingCents: number;
  taxCents: number;
  items: Ga4ItemInput[];
  funnelLines?: ReadonlyArray<FunnelLineAttribution>;
}) {
  const firedRef = useRef(false);
  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    if (!claimAnalyticsOnceKey("local", `ga4:purchase:${transactionId}`)) return;
    trackEvent("purchase", {
      transaction_id: transactionId,
      currency: "COP",
      value: centsToCOP(valueCents),
      shipping: centsToCOP(shippingCents),
      tax: centsToCOP(taxCents),
      items: items.map(toGa4Item),
    });
    emitSessionFunnelStep("purchase_completed", funnelLines);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactionId]);
  return null;
}

/** view_item_list — /productos (catálogo / categoría / búsqueda; cada
 *  combinación de filtros o paginación cambia la URL → nueva vista). */
export function TrackViewItemList({
  listId,
  listName,
  items,
}: {
  /** Identifica QUÉ listado se vio: "catalog" | "category:<slug>" | "search". */
  listId: string;
  listName: string;
  items: Ga4ItemInput[];
}) {
  const url = useCurrentUrl();
  useTrackOnViewChange(url, () => {
    if (items.length === 0) return;
    trackEvent("view_item_list", {
      item_list_id: listId,
      item_list_name: listName,
      items: items.map(toGa4Item),
    });
  });
  return null;
}
