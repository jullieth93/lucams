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
 * Cableados: view_item (PDP), add_to_cart (PDP post-redirect ?added=1),
 * view_cart (/carrito), begin_checkout (/checkout/datos), purchase
 * (/checkout/gracias), view_item_list (/productos).
 *
 * PENDIENTES (decisión 2026-10-28 — no cableados por costo/beneficio):
 *  - select_item: exigiría envolver cada card de los listados con un
 *    handler client (ProductCard es RSC y se reusa en home/categorías/
 *    relacionados); el click-through ya es medible vía page_view de la PDP.
 *  - add_shipping_info / add_payment_info: el checkout es redirect al
 *    hosted checkout de Wompi — el cliente no elige transportadora ni
 *    método de pago en UI propia, así que no hay interacción que medir.
 */

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { centsToCOP, toGa4Item, trackEvent, type Ga4ItemInput } from "@/lib/analytics";

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
export function TrackViewItem({ item }: { item: Ga4ItemInput }) {
  const pathname = usePathname();
  useTrackOnViewChange(pathname, () => {
    trackEvent("view_item", {
      currency: "COP",
      value: centsToCOP(item.priceCents),
      items: [toGa4Item({ ...item, quantity: item.quantity ?? 1 })],
    });
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
}: {
  /** Variante elegida → ítem GA4 (precio de ESA variante en centavos). */
  itemsByVariantId: Record<string, Ga4ItemInput>;
  /** Producto sin selector de variantes (o id no resuelto): ítem de producto. */
  fallbackItem: Ga4ItemInput;
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
}: {
  items: Ga4ItemInput[];
  valueCents: number;
}) {
  const url = useCurrentUrl();
  useTrackOnViewChange(url, () => {
    if (items.length === 0) return;
    trackEvent("begin_checkout", {
      currency: "COP",
      value: centsToCOP(valueCents),
      items: items.map(toGa4Item),
    });
  });
  return null;
}

/**
 * purchase — /checkout/gracias (solo cuando la orden quedó CONFIRMADA).
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
}: {
  /** Número de orden (LCM-YYYY-NNNN) — estable ante recargas y reintentos
   *  de pago (un segundo cobro sobre la misma orden NO debe re-contar). */
  transactionId: string;
  valueCents: number;
  shippingCents: number;
  taxCents: number;
  items: Ga4ItemInput[];
}) {
  const firedRef = useRef(false);
  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    const key = `ga4:purchase:${transactionId}`;
    try {
      if (window.localStorage.getItem(key)) return;
      window.localStorage.setItem(key, new Date().toISOString());
    } catch {
      // Sin storage: el ref por instancia es la única defensa que queda.
    }
    trackEvent("purchase", {
      transaction_id: transactionId,
      currency: "COP",
      value: centsToCOP(valueCents),
      shipping: centsToCOP(shippingCents),
      tax: centsToCOP(taxCents),
      items: items.map(toGa4Item),
    });
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
