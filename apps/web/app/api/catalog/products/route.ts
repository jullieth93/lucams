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
import { listCatalogProducts, type ProductListFilters } from "@/lib/catalog";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/client-ip";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ip = getClientIp(req.headers);
  const { allowed } = await rateLimit(`catalog_products:${ip}`, 30, 60);
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
    priceMin: sp.get("priceMin") ? parseInt(sp.get("priceMin") as string, 10) : undefined,
    priceMax: sp.get("priceMax") ? parseInt(sp.get("priceMax") as string, 10) : undefined,
    isPersonalizable: sp.get("isPersonalizable") ? sp.get("isPersonalizable") === "1" : undefined,
    sort,
    limit: Math.max(1, Math.min(100, parseInt(sp.get("limit") ?? "24", 10) || 24)),
    offset: Math.max(0, parseInt(sp.get("offset") ?? "0", 10) || 0)
  };

  const products = await listCatalogProducts(filters);

  return NextResponse.json(
    {
      products,
      count: products.length,
      filters,
      generatedAt: new Date().toISOString()
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=300"
      }
    },
  );
}
