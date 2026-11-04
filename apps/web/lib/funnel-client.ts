"use client";

/*
 * Emisor cliente no bloqueante del embudo tienda + Estudio ([ANA-01], Fase 2).
 *
 * Dos canales con políticas explícitas:
 *   1. First-party anónimo (`POST /api/funnel` → `FunnelEventDaily`):
 *      - Sin cookies (`credentials: "omit"`), sin PII, sin `sessionId`, sin `designId`.
 *      - Despachado en `queueMicrotask` con `keepalive: true` para no bloquear
 *        jamás el hilo principal de Konva/Three.js ni perderse al navegar.
 *   2. Google Analytics 4 (`trackEvent`):
 *      - Doblemente gateado por `hasAnalyticsConsent() === true` y `NEXT_PUBLIC_GA_MEASUREMENT_ID`.
 *
 * En entorno de test (`NODE_ENV === "test"`), el envío de red se omite salvo que el
 * propio test inyecte un transporte con `setFunnelTestTransport` (evita URLs relativas
 * en `undici` o interferir con spies de `fetch` ajenos).
 */

import { trackEvent, type AnalyticsEditorKind } from "@/lib/analytics";
import {
  detectFunnelDeviceCategory,
  FUNNEL_ALL_PRODUCTS_SLUG,
  PRODUCT_SLUG_OR_ALL_REGEX,
  type FunnelDeviceCategory,
  type FunnelEditorKind,
  type FunnelErrorCode,
  type FunnelEventName,
  type FunnelPayloadInput,
  type FunnelSingleEventInput,
} from "@/features/analytics/funnel-schema";

type FunnelTransport = (payload: FunnelPayloadInput) => void;

let customTestTransport: FunnelTransport | null = null;

/** Hook exclusivo para suites Vitest que inspeccionan los eventos emitidos. */
export function setFunnelTestTransport(fn: FunnelTransport | null): void {
  customTestTransport = fn;
}

export function currentClientDeviceCategory(): FunnelDeviceCategory {
  if (typeof window === "undefined") return "unknown";
  return detectFunnelDeviceCategory({
    viewportWidth: window.innerWidth,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
  });
}

function isValidProductSlug(slug: string): boolean {
  return PRODUCT_SLUG_OR_ALL_REGEX.test(slug);
}

function dispatchFunnelPayload(payload: FunnelPayloadInput): void {
  if (typeof window === "undefined") return;
  if (customTestTransport) {
    customTestTransport(payload);
    return;
  }
  if (process.env.NODE_ENV === "test") return;

  queueMicrotask(() => {
    try {
      void window
        .fetch("/api/funnel", {
          method: "POST",
          keepalive: true,
          credentials: "omit",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        })
        .catch(() => {
          // Telemetría best-effort: nunca interrumpe la experiencia del cliente.
        });
    } catch {
      // Ignorar entornos sin fetch disponible.
    }
  });
}

/** Emite un evento individual al contador anónimo first-party. */
export function emitFunnelEvent(input: {
  eventName: FunnelEventName;
  productSlug: string;
  editorKind?: FunnelEditorKind;
  errorCode?: FunnelErrorCode;
}): void {
  if (!isValidProductSlug(input.productSlug)) return;
  const event: FunnelSingleEventInput = {
    eventName: input.eventName,
    productSlug: input.productSlug,
    editorKind: input.editorKind ?? "all",
    deviceCategory: currentClientDeviceCategory(),
    errorCode: input.errorCode ?? "",
  };
  dispatchFunnelPayload(event);
}

/**
 * Emite un paso de sesión (`checkout_begin`, `checkout_shipping_selected`,
 * `checkout_payment_submitted`, `purchase_completed`) registrando:
 *   - 1 fila global (`_all` / `all`) para que el embudo global nunca infle carritos multi-ítem.
 *   - Hasta 7 filas deduplicadas por `(productSlug, editorKind)` para responder
 *     exactamente en qué producto o tipo de personalización convierte o abandona.
 */
export function emitSessionFunnelStep(
  eventName:
    | "checkout_begin"
    | "checkout_shipping_selected"
    | "checkout_payment_submitted"
    | "purchase_completed",
  lines: ReadonlyArray<{ productSlug?: string; editorKind?: FunnelEditorKind }>,
): void {
  const deviceCategory = currentClientDeviceCategory();
  const seen = new Set<string>();
  const events: FunnelSingleEventInput[] = [
    {
      eventName,
      productSlug: FUNNEL_ALL_PRODUCTS_SLUG,
      editorKind: "all",
      deviceCategory,
      errorCode: "",
    },
  ];

  for (const line of lines) {
    const slug = line.productSlug?.trim() ?? "";
    if (!slug || slug === FUNNEL_ALL_PRODUCTS_SLUG || !isValidProductSlug(slug)) continue;
    const editorKind = line.editorKind ?? "catalog";
    const key = `${slug}|${editorKind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    events.push({
      eventName,
      productSlug: slug,
      editorKind,
      deviceCategory,
      errorCode: "",
    });
    if (events.length >= 8) break;
  }

  dispatchFunnelPayload({ events });
}

type StudioTrackableEvent =
  | "studio_open"
  | "studio_template_select"
  | "studio_asset_upload_succeeded"
  | "studio_asset_upload_failed"
  | "studio_preview_open"
  | "studio_finalize_succeeded"
  | "studio_finalize_failed";

/**
 * Emite simultáneamente un hito del Estudio hacia:
 *   1. `FunnelEventDaily` (first-party anónimo, sin cookies ni PII).
 *   2. GA4 (`trackEvent`, activo únicamente si el usuario aceptó cookies analíticas).
 */
export function trackStudioFunnelStep(opts: {
  eventName: StudioTrackableEvent;
  productSlug: string;
  editorKind: Exclude<AnalyticsEditorKind, "catalog">;
  errorCode?: FunnelErrorCode;
}): void {
  const deviceCategory = currentClientDeviceCategory();
  emitFunnelEvent({
    eventName: opts.eventName,
    productSlug: opts.productSlug,
    editorKind: opts.editorKind,
    errorCode: opts.errorCode,
  });
  trackEvent(opts.eventName, {
    product_slug: opts.productSlug,
    editor_kind: opts.editorKind,
    device_category: deviceCategory,
    ...(opts.errorCode ? { error_code: opts.errorCode } : {}),
  });
}
