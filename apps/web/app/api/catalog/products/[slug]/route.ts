/*
 * GET /api/catalog/products/[slug] — Detalle completo de un producto.
 *
 * Devuelve TODO el contexto que el bot WhatsApp Fase 5+ necesita:
 *   - richDescription (markdown 300-800 palabras)
 *   - whyChooseThis (bullets)
 *   - idealFor (array escenarios)
 *   - physicalSpecs (material, peso, empaque, incluye)
 *   - warranty + tiempos producción/envío
 *   - variants con description ("¿por qué elegir esta?")
 *   - templates (EDITABLE para estudio + PREMADE para compra directa)
 *   - ocasiones con rationale
 *
 * PLAN_CATALOG_V2 ADR-038 + 4.9 + 5.10.
 */

import { NextResponse } from "next/server";
import { getCatalogProductDetail } from "@/lib/catalog";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const allowed = await rateLimit(`catalog_product_detail:${ip}`, 60, 60);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const { slug } = await params;
  const product = await getCatalogProductDetail(slug);

  if (!product) {
    return NextResponse.json(
      { error: "Product not found", slug },
      { status: 404, headers: { "Access-Control-Allow-Origin": "*" } },
    );
  }

  return NextResponse.json(
    { product, generatedAt: new Date().toISOString() },
    {
      headers: {
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}
