/*
 * Resolución ÚNICA del tipo de producto del Estudio (Paquete D, 2026-10-02).
 *
 * Antes cada consumidor leía `personalizationSchema.galleryTag` a su manera:
 * page.tsx caía al SLUG cuando no había tag explícito (ADR-057 B2, default-on)
 * pero studio-editor leía solo el tag explícito → un producto separador SIN
 * galleryTag en BD (datos de STG) no se detectaba como separador en el editor
 * y perdía su vista 3D de libro. De acá salen el tag efectivo y el flag
 * "es separador" para AMBOS lados (server y cliente — módulo puro, sin deps).
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
