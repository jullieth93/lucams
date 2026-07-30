/*
 * Guía de subida de fotos del Estudio (Ola 4, Lucy 2026-07-23) — ÚNICA fuente del texto
 * de formatos y resolución recomendada mostrado junto a los puntos de subida (sidebar
 * "Mis fotos", modal de elegir foto, onboarding). Antes el `accept` estaba duplicado
 * literal en cada componente y no había texto visible de formatos/resolución.
 *
 * La recomendación de px usa la MISMA fórmula del quality-check del server
 * (apps/web/lib/photo-validation.ts: PX_PER_CM_300DPI = 300/2.54 ≈ 118 px/cm): para el
 * tamaño físico del producto, el lado MENOR de la foto debería tener al menos ese px.
 */

import { fillStudioText } from "../studio-texts";

/** `accept` de los input[type=file] del Estudio (JPG, PNG, WebP, HEIC/HEIF). */
export const STUDIO_ACCEPTED_IMAGE_TYPES = "image/jpeg,image/png,image/webp,image/heic,image/heif";

/** Texto corto de formatos permitidos. */
export const UPLOAD_FORMATS_TEXT = "JPG, PNG, WebP o HEIC";

/** Tamaño máximo por foto (mismo límite que lib/storage.ts CUSTOMER_UPLOAD_MAX_BYTES). */
export const UPLOAD_MAX_MB = 10;

/** px por cm para salida a 300 DPI (misma constante que lib/photo-validation.ts). */
export const PX_PER_CM_300DPI = 300 / 2.54;

/**
 * px mínimos recomendados del lado MENOR de la foto para el tamaño físico dado
 * ("7.5×10", "5×5", "6.5×20"…), redondeado a una cifra amable. null si no parsea.
 */
export function recommendedPxForSizeCm(sizeCm?: string | null): number | null {
  if (!sizeCm) return null;
  const m = sizeCm.match(/(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const minCm = Math.min(parseFloat(m[1]!), parseFloat(m[2]!));
  if (!Number.isFinite(minCm) || minCm <= 0) return null;
  const exact = minCm * PX_PER_CM_300DPI;
  // Cifra amable al alza (886 → 900, 591 → 600): recomendación fácil de recordar.
  return Math.ceil(exact / 100) * 100;
}

/**
 * Texto visible junto a los puntos de subida: formatos + recomendación de resolución.
 * Con sizeCm del producto incluye el px concreto; sin él, la regla genérica.
 *
 * Roadmap B1 — los textos vienen del CMS (estudio.fotos.guia-px / guia-generica /
 * formatos) y llegan por `templates` desde el contexto del Estudio; sin ellos se
 * usan los textos exactos pre-CMS. {maxMb} siempre lo interpola el código
 * (UPLOAD_MAX_MB es un límite técnico, no contenido editorial).
 */
export type UploadGuidanceTemplates = {
  formats: string;
  withPx: string;
  generic: string;
};

export const UPLOAD_GUIDANCE_DEFAULT_TEMPLATES: UploadGuidanceTemplates = {
  formats: UPLOAD_FORMATS_TEXT,
  withPx:
    "{formatos} · máx {maxMb} MB por foto · para que se vea nítida al imprimir, que el lado menor tenga al menos ~{px} px (salida 300 DPI).",
  generic:
    "{formatos} · máx {maxMb} MB por foto · para que se vea nítida al imprimir, usa la mayor resolución que tengas (salida 300 DPI).",
};

export function uploadGuidanceText(
  sizeCm?: string | null,
  templates: UploadGuidanceTemplates = UPLOAD_GUIDANCE_DEFAULT_TEMPLATES,
): string {
  const px = recommendedPxForSizeCm(sizeCm);
  const template = px ? templates.withPx : templates.generic;
  return fillStudioText(template, {
    formatos: templates.formats,
    maxMb: UPLOAD_MAX_MB,
    px: px ?? "",
  });
}
