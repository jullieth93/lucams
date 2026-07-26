/*
 * GET /api/catalog/categories — Árbol jerárquico cat → sub-cats.
 *
 * PLAN_CATALOG_V2 ADR-038. Cache HTTP 1h + rate-limit 30/min.
 * Consumido por: storefront mega-menú + bot WhatsApp Fase 5+.
 */

import { NextResponse } from "next/server";
import { getCategoryTree } from "@/lib/catalog";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/client-ip";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ip = getClientIp(req.headers);
  const { allowed } = await rateLimit(`catalog_categories:${ip}`, 30, 60);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const tree = await getCategoryTree();

  return NextResponse.json(
    { categories: tree, generatedAt: new Date().toISOString() },
    {
      headers: {
        "Cache-Control": "public, max-age=3600, s-maxage=3600"
      }
    },
  );
}
