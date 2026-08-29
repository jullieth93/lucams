/*
 * GET /api/catalog/ocasiones/[slug] — Detalle de una ocasión específica.
 *
 * Incluye su description semántica completa + productos asociados (vía
 * /api/catalog/products?ocasion=<slug>).
 *
 * PLAN_CATALOG_V2 ADR-038.
 */

import { NextResponse } from "next/server";
import { getOcasionBySlug, listCatalogProducts } from "@/lib/catalog";
import { rateLimit } from "@/lib/rate-limit";
import { ipKey } from "@/lib/rate-limit-keys";
import { getClientIp } from "@/lib/client-ip";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const ip = getClientIp(req.headers);
  const { allowed } = await rateLimit(ipKey("catalog_ocasion_detail", ip), 30, 60);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const { slug } = await params;
  const ocasion = await getOcasionBySlug(slug);

  if (!ocasion) {
    return NextResponse.json({ error: "Ocasión not found", slug }, { status: 404 });
  }

  // Top productos de esta ocasión
  const products = await listCatalogProducts({ ocasionSlug: slug, limit: 12 });

  return NextResponse.json(
    { ocasion, products, generatedAt: new Date().toISOString() },
    {
      headers: {
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    },
  );
}
