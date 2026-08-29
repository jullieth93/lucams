/*
 * GET /api/catalog/search?q=<query>&limit=<int>
 *
 * Búsqueda fuzzy pg_trgm + unaccent en name + richDescription + description.
 * Cache 5 min para queries populares.
 *
 * PLAN_CATALOG_V2 ADR-038 + 7.8.
 */

import { NextResponse } from "next/server";
import { searchCatalog } from "@/lib/catalog";
import { rateLimit } from "@/lib/rate-limit";
import { ipKey } from "@/lib/rate-limit-keys";
import { getClientIp } from "@/lib/client-ip";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ip = getClientIp(req.headers);
  const { allowed } = await rateLimit(ipKey("catalog_search", ip), 60, 60);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const url = new URL(req.url);
  // Cap de longitud (auditoría 2026-08-24, C-6): una query pg_trgm similarity() con un
  // string de varios KB por fila es cara; 120 chars sobra para búsquedas reales
  // (mismo límite que app/actions/search.ts).
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 120);
  const limit = Math.max(
    1,
    Math.min(50, parseInt(url.searchParams.get("limit") ?? "20", 10) || 20),
  );

  if (q.length < 2) {
    return NextResponse.json(
      { results: [], count: 0, query: q, message: "Query too short (min 2 chars)" },
      { status: 200 },
    );
  }

  const results = await searchCatalog(q, limit);

  return NextResponse.json(
    { results, count: results.length, query: q, generatedAt: new Date().toISOString() },
    {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=300",
      },
    },
  );
}
