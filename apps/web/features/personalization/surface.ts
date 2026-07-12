/*
 * Enrutador de superficie de personalización (ADR-057, Fase 0).
 *
 * El Estudio NO debe aplicar el editor de foto a todos los productos. Esta función
 * pura decide, a partir de (kind + personalizationSchema ya mergeado con la variante),
 * QUÉ superficie de edición corresponde — sin tocar UI ni DB. Es el reemplazo del
 * atajo silencioso `parsePhotoProductConfig` que asumía "1 foto" para todo.
 *
 * 5 superficies + carrito directo:
 *   - photo        → PHOTO_PACK / PHOTO_GRID / CALENDAR_* / CUSTOM_DECOR (editor actual)
 *   - name         → TEXT_ONLY variante "nombre" (escribir un nombre → fichas de letras)
 *   - phrase       → TEXT_ONLY "cuadro con frase" (texto + fuente/color)
 *   - event        → EVENT_FAVOR (formulario del evento + 1 foto opcional)
 *   - logo         → BUSINESS_LOGO (subir logo + datos de contacto)
 *   - direct-cart  → set fijo (abecedario completo/vocales) o producto no personalizable
 *
 * Pura y server/client-safe: sin imports pesados. Los sub-editores concretos se
 * construyen sobre este contrato.
 */

import type { PersonalizationKind } from "@lucams/db";
import { parsePhotoProductConfig, type PhotoProductConfig } from "./schemas";

export type NameSurfaceConfig = {
  /** Mín. de letras del nombre (inclusive). */
  min: number;
  /** Máx. de letras del nombre (inclusive). */
  max: number;
  /** Idioma del alfabeto: "es" acepta Ñ, "en" la rechaza. */
  language: "es" | "en";
};

export type PhraseSurfaceConfig = {
  maxChars: number;
  /** Fuentes permitidas para este producto (vacío = todas las de marca). */
  fontOptions: string[];
};

export type EventSurfaceConfig = {
  /** Campos estructurados a pedir (ej. ["coupleNames","date","venue"]). */
  fields: string[];
  /** Si el producto admite 1 foto opcional dentro de la plantilla. */
  allowPhoto: boolean;
};

export type LogoSurfaceConfig = {
  /** Campos de contacto a pedir (ej. ["logo","phone","email","website"]). */
  fields: string[];
  /** Troquelado (corte especial): sin editor en vivo → cotización por WhatsApp. */
  requiresVectorFile: boolean;
};

export type PersonalizationSurface =
  | { surface: "photo"; config: PhotoProductConfig }
  | { surface: "name"; config: NameSurfaceConfig }
  | { surface: "phrase"; config: PhraseSurfaceConfig }
  | { surface: "event"; config: EventSurfaceConfig }
  | { surface: "logo"; config: LogoSurfaceConfig }
  | { surface: "direct-cart"; reason: "fixed-variant" | "not-personalizable" };

/** Kinds cuya edición es (parcial o totalmente) el editor de foto actual. */
const PHOTO_KINDS: ReadonlySet<PersonalizationKind> = new Set([
  "PHOTO_PACK",
  "PHOTO_GRID",
  "CALENDAR_PHOTO_MONTH",
  "CALENDAR_PHOTO_HERO",
  "CUSTOM_DECOR",
]);

function numOr(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/**
 * Decide la superficie de edición. `schema` es el personalizationSchema del producto
 * YA mergeado con los attributes de la variante elegida (mergeVariantOverProduct), así
 * que aquí ya viven `variant`, `letterCountMin/Max`, `nameMaxLength`, `eventFields`, etc.
 */
export function resolvePersonalizationSurface(
  kind: PersonalizationKind,
  schema: Record<string, unknown> | null | undefined,
): PersonalizationSurface {
  const s = schema ?? {};

  if (kind === "NONE") {
    return { surface: "direct-cart", reason: "not-personalizable" };
  }

  if (kind === "TEXT_ONLY") {
    const variant = typeof s.variant === "string" ? s.variant : undefined;
    // Sets fijos → nada que personalizar → compra directa (no abrir el Estudio).
    if (variant === "full" || variant === "vowels") {
      return { surface: "direct-cart", reason: "fixed-variant" };
    }
    // "Cuadro con frase": tiene maxChars/fontOptions y NO es un nombre-de-abecedario.
    const isPhrase =
      variant !== "name" && (typeof s.maxChars === "number" || Array.isArray(s.fontOptions));
    if (isPhrase) {
      return {
        surface: "phrase",
        config: { maxChars: numOr(s.maxChars, 80), fontOptions: strArr(s.fontOptions) },
      };
    }
    // Abecedario "nombre": escribir un nombre → fichas de letras.
    const max = numOr(s.letterCountMax, numOr(s.nameMaxLength, 10));
    const min = Math.min(numOr(s.letterCountMin, 1), max);
    const language = s.language === "en" ? "en" : "es";
    return { surface: "name", config: { min, max, language } };
  }

  if (kind === "EVENT_FAVOR") {
    return {
      surface: "event",
      config: { fields: strArr(s.eventFields), allowPhoto: s.allowPhoto === true },
    };
  }

  if (kind === "BUSINESS_LOGO") {
    return {
      surface: "logo",
      config: { fields: strArr(s.fields), requiresVectorFile: s.requiresVectorFile === true },
    };
  }

  if (PHOTO_KINDS.has(kind)) {
    return { surface: "photo", config: parsePhotoProductConfig(s) };
  }

  // Kind desconocido/futuro: degradar seguro a foto (comportamiento actual).
  return { surface: "photo", config: parsePhotoProductConfig(s) };
}

/** ¿Esta combinación (kind, schema mergeado) debe abrir el Estudio o ir directo al carrito? */
export function opensStudio(
  kind: PersonalizationKind,
  schema: Record<string, unknown> | null | undefined,
): boolean {
  return resolvePersonalizationSurface(kind, schema).surface !== "direct-cart";
}
