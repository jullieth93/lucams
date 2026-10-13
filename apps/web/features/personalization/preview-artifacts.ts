/*
 * Artefactos de visualización del preview de un diseño (2026-10-13).
 *
 * El finalize sube el montaje compositado LIMPIO a design-previews/<designId>/
 * preview.<ext> (bucket PÚBLICO). Encima de ese preview se derivan, por
 * convención de paths (sin columnas extra de URL — la existencia la sellan
 * Design.previewWatermarkedAt / Design.previewPagesCount):
 *
 *   <designId>/preview.<ext>        preview global LIMPIO (admin / snapshots)
 *   <designId>/preview-wm.webp      preview global CON watermark (exhibición)
 *   <designId>/pages/NN.webp        página por unidad LIMPIA (01-based, pad 2)
 *   <designId>/wm/pages/NN.webp     página por unidad CON watermark
 *   <designId>/thumb.webp           miniatura representativa CON watermark
 *                                   (primera unidad/página legible ≤800 px; sin
 *                                   páginas, el preview global reducido)
 *
 * Qué superficie muestra qué versión (decisión de producto 2026-10-13):
 *   - Carrito, "Ver diseño", Mis diseños, /d/<token> + OG, cotización pública,
 *     checkout gracias, pedido público y mi-cuenta pedidos → WATERMARK.
 *   - Canvas de edición en vivo y vistas 3D → LIMPIOS (son locales).
 *   - Admin y producción (production-assets, privado) → LIMPIOS siempre.
 *   - Borradores (draft-preview.<ext>) → sin watermark (solo los ve el dueño).
 *
 * Fallbacks: sin previewWatermarkedAt la superficie cae al preview limpio
 * (diseños anteriores al backfill o fallo best-effort del pipeline); sin
 * previewPagesCount el "Ver" paginado cae al preview global watermarked.
 *
 * Módulo PURO (sin server-only ni sharp): lo importan server components,
 * features y tests por igual.
 */

/** Tope de páginas por unidad aceptadas en el upload (un diseño no pasa de esto). */
export const PREVIEW_PAGES_MAX = 24;

/** Borde largo de la miniatura representativa (thumb.webp). */
export const PREVIEW_THUMB_MAX_EDGE_PX = 800;

/** Número de página formateado como en Storage: 01-based, pad 2 ("01"…"24"). */
export function previewPageFileStem(pageNumber: number): string {
  return String(Math.trunc(pageNumber)).padStart(2, "0");
}

// ──────────── Paths dentro del bucket design-previews ────────────

export function designPreviewWmPath(designId: string): string {
  return `${designId}/preview-wm.webp`;
}

export function designPreviewThumbPath(designId: string): string {
  return `${designId}/thumb.webp`;
}

/** Path de la página LIMPIA de una unidad (pageNumber 01-based). */
export function designPreviewPagePath(designId: string, pageNumber: number): string {
  return `${designId}/pages/${previewPageFileStem(pageNumber)}.webp`;
}

/** Path de la página CON watermark de una unidad (pageNumber 01-based). */
export function designPreviewWmPagePath(designId: string, pageNumber: number): string {
  return `${designId}/wm/pages/${previewPageFileStem(pageNumber)}.webp`;
}

/**
 * TODOS los paths derivados del preview de un diseño (los que no viven en una
 * columna): los usa purgeDesignBatch para que la purga de retención borre los
 * mismos bytes que el pipeline creó. pagesCount null/0 → sin páginas.
 */
export function designPreviewDerivedPaths(
  designId: string,
  pagesCount?: number | null,
): string[] {
  const paths = [designPreviewWmPath(designId), designPreviewThumbPath(designId)];
  const n = Math.min(PREVIEW_PAGES_MAX, Math.max(0, Math.trunc(pagesCount ?? 0) || 0));
  for (let p = 1; p <= n; p++) {
    paths.push(designPreviewPagePath(designId, p), designPreviewWmPagePath(designId, p));
  }
  return paths;
}

// ──────────── URLs públicas derivadas de Design.previewUrl ────────────

/**
 * Base pública del preview ("…/design-previews/<designId>/") a partir de
 * Design.previewUrl. null si la URL no sigue la convención (<id>/preview.<ext>)
 * — diseños históricos raros degradan al preview limpio tal cual.
 */
export function designPreviewBaseFromUrl(previewUrl: string): string | null {
  const idx = previewUrl.lastIndexOf("/preview.");
  if (idx === -1) return null;
  return `${previewUrl.slice(0, idx)}/`;
}

export function designPreviewWmUrl(previewUrl: string): string | null {
  const base = designPreviewBaseFromUrl(previewUrl);
  return base ? `${base}preview-wm.webp` : null;
}

export function designPreviewThumbUrl(previewUrl: string): string | null {
  const base = designPreviewBaseFromUrl(previewUrl);
  return base ? `${base}thumb.webp` : null;
}

/** URLs de las páginas CON watermark (01-based). [] si count < 1 o URL fuera de convención. */
export function designPreviewWmPageUrls(previewUrl: string, pagesCount: number): string[] {
  const base = designPreviewBaseFromUrl(previewUrl);
  const n = Math.min(PREVIEW_PAGES_MAX, Math.trunc(pagesCount) || 0);
  if (!base || n < 1) return [];
  return Array.from({ length: n }, (_, i) => `${base}wm/pages/${previewPageFileStem(i + 1)}.webp`);
}

/** Subconjunto del Design que la selección de exhibición necesita. */
export type DesignPreviewArtifactState = {
  previewUrl: string | null;
  /** Sello de que existen preview-wm.webp + thumb.webp (null = no generados). */
  previewWatermarkedAt: Date | null;
  /** Páginas por unidad subidas (null/≤1 = sin pager — el global ya alcanza). */
  previewPagesCount?: number | null;
};

export type DesignPreviewDisplay = {
  /** URL a EXHIBIR del diseño (watermark cuando existe; limpio como fallback). */
  displayUrl: string;
  /** Miniatura representativa (watermark, primera unidad legible) o fallback. */
  thumbUrl: string;
  /** Páginas watermark por unidad para el "Ver" paginado; null = imagen única. */
  pageUrls: string[] | null;
  /** true cuando lo exhibido lleva marca de agua (para mostrar el aviso). */
  watermarked: boolean;
};

/**
 * Selección de exhibición con watermark (decisión 2026-10-13): prefiere las
 * versiones watermark y cae al preview limpio cuando no existen. null si el
 * diseño no tiene preview.
 */
export function designPreviewDisplay(
  design: DesignPreviewArtifactState,
): DesignPreviewDisplay | null {
  if (!design.previewUrl) return null;
  const hasWm = design.previewWatermarkedAt !== null;
  const wmUrl = hasWm ? designPreviewWmUrl(design.previewUrl) : null;
  const thumbUrl = hasWm ? designPreviewThumbUrl(design.previewUrl) : null;
  // Las páginas (siempre watermark por convención de paths) se rigen por su
  // propio sello: llegan en un request posterior al finalize, así que su
  // existencia es independiente de la del preview-wm global.
  const pages =
    (design.previewPagesCount ?? 0) > 1
      ? designPreviewWmPageUrls(design.previewUrl, design.previewPagesCount!)
      : [];
  return {
    displayUrl: wmUrl ?? design.previewUrl,
    thumbUrl: thumbUrl ?? wmUrl ?? design.previewUrl,
    pageUrls: pages.length > 1 ? pages : null,
    watermarked: wmUrl !== null || pages.length > 1,
  };
}
