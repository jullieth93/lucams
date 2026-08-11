/*
 * Helper puro — ¿se ve este producto en la tienda?
 *
 * Replica la semántica EXACTA del gate del storefront (fuente de verdad):
 *   features/products/public-service.ts
 *     STOREFRONT_WHERE = { deletedAt: null, isActive: true,
 *                          category: { deletedAt: null, isActive: true } }
 *   y de la PDP (getStorefrontProductBySlug):
 *     - las opciones se filtran con deletedAt: null, isActive: true
 *     - inStock = alguna opción activa con stock > 0; si ninguna tiene,
 *       el producto SIGUE visible pero se muestra con el aviso "Agotado".
 *
 * Existe para el admin (listado + ficha): el badge "Activo" solo refleja
 * product.isActive, pero una categoría pausada/archivada o quedarse sin
 * opciones activas también esconden el producto de la tienda — y Lucy no
 * tenía forma de verlo. Si el gate del storefront cambia, actualizar este
 * helper y sus tests a la par.
 *
 * Es puro (sin DB, sin next/*) → testeable unitario y usable desde server
 * components sin costo.
 */

export type StorefrontVisibilityInput = {
  /** product.isActive — false = "pausado" en el copy del admin. */
  productIsActive: boolean;
  /** product.deletedAt — distinto de null = archivado (papelera). */
  productDeletedAt: Date | null;
  /** isActive de la categoría del producto. */
  categoryIsActive: boolean;
  /** deletedAt de la categoría del producto. */
  categoryDeletedAt: Date | null;
  /** Nº de opciones con deletedAt=null E isActive=true (las que mostraría la PDP). */
  activeVariantCount: number;
  /** ¿Alguna de esas opciones activas tiene stock > 0? */
  inStockAny: boolean;
};

export type StorefrontVisibilityStatus = "visible" | "visible-agotado" | "no-visible";

export type StorefrontVisibility =
  | { status: "visible" }
  | { status: "visible-agotado"; reason: string }
  | { status: "no-visible"; reason: string };

/**
 * Clasifica la visibilidad del producto en la tienda.
 *
 * Cuando hay varias causas a la vez, gana la PRIMERA de este orden (de lo más
 * cercano al producto a lo más externo): papelera → pausa → categoría →
 * opciones → stock. Es la razón que el admin debe resolver primero.
 */
export function getStorefrontVisibility(input: StorefrontVisibilityInput): StorefrontVisibility {
  if (input.productDeletedAt !== null) {
    return { status: "no-visible", reason: "Producto archivado" };
  }
  if (!input.productIsActive) {
    return { status: "no-visible", reason: "Producto pausado" };
  }
  if (input.categoryDeletedAt !== null) {
    return { status: "no-visible", reason: "Categoría archivada" };
  }
  if (!input.categoryIsActive) {
    return { status: "no-visible", reason: "Categoría pausada" };
  }
  if (input.activeVariantCount === 0) {
    return { status: "no-visible", reason: "Sin opciones activas" };
  }
  if (!input.inStockAny) {
    return { status: "visible-agotado", reason: "Visible con todas las opciones agotadas" };
  }
  return { status: "visible" };
}
