/*
 * GET /api/catalog/filters?categoria=<slug>&subcategoria=<slug>
 *
 * Devuelve filtros disponibles + facet count para el contexto pedido.
 * Sirve al sidebar filtros UI + al bot WhatsApp Fase 5+ que puede
 * responder "En Fotoimanes Circulares hay productos de 6/9/12 unidades
 * entre $X y $Y".
 *
 * PLAN_CATALOG_V2 ADR-038 + 7.7.
 */

import { NextResponse } from "next/server";
import { getCatalogFilters } from "@/lib/catalog";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { allowed } = await rateLimit(`catalog_filters:${ip}`, 30, 60);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const url = new URL(req.url);
  const cat = url.searchParams.get("categoria");
  const subcat = url.searchParams.get("subcategoria");

  const ctx = await getCatalogFilters(cat ?? undefined, subcat ?? undefined);

  return NextResponse.json(
    { ...ctx, generatedAt: new Date().toISOString() },
    {
      headers: {
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}
