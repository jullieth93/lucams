/*
 * GET /api/catalog/ocasiones — Lista de 15 ocasiones activas.
 *
 * Cada ocasión incluye description semántica + monthHint + suggestedQuantityRange
 * + productCount. Bot WhatsApp Fase 5+ usa este endpoint para responder
 * "¿qué ocasiones puedo celebrar con Lucams?" y derivar a recomendaciones.
 *
 * PLAN_CATALOG_V2 ADR-038 + 1.5 + 2.10 + 3.4.
 */

import { NextResponse } from "next/server";
import { listOcasiones } from "@/lib/catalog";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const allowed = await rateLimit(`catalog_ocasiones:${ip}`, 30, 60);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const ocasiones = await listOcasiones();

  return NextResponse.json(
    { ocasiones, count: ocasiones.length, generatedAt: new Date().toISOString() },
    {
      headers: {
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}
