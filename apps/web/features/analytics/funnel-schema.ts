/*
 * Esquema compartido y utilidades puras del embudo anónimo tienda + Estudio ([ANA-01]).
 *
 * Sin "server-only": lo importan tanto el cliente (`lib/funnel-client.ts`) como el
 * endpoint (`app/api/funnel/route.ts`) y el servicio de agregación (`funnel-service.ts`).
 *
 * Invariante de privacidad (Ley 1581):
 *   - Todos los campos salvo `productSlug` son enums cerrados.
 *   - `productSlug` solo admite slugs kebab-case minúscula (`^[a-z0-9]+(-[a-z0-9]+)*$`)
 *     o el centinela global `"_all"` para totales de sesión (checkout/compra).
 *   - Es estructuralmente imposible inyectar emails, teléfonos, nombres, tokens,
 *     IDs de sesión o mensajes de error libres en `FunnelEventDaily`.
 */

import { z } from "zod";
import type { PersonalizationKind } from "@lucams/db";
import { resolvePersonalizationSurface } from "@/features/personalization/surface";

export const FUNNEL_ALL_PRODUCTS_SLUG = "_all";

export const FUNNEL_EVENT_NAMES = [
  "product_view",
  "studio_open",
  "studio_template_select",
  "studio_asset_upload_succeeded",
  "studio_asset_upload_failed",
  "studio_preview_open",
  "studio_finalize_succeeded",
  "studio_finalize_failed",
  "cart_add",
  "checkout_begin",
  "checkout_shipping_selected",
  "checkout_payment_submitted",
  "purchase_completed",
] as const;

export type FunnelEventName = (typeof FUNNEL_EVENT_NAMES)[number];

export const FUNNEL_EDITOR_KINDS = ["photo", "name", "letterset", "catalog", "all"] as const;
export type FunnelEditorKind = (typeof FUNNEL_EDITOR_KINDS)[number];

export const FUNNEL_DEVICE_CATEGORIES = ["mobile", "tablet", "desktop", "unknown"] as const;
export type FunnelDeviceCategory = (typeof FUNNEL_DEVICE_CATEGORIES)[number];

export const FUNNEL_ERROR_CODES = [
  "",
  "too_big",
  "network",
  "server_rejected",
  "low_quality",
  "master_expired",
  "server_crash",
  "validation",
  "cart_add_failed",
] as const;
export type FunnelErrorCode = (typeof FUNNEL_ERROR_CODES)[number];

export const PRODUCT_SLUG_OR_ALL_REGEX = /^(_all|[a-z0-9]+(?:-[a-z0-9]+)*)$/;

export const FunnelSingleEventSchema = z.object({
  eventName: z.enum(FUNNEL_EVENT_NAMES),
  productSlug: z.string().min(1).max(80).regex(PRODUCT_SLUG_OR_ALL_REGEX),
  editorKind: z.enum(FUNNEL_EDITOR_KINDS).default("all"),
  deviceCategory: z.enum(FUNNEL_DEVICE_CATEGORIES).optional(),
  errorCode: z.enum(FUNNEL_ERROR_CODES).default(""),
});

export type FunnelSingleEventInput = z.infer<typeof FunnelSingleEventSchema>;

export const FunnelPayloadSchema = z.union([
  FunnelSingleEventSchema,
  z.object({
    events: z.array(FunnelSingleEventSchema).min(1).max(8),
  }),
]);

export type FunnelPayloadInput = z.infer<typeof FunnelPayloadSchema>;

/** Normaliza el payload simple o por lote a un arreglo plano validado. */
export function normalizeFunnelPayload(payload: FunnelPayloadInput): FunnelSingleEventInput[] {
  return "events" in payload ? payload.events : [payload];
}

/**
 * Clasificación gruesa de dispositivo sin persistir `userAgent` ni fingerprint.
 * En cliente prioriza el ancho de viewport; en servidor cae a patrones gruesos de UA.
 */
export function detectFunnelDeviceCategory(opts: {
  viewportWidth?: number | null;
  userAgent?: string | null;
}): FunnelDeviceCategory {
  const w = opts.viewportWidth;
  if (typeof w === "number" && Number.isFinite(w) && w > 0) {
    if (w < 768) return "mobile";
    if (w < 1024) return "tablet";
    return "desktop";
  }
  const ua = opts.userAgent ?? "";
  if (!ua.trim()) return "unknown";
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/i.test(ua)) return "tablet";
  if (/mobi|iphone|ipod|android/i.test(ua)) return "mobile";
  return "desktop";
}

const BOGOTA_DATE_FMT = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/Bogota",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Día calendario en `America/Bogota` representado como `Date` UTC `00:00:00.000Z`
 * para columnas `@db.Date` de Postgres (alineado con `/admin/finanzas` y resumen diario).
 */
export function bogotaDayUtcDate(now: Date = new Date()): Date {
  const ymd = BOGOTA_DATE_FMT.format(now);
  return new Date(`${ymd}T00:00:00.000Z`);
}

/** Mapea el resultado de `resolvePersonalizationSurface` a `FunnelEditorKind`. */
export function editorKindFromSurfaceName(
  surface: "photo" | "name" | "letterset" | "phrase" | "event" | "logo" | "direct-cart",
): Exclude<FunnelEditorKind, "all"> {
  if (surface === "name") return "name";
  if (surface === "letterset") return "letterset";
  if (surface === "direct-cart") return "catalog";
  return "photo";
}

function asPlainRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

/**
 * Resuelve la superficie exacta (`photo` | `name` | `letterset` | `catalog`) para
 * una ficha, línea de carrito o línea de pedido, priorizando `designMetadata.surface`
 * cuando ya existe un diseño persistido.
 */
export function resolveFunnelEditorKind(opts: {
  isPersonalizable?: boolean;
  personalizationKind: PersonalizationKind;
  productSchema?: unknown;
  variantAttrs?: unknown;
  designMetadata?: unknown;
}): Exclude<FunnelEditorKind, "all"> {
  const meta = asPlainRecord(opts.designMetadata);
  if (meta.surface === "name") return "name";
  if (meta.surface === "letterset") return "letterset";
  if (opts.isPersonalizable === false) return "catalog";
  const merged = {
    ...asPlainRecord(opts.productSchema),
    ...asPlainRecord(opts.variantAttrs),
  };
  return editorKindFromSurfaceName(
    resolvePersonalizationSurface(opts.personalizationKind, merged).surface,
  );
}
