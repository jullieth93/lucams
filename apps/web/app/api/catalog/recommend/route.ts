/*
 * GET /api/catalog/recommend — Wizard + bot recomendaciones.
 *
 * Query params:
 *   - ocasion=<slug>       Multi-valor (repetir param): ?ocasion=matrimonio&ocasion=aniversario
 *   - destinatario=<str>   "mi" | "pareja" | "familia" | "amigo" | "empresa" | "nino" | "adolescente"
 *   - precioMin=<int>      COP centavos.
 *   - precioMax=<int>
 *   - personalizable=personalizable|premade|any
 *   - exclude=<slug>       Multi-valor (productos ya en cart o PDP actual).
 *   - limit=<int>          Default 12.
 *
 * Backend compartido con wizard UI + bot. Scoring sin ML — decisión 6.2.
 *
 * PLAN_CATALOG_V2 ADR-038 + 6.7.
 */

import { NextResponse } from "next/server";
import { recommendProducts } from "@/lib/catalog";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/client-ip";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ip = getClientIp(req.headers);
  const { allowed } = await rateLimit(`catalog_recommend:${ip}`, 60, 60);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const url = new URL(req.url);
  const sp = url.searchParams;

  const ocasionSlugs = sp.getAll("ocasion");
  const excludeSlugs = sp.getAll("exclude");

  const pref = sp.get("personalizable");
  const personalizationPreference =
    pref === "personalizable" || pref === "premade" || pref === "any"
      ? (pref as "personalizable" | "premade" | "any")
      : undefined;

  const results = await recommendProducts({
    ocasionSlugs: ocasionSlugs.length > 0 ? ocasionSlugs : undefined,
    destinatario: sp.get("destinatario") ?? undefined,
    priceMin: sp.get("precioMin") ? parseInt(sp.get("precioMin") as string, 10) : undefined,
    priceMax: sp.get("precioMax") ? parseInt(sp.get("precioMax") as string, 10) : undefined,
    personalizationPreference,
    excludeSlugs: excludeSlugs.length > 0 ? excludeSlugs : undefined,
    limit: Math.min(30, parseInt(sp.get("limit") ?? "12", 10) || 12),
  });

  return NextResponse.json(
    {
      results,
      count: results.length,
      generatedAt: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "public, max-age=600, s-maxage=600",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}
