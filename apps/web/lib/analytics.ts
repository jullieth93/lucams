/*
 * GA4 (gtag.js) — helper type-safe de eventos + constantes de la integración.
 *
 * Activación por env (auditoría SEO 2026-10-28, E09): sin
 * NEXT_PUBLIC_GA_MEASUREMENT_ID la integración entera es no-op (el loader
 * components/analytics-ga4.tsx no renderiza nada y trackEvent no emite).
 * El valor se valida contra el formato `G-XXXXXXX`: un valor mal pegado
 * (la etiqueta <script> completa, con espacios, vacío) NO debe terminar
 * interpolado en una URL de script — fail-closed a "no configurado".
 *
 * Doble gate de consentimiento (Ley 1581 — opt-in estricto):
 *   1. El loader NO carga gtag.js sin consentimiento de "Analíticas"
 *      (hasAnalyticsConsent + evento cookie-consent-changed).
 *   2. trackEvent re-verifica hasAnalyticsConsent() en cada llamada:
 *      cubre la revocación mid-session (el script ya cargado no se puede
 *      "descargar", pero dejamos de emitirle eventos) y los casos en que
 *      un tracker corre antes de que el loader monte.
 *
 * Decisión (2026-10-28): NO se implementa Consent Mode v2 (señales
 * denied/granted con pings cookieless). El gate duro (cero carga sin
 * consentimiento) es la postura que ya publica legal/cookies.md y la más
 * conservadora; Consent Mode queda como mejora futura documentada acá.
 * Limitación conocida: si el visitante acepta y LUEGO rechaza analíticas
 * en la misma sesión, gtag.js ya está cargado en la página (no se puede
 * des-inyectar); trackEvent deja de emitir y el pageview tracker se detiene,
 * pero el tag ya descargado persiste hasta la próxima navegación completa.
 *
 * Tipado: NO se instala @types/gtag.js (no está en el repo y la superficie
 * que usamos es mínima) — dataLayer/gtag se declaran acá en `Window`.
 *
 * Dinero: la DB guarda centavos COP (Int); GA4 espera `value`/`price` en
 * UNIDADES de moneda (pesos). Toda conversión centavos→pesos pasa por
 * centsToCOP() — nunca dividir a mano en los call sites.
 */

import { hasAnalyticsConsent } from "@/lib/cookie-consent";

/** Measurement ID validado (formato G-XXXXXXX) o null si la env falta/es inválida. */
export const GA_MEASUREMENT_ID: string | null = (() => {
  const raw = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() ?? "";
  return /^G-[A-Z0-9]+$/i.test(raw) ? raw : null;
})();

declare global {
  interface Window {
    /** Cola del patrón gtag: los comandos empujados antes de que gtag.js
     *  cargue se procesan cuando el script termina de bajar. */
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * Siembra window.dataLayer + el stub de gtag (equivalente programático del
 * snippet oficial, sin <script> inline → compatible con la CSP de nonce:
 * la inicialización NO usa etiqueta inline, así que no necesita nonce).
 * Debe llamarse ANTES de que el script de gtag.js cargue para que los
 * comandos queden en cola. Idempotente.
 */
export function initGa4Queue(): void {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer ?? [];
  window.gtag =
    window.gtag ??
    ((...args: unknown[]) => {
      window.dataLayer?.push(args);
    });
}

/** ¿Está GA4 operativo en ESTE instante? (env + tag cargado + consentimiento vigente). */
export function isGa4Ready(): boolean {
  if (!GA_MEASUREMENT_ID) return false;
  if (typeof window === "undefined" || typeof window.gtag !== "function") return false;
  return hasAnalyticsConsent();
}

// ─────────────────────────────────────────────────────────────────────
// Eventos ecommerce (nomenclatura GA4)
// ─────────────────────────────────────────────────────────────────────

/** Ítem GA4. `price` en PESOS (no centavos); `quantity` solo donde aplica
 *  (view_item/cart/checkout/purchase — en listados no tiene sentido). */
export type Ga4Item = {
  /** SKU (de la variante cuando existe; del producto como fallback). */
  item_id: string;
  item_name: string;
  item_variant?: string;
  item_category?: string;
  price: number;
  quantity?: number;
};

type WithItems = { currency: "COP"; value: number; items: Ga4Item[] };

/** Mapa evento → params. trackEvent es type-safe contra este mapa: params
 *  inválidos para el evento son error de compilación. */
export type AnalyticsEvents = {
  view_item: WithItems;
  select_item: { item_list_id?: string; item_list_name?: string; items: Ga4Item[] };
  view_item_list: { item_list_id?: string; item_list_name?: string; items: Ga4Item[] };
  add_to_cart: WithItems;
  view_cart: WithItems;
  begin_checkout: WithItems & { coupon?: string };
  add_shipping_info: WithItems & { shipping_tier?: string };
  add_payment_info: WithItems & { payment_type?: string };
  purchase: WithItems & { transaction_id: string; shipping?: number; tax?: number };
};

/** centavos COP (Int, DB) → pesos (lo que GA4 reporta como value/price). */
export function centsToCOP(centavos: number): number {
  return centavos / 100;
}

/** Ítem en centavos (la moneda interna del repo) — input de toGa4Item. */
export type Ga4ItemInput = {
  sku: string;
  name: string;
  variantName?: string;
  categoryName?: string;
  priceCents: number;
  quantity?: number;
};

/** Input en centavos (la moneda interna del repo) → ítem GA4 en pesos. */
export function toGa4Item(input: Ga4ItemInput): Ga4Item {
  return {
    item_id: input.sku,
    item_name: input.name,
    ...(input.variantName ? { item_variant: input.variantName } : {}),
    ...(input.categoryName ? { item_category: input.categoryName } : {}),
    price: centsToCOP(input.priceCents),
    ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
  };
}

/**
 * Emite un evento GA4. No-op seguro (sin lanzar) cuando:
 *  - falta NEXT_PUBLIC_GA_MEASUREMENT_ID,
 *  - gtag.js aún no cargó (sin consentimiento o consent recién dado),
 *  - el visitante NO tiene "Analíticas" aceptada (revocación mid-session).
 */
export function trackEvent<K extends keyof AnalyticsEvents>(
  name: K,
  params: AnalyticsEvents[K],
): void {
  if (!isGa4Ready()) return;
  window.gtag!("event", name, params);
}
