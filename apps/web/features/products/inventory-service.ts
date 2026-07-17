/*
 * Inventory service — vistas agregadas de stock cross-product.
 *
 * Lucy 2026-06-26 — Opción C Sprint 1: el flujo más roto del admin era
 * "saber qué se está agotando HOY". Antes había que abrir 9 productos uno
 * por uno; dashboard mentía con `0` hardcoded. Este service expone:
 *
 *  - listVariantsAcrossProducts(opts): tabla cross-product con filtros
 *    (stock status, categoría, búsqueda, sort). Usado por /admin/inventario.
 *  - getInventorySummary(): counts por status (out/low/ok/total) para KPIs
 *    de dashboard + KPI strip de /admin/inventario.
 *
 * Reusa stock-constants.ts (LOW_STOCK_THRESHOLD = 5) para clasificación.
 */

import "server-only";
import { Prisma, prisma } from "@/lib/db";
import { LOW_STOCK_THRESHOLD, type StockStatus } from "./stock-constants";

const INVENTORY_PAGE_SIZE = 50;

export type InventoryStatusFilter = "all" | "out" | "low" | "ok";
export type InventorySortKey = "stock-asc" | "stock-desc" | "product-asc" | "recent";

export type InventoryListOpts = {
  status?: InventoryStatusFilter;
  categoryId?: string;
  q?: string;
  sort?: InventorySortKey;
  page?: number;
  pageSize?: number;
};

export type InventoryRow = {
  variantId: string;
  variantName: string;
  variantSku: string;
  stock: number;
  status: StockStatus;
  productId: string;
  productName: string;
  productSlug: string;
  categoryName: string;
  isProductActive: boolean;
  variantAttributes: Prisma.JsonValue | null;
};

export type InventorySummary = {
  outCount: number;
  lowCount: number;
  okCount: number;
  totalVariants: number;
  totalUnits: number;
};

/**
 * Lista variantes activas (no soft-deleted) de productos no archivados,
 * agregadas con info del producto + categoría. Filtros y sort en SQL.
 *
 * Diseñado para vista cross-product (catálogo total = 22 variants hoy,
 * ~100-200 al lanzar). Sin paginación inicial paginación amigable
 * (page=1, pageSize=50) es suficiente.
 *
 * Búsqueda: matchea name producto, SKU producto, name variant, SKU variant
 * — todo case-insensitive.
 */
export async function listVariantsAcrossProducts(opts: InventoryListOpts = {}): Promise<{
  rows: InventoryRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  summary: InventorySummary;
}> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = opts.pageSize ?? INVENTORY_PAGE_SIZE;
  const status = opts.status ?? "all";
  const sort = opts.sort ?? "stock-asc";

  // Construir WHERE clause para variants.
  // - Variant no soft-deleted
  // - Producto no soft-deleted (Lucy puede ver inventario de productos pausados,
  //   pero NO de productos en papelera — esos no se venden ni se reponen)
  const where: Prisma.ProductVariantWhereInput = {
    deletedAt: null,
    product: {
      deletedAt: null,
      ...(opts.categoryId ? { categoryId: opts.categoryId } : {}),
    },
  };

  // Filtro por estado de stock — traducimos status a rango numérico.
  if (status === "out") {
    where.stock = { lte: 0 };
  } else if (status === "low") {
    where.stock = { gt: 0, lte: LOW_STOCK_THRESHOLD };
  } else if (status === "ok") {
    where.stock = { gt: LOW_STOCK_THRESHOLD };
  }

  // Búsqueda libre — matchea variant.name, variant.sku, product.name, product.sku.
  if (opts.q && opts.q.trim()) {
    const q = opts.q.trim();
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { sku: { contains: q, mode: "insensitive" } },
      { product: { name: { contains: q, mode: "insensitive" } } },
      { product: { sku: { contains: q, mode: "insensitive" } } },
    ];
  }

  // Orden — stock-asc por default (los más críticos primero).
  const orderBy: Prisma.ProductVariantOrderByWithRelationInput[] = (() => {
    switch (sort) {
      case "stock-asc":
        return [{ stock: "asc" }, { product: { name: "asc" } }];
      case "stock-desc":
        return [{ stock: "desc" }, { product: { name: "asc" } }];
      case "product-asc":
        return [{ product: { name: "asc" } }, { stock: "asc" }];
      case "recent":
        return [{ updatedAt: "desc" }];
    }
  })();

  const [items, total, summary] = await Promise.all([
    prisma.productVariant.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        name: true,
        sku: true,
        stock: true,
        attributes: true,
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
            isActive: true,
            category: { select: { name: true } },
          },
        },
      },
    }),
    prisma.productVariant.count({ where }),
    // Summary calculado SIEMPRE sobre el universo total (no afectado por
    // filtros) — Lucy quiere ver "tengo N agotados en TOTAL" no "en este filtro".
    getInventorySummary(),
  ]);

  const rows: InventoryRow[] = items.map((v) => ({
    variantId: v.id,
    variantName: v.name,
    variantSku: v.sku,
    stock: v.stock,
    status: classifyStock(v.stock),
    productId: v.product.id,
    productName: v.product.name,
    productSlug: v.product.slug,
    categoryName: v.product.category?.name ?? "—",
    isProductActive: v.product.isActive,
    variantAttributes: v.attributes,
  }));

  return {
    rows,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    summary,
  };
}

/**
 * Resumen agregado del inventario completo (sin filtros): cuántos agotados,
 * bajos, ok + totales. Usado por:
 *  - KPI strip en /admin/inventario (header)
 *  - Dashboard OpsCard "Productos sin stock" (cuenta variants agotadas)
 *
 * Una sola query con groupBy (más eficiente que 3 counts separados).
 */
export async function getInventorySummary(): Promise<InventorySummary> {
  // Agrupamos contando variants activas con su stock. Hacemos UN query y
  // clasificamos en aplicación — más simple que múltiples queries con WHERE
  // numérico para cada bucket.
  const activeVariants = await prisma.productVariant.findMany({
    where: {
      deletedAt: null,
      product: { deletedAt: null },
    },
    select: { stock: true },
  });

  let outCount = 0;
  let lowCount = 0;
  let okCount = 0;
  let totalUnits = 0;
  for (const v of activeVariants) {
    totalUnits += Math.max(0, v.stock);
    const status = classifyStock(v.stock);
    if (status === "out") outCount++;
    else if (status === "low") lowCount++;
    else okCount++;
  }
  return {
    outCount,
    lowCount,
    okCount,
    totalVariants: activeVariants.length,
    totalUnits,
  };
}

/**
 * Lista categorías para el filtro select de /admin/inventario.
 * Solo categorías activas + con al menos 1 producto activo (no soft-deleted).
 */
export async function listCategoriesForInventoryFilter(): Promise<
  Array<{ id: string; name: string }>
> {
  return prisma.category.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      products: { some: { deletedAt: null } },
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

/** Helper local — clasifica stock sin importar de stock-constants (evita ciclo). */
function classifyStock(stock: number): StockStatus {
  if (stock <= 0) return "out";
  if (stock <= LOW_STOCK_THRESHOLD) return "low";
  return "ok";
}
