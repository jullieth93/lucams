/*
 * Gate de visibilidad storefront — FUENTE ÚNICA DE VERDAD (F-04 / A4-02, cert
 * 2026-09-26).
 *
 * Este módulo concentra el predicado "¿se ve este producto en la tienda?" en
 * sus dos formas, para que los DOS stacks de catálogo y el indicador del admin
 * no puedan divergir:
 *
 *   1. STOREFRONT_PRODUCT_WHERE / STOREFRONT_CATEGORY_WHERE — fragmentos Prisma
 *      para las queries de DB. Los consumen AMBOS stacks:
 *        - Stack SSR: features/products/public-service.ts (STOREFRONT_WHERE)
 *        - Stack AI-ready: lib/catalog.ts (listCatalogProducts, searchCatalog,
 *          recommendProducts, getCatalogFilters, …)
 *      Regla: un producto es visible si no está archivado (deletedAt null),
 *      está activo (isActive) y su CATEGORÍA también (una categoría pausada o
 *      archivada esconde todos sus productos del storefront).
 *      (Las queries $queryRaw — searchCatalog/searchStorefrontProducts — no
 *      pueden consumir el fragmento; replican el mismo gate con el JOIN a
 *      "Category" y quedan cubiertas por el test de integración del gate.)
 *
 *   2. getStorefrontVisibility — clasificador PURO (sin DB, sin next/*) para el
 *      admin (listado + ficha): el badge "Activo" solo refleja product.isActive,
 *      pero una categoría pausada/archivada o quedarse sin opciones activas
 *      también esconden el producto de la tienda — y Lucy no tenía forma de
 *      verlo. Replica la semántica del fragmento + las reglas de la PDP
 *      (getStorefrontProductBySlug): las opciones se filtran con
 *      deletedAt: null, isActive: true, e inStock = alguna opción activa con
 *      stock > 0 (si ninguna tiene, el producto SIGUE visible con el aviso
 *      "Agotado").
 *
 * Si el gate cambia, se cambia ACÁ y los tests de este módulo +
 * storefront-visibility.integration.test.ts lo verifican en ambos stacks.
 */

/**
 * Predicado Prisma del gate de visibilidad storefront sobre Product.
 * `as const`: se esparce en los `where` de ambos stacks de catálogo.
 */
export const STOREFRONT_PRODUCT_WHERE = {
  deletedAt: null,
  isActive: true,
  category: { deletedAt: null, isActive: true },
} as const;

/** Predicado Prisma del gate sobre Category (categoría visible en storefront). */
export const STOREFRONT_CATEGORY_WHERE = { deletedAt: null, isActive: true } as const;

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
