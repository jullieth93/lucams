/*
 * Artefactos de visualización del preview de un diseño (2026-10-13).
 *
 * El finalize sube el montaje compositado LIMPIO a design-previews/<designId>/
 * preview.<ext>. PRIVACIDAD (LUC-SEC-001, 2026-10-30): el bucket deja de ser
 * público (migración 046) — los bytes solo salen por el Route Handler
 * autorizado /api/design-preview/* y las URLs que este módulo deriva apuntan
 * ahí (las URLs públicas legacy persistidas en filas viejas se CONVIERTEN al
 * handler; un GET anónimo directo al bucket muere con 404).
 *
 * Convención de paths (sin columnas extra de URL — la existencia la sellan
 * Design.previewWatermarkedAt / Design.previewPagesCount):
 *
 *   <designId>/preview.<ext>        preview global LIMPIO (dueño / admin)
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
 * Autorización (quién puede ABRIR cada variante — preview-access.ts):
 *   - Limpios y borradores: dueño (cookie/cuenta) o admin. NUNCA por token.
 *   - Watermark: dueño/admin o capacidad por token (st=share, qt=cotización,
 *     ot=pedido) — las superficies públicas la pasan por `capability`.
 *
 * Fallbacks: sin previewWatermarkedAt la superficie cae al preview limpio
 * (visible solo para dueño/admin — en superficies por token la imagen no
 * carga, fail-closed); sin previewPagesCount el "Ver" paginado cae al global.
 *
 * Módulo PURO (sin server-only ni sharp): lo importan server components,
 * features y tests por igual.
 */

import {
  parsePreviewStoragePath,
  previewStoragePathFromRef,
  PREVIEW_ROUTE_PREFIX,
} from "./preview-access";

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
export function designPreviewDerivedPaths(designId: string, pagesCount?: number | null): string[] {
  const paths = [designPreviewWmPath(designId), designPreviewThumbPath(designId)];
  const n = Math.min(PREVIEW_PAGES_MAX, Math.max(0, Math.trunc(pagesCount ?? 0) || 0));
  for (let p = 1; p <= n; p++) {
    paths.push(designPreviewPagePath(designId, p), designPreviewWmPagePath(designId, p));
  }
  return paths;
}

// ──────────── URLs autorizadas (Route Handler /api/design-preview/*) ────────────

/**
 * Capacidad por token para superficies públicas: `st` (share /d/<token>),
 * `qt` (cotización), `ot` (pedido). El handler solo la honra en variantes
 * watermark — un token nunca abre el preview limpio ni los borradores.
 */
export type PreviewCapability = { name: "st" | "qt" | "ot"; value: string };

function withCapability(url: string, capability?: PreviewCapability): string {
  return capability ? `${url}?${capability.name}=${encodeURIComponent(capability.value)}` : url;
}

/** URL autorizada de un path del bucket (validada contra la allowlist). */
export function designPreviewAuthorizedUrl(
  path: string,
  capability?: PreviewCapability,
): string | null {
  if (!parsePreviewStoragePath(path)) return null;
  return withCapability(`${PREVIEW_ROUTE_PREFIX}${path}`, capability);
}

/**
 * Convierte cualquier ref persistida (handler URL nueva o URL pública legacy
 * de filas anteriores a LUC-SEC-001) a la URL autorizada. null si no sigue
 * ninguna convención — una ref desconocida no se sirve (fail-closed).
 */
export function previewRefToAuthorizedUrl(
  ref: string,
  capability?: PreviewCapability,
): string | null {
  const path = previewStoragePathFromRef(ref);
  return path ? designPreviewAuthorizedUrl(path, capability) : null;
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
 * versiones watermark y cae al preview limpio cuando no existen. Todas las
 * URLs salen por el handler autorizado (el bucket ya no es público): las
 * superficies con sesión (carrito, cuenta, admin) no necesitan capability;
 * las públicas (/d/, cotización, pedido por token) la pasan para las
 * variantes watermark. null si el diseño no tiene preview o la ref no sigue
 * la convención (fail-closed: la URL vieja ya no resuelve de todos modos).
 */
export function designPreviewDisplay(
  design: DesignPreviewArtifactState,
  capability?: PreviewCapability,
): DesignPreviewDisplay | null {
  if (!design.previewUrl) return null;
  const cleanPath = previewStoragePathFromRef(design.previewUrl);
  const designId = cleanPath ? parsePreviewStoragePath(cleanPath)!.designId : null;
  if (!cleanPath || !designId) return null;
  const cleanUrl = designPreviewAuthorizedUrl(cleanPath, capability)!;
  const hasWm = design.previewWatermarkedAt !== null;
  const wmUrl = hasWm ? designPreviewAuthorizedUrl(designPreviewWmPath(designId), capability) : null;
  const thumbUrl = hasWm
    ? designPreviewAuthorizedUrl(designPreviewThumbPath(designId), capability)
    : null;
  // Las páginas (siempre watermark por convención de paths) se rigen por su
  // propio sello: llegan en un request posterior al finalize, así que su
  // existencia es independiente de la del preview-wm global.
  const pages =
    (design.previewPagesCount ?? 0) > 1
      ? Array.from(
          { length: Math.min(PREVIEW_PAGES_MAX, Math.trunc(design.previewPagesCount!)) },
          (_, i) => designPreviewAuthorizedUrl(designPreviewWmPagePath(designId, i + 1), capability)!,
        )
      : [];
  return {
    displayUrl: wmUrl ?? cleanUrl,
    thumbUrl: thumbUrl ?? wmUrl ?? cleanUrl,
    pageUrls: pages.length > 1 ? pages : null,
    watermarked: wmUrl !== null || pages.length > 1,
  };
}
