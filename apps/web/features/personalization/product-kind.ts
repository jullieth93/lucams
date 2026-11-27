/*
 * Resolución ÚNICA del tipo de producto del Estudio (Paquete D, 2026-10-02).
 *
 * Extraído a `features/personalization/product-kind.ts` (módulo puro compartido
 * por server y cliente: Estudio, carrito, checkout, pedidos y mi-cuenta; Fase 5 · #19).
 */

/**
 * Tag de galería efectivo del producto: el `galleryTag` explícito del schema
 * de personalización si existe; si no, el SLUG del producto (misma convención
 * que listGalleryTagOptions del admin y design-gallery).
 */
export function resolveGalleryTag(schema: unknown, slug: string): string {
  const explicit = (schema as { galleryTag?: unknown } | null)?.galleryTag;
  return typeof explicit === "string" ? explicit : slug;
}

/**
 * ¿Producto SEPARADOR (bookmark)? Su vista inmersiva es un LIBRO, no la
 * nevera (SEP1). Cubre "separadores", "separadores-magneticos",
 * "separadores-alargados" y slugs de la familia ("separadores-largos"…).
 */
export function isBookmarkGalleryTag(galleryTag: string): boolean {
  return galleryTag.startsWith("separadores");
}
