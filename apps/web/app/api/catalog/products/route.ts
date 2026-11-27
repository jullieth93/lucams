/*
 * GET /api/catalog/products — Lista paginada filtrable.
 *
 * Query params:
 *   - categoria=<slug>       Filtrar por categoría raíz (incluye sub-cats hijas).
 *   - subcategoria=<slug>    Filtrar por sub-categoría específica.
 *   - ocasion=<slug>         Filtrar por OcasionTag.
 *   - priceMin=<int>         Mínimo precio (COP centavos).
 *   - priceMax=<int>         Máximo precio (COP centavos).
 *   - isPersonalizable=<0|1> 1 = solo personalizables, 0 = solo prediseñados.
 *   - sort=recent|price_asc|price_desc|featured
 *   - limit=<int>            Default 24, max 100.
 *   - offset=<int>           Default 0.
 *
 * PLAN_CATALOG_V2 ADR-038. Cache 5 min + rate-limit 30/min.
 */

import { NextResponse } from "next/server";
import { MAX_PRICE_CENTS } from "@/features/products/price-filter";
import { countCatalogProducts, listCatalogProducts, type ProductListFilters } from "@/lib/catalog";
import { rateLimit } from "@/lib/rate-limit";
import { ipKey } from "@/lib/rate-limit-keys";
import { getClientIp } from "@/lib/client-ip";

export const dynamic = "force-dynamic";

// Guard de enteros no negativos acotados a INT4 (C-10 + Fase 5 #10):
// parseInt("abc") → NaN y valores > MAX_PRICE_CENTS provocarían PrismaClientValidationError.
const toInt = (v: string | null): number | undefined => {
  if (!v) return undefined;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 && n <= MAX_PRICE_CENTS ? n : undefined;
};

export async function GET(req: Request) {
  const ip = getClientIp(req.headers);
  const { allowed } = await rateLimit(ipKey("catalog_products", ip), 30, 60);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const url = new URL(req.url);
  const sp = url.searchParams;

  const sortRaw = sp.get("sort");
  const validSorts = ["recent", "price_asc", "price_desc", "featured", "most_purchased"] as const;
  const sort = validSorts.includes(sortRaw as (typeof validSorts)[number])
    ? (sortRaw as ProductListFilters["sort"])
    : undefined;

  const filters: ProductListFilters = {
    categorySlug: sp.get("categoria") ?? undefined,
    subCategorySlug: sp.get("subcategoria") ?? undefined,
    ocasionSlug: sp.get("ocasion") ?? undefined,
    priceMin: toInt(sp.get("priceMin")),
    priceMax: toInt(sp.get("priceMax")),
    isPersonalizable: sp.get("isPersonalizable") ? sp.get("isPersonalizable") === "1" : undefined,
    sort,
    limit: Math.max(1, Math.min(100, parseInt(sp.get("limit") ?? "24", 10) || 24)),
    // Tope superior (auditoría 2026-08-24, C-7): los filtros son la cache-key de
    // listCatalogProducts (unstable_cache) — offsets arbitrarios generaban entradas
    // de caché basura que igual pegan a la DB (skip profundo = scan costoso).
    offset: Math.min(10_000, Math.max(0, parseInt(sp.get("offset") ?? "0", 10) || 0)),
  };

  const [products, total] = await Promise.all([
    listCatalogProducts(filters),
    countCatalogProducts(filters),
  ]);

  return NextResponse.json(
    {
      products,
      count: products.length,
      total,
      filters,
      generatedAt: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=300",
      },
    },
  );
}
