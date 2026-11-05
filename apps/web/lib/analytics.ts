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

/** Superficie del Estudio o catálogo simple para atribución del embudo ([ANA-01]). */
export type AnalyticsEditorKind = "photo" | "name" | "letterset" | "catalog";

/** Parámetros base de telemetría del Estudio (cero PII, cero IDs de sesión/diseño). */
export type StudioAnalyticsParams = {
  product_slug: string;
  editor_kind: Exclude<AnalyticsEditorKind, "catalog">;
  device_category?: "mobile" | "tablet" | "desktop" | "unknown";
  error_code?: string;
};

/** Mapa evento → params. trackEvent es type-safe contra este mapa: params
 *  inválidos para el evento son error de compilación. */
export type AnalyticsEvents = {
  view_item: WithItems;
  select_item: { item_list_id?: string; item_list_name?: string; items: Ga4Item[] };
  view_item_list: { item_list_id?: string; item_list_name?: string; items: Ga4Item[] };
  add_to_cart: WithItems;
  view_cart: WithItems;
  begin_checkout: WithItems & { coupon?: string };
  add_shipping_info: WithItems & { shipping_tier?: string; coupon?: string };
  add_payment_info: WithItems & { payment_type?: string; coupon?: string };
  purchase: WithItems & { transaction_id: string; shipping?: number; tax?: number };
  studio_open: StudioAnalyticsParams;
  studio_template_select: StudioAnalyticsParams;
  studio_asset_upload_succeeded: StudioAnalyticsParams;
  studio_asset_upload_failed: StudioAnalyticsParams;
  studio_preview_open: StudioAnalyticsParams;
  studio_finalize_succeeded: StudioAnalyticsParams;
  studio_finalize_failed: StudioAnalyticsParams;
};

/** Query params públicos sin PII ni tokens permitidos en `page_location` de GA4. */
const SAFE_ANALYTICS_QUERY_KEYS = new Set([
  "categoria",
  "subcategoria",
  "ocasion",
  "orden",
  "pagina",
  "variant",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
]);

/** Segmentos dinámicos con bearer/capability tokens que NUNCA deben salir a GA4. */
const TOKEN_PATH_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  [/^\/pedido\/[^/]+$/, "/pedido/[token]"],
  [/^\/carrito\/recuperar\/[^/]+$/, "/carrito/recuperar/[token]"],
  [/^\/resena\/[^/]+$/, "/resena/[token]"],
  [/^\/d\/[^/]+$/, "/d/[token]"],
  [/^\/cotizacion\/[^/]+$/, "/cotizacion/[token]"],
  [/^\/soporte\/[^/]+$/, "/soporte/[token]"],
];

/**
 * Sanitiza `pathname` + `searchParams` antes de emitir `page_view` a GA4 ([ANA-01]):
 *  - Excluye el panel `/admin` (backoffice privado, nunca se reporta a terceros).
 *  - Enmascara tokens de capacidad en la ruta (`/pedido/<32hex>` → `/pedido/[token]`).
 *  - Filtra query params por allowlist estricta (descarta `email`, `phone`, `token`,
 *    `code`, `id` de Wompi, `st`/`ot`/`qt`, `designId`, `q`, `error`, etc.).
 */
export function sanitizeAnalyticsUrl(
  pathname: string,
  searchParamsString = "",
): { pagePath: string; pageUrl: string } | null {
  if (!pathname || pathname === "/admin" || pathname.startsWith("/admin/")) {
    return null;
  }
  let safePath = pathname;
  for (const [pattern, masked] of TOKEN_PATH_PATTERNS) {
    if (pattern.test(safePath)) {
      safePath = masked;
      break;
    }
  }
  const incoming = new URLSearchParams(searchParamsString);
  const filtered = new URLSearchParams();
  for (const [key, value] of incoming.entries()) {
    if (SAFE_ANALYTICS_QUERY_KEYS.has(key) && value.length <= 120) {
      filtered.append(key, value);
    }
  }
  const qs = filtered.toString();
  return {
    pagePath: safePath,
    pageUrl: qs ? `${safePath}?${qs}` : safePath,
  };
}

const PERSONALIZED_ADD_STORAGE_KEY = "ga4:pending_personalized_add";

export type StashedPersonalizedCartItem = Ga4ItemInput & {
  nonce: string;
  designId?: string;
  productSlug?: string;
  editorKind?: AnalyticsEditorKind;
};

/**
 * Registra en `sessionStorage` el ítem recién creado en el Estudio antes de
 * navegar a `/carrito?personalized=1`. No guarda PII ni tokens; si storage no
 * está disponible (modo privado estricto), falla en silencio y el tracker del
 * carrito cae al último ítem personalizado presente en `CartDetail`.
 */
export function stashPersonalizedAddToCart(
  item: Ga4ItemInput & {
    designId?: string;
    productSlug?: string;
    editorKind?: AnalyticsEditorKind;
  },
): void {
  if (typeof window === "undefined") return;
  try {
    const payload: StashedPersonalizedCartItem = {
      ...item,
      nonce: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    };
    window.sessionStorage.setItem(PERSONALIZED_ADD_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Sin sessionStorage: el tracker usa fallback por designId del carrito.
  }
}

/** Lee y consume de forma atómica el ítem personalizado pendiente en `sessionStorage`. */
export function consumePersonalizedAddToCart(): StashedPersonalizedCartItem | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PERSONALIZED_ADD_STORAGE_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(PERSONALIZED_ADD_STORAGE_KEY);
    const parsed = JSON.parse(raw) as Partial<StashedPersonalizedCartItem>;
    if (
      typeof parsed.sku !== "string" ||
      typeof parsed.name !== "string" ||
      typeof parsed.priceCents !== "number" ||
      !Number.isFinite(parsed.priceCents) ||
      typeof parsed.nonce !== "string"
    ) {
      return null;
    }
    const validEditorKind =
      parsed.editorKind === "photo" ||
      parsed.editorKind === "name" ||
      parsed.editorKind === "letterset" ||
      parsed.editorKind === "catalog"
        ? parsed.editorKind
        : undefined;
    return {
      sku: parsed.sku,
      name: parsed.name,
      variantName: typeof parsed.variantName === "string" ? parsed.variantName : undefined,
      categoryName: typeof parsed.categoryName === "string" ? parsed.categoryName : undefined,
      priceCents: parsed.priceCents,
      quantity:
        typeof parsed.quantity === "number" && Number.isFinite(parsed.quantity)
          ? parsed.quantity
          : 1,
      nonce: parsed.nonce,
      designId: typeof parsed.designId === "string" ? parsed.designId : undefined,
      productSlug: typeof parsed.productSlug === "string" ? parsed.productSlug : undefined,
      editorKind: validEditorKind,
    };
  } catch {
    return null;
  }
}

/**
 * Reclama una clave de deduplicación en `localStorage` o `sessionStorage`.
 * Devuelve `true` la primera vez y `false` si ya existía. Si storage lanza
 * excepción, devuelve `true` (el caller mantiene su `useRef` por instancia).
 */
export function claimAnalyticsOnceKey(kind: "local" | "session", key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const store = kind === "local" ? window.localStorage : window.sessionStorage;
    if (store.getItem(key)) return false;
    store.setItem(key, new Date().toISOString());
    return true;
  } catch {
    return true;
  }
}

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
