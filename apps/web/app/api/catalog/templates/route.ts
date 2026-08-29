/*
 * GET /api/catalog/templates?productSlug=<slug>&mode=EDITABLE|PREMADE
 *
 * Templates asociadas a un producto. Filtrable por mode.
 *   - EDITABLE: cliente selecciona en estudio + completa con datos.
 *   - PREMADE: diseño ya impreso, cliente compra tal cual.
 *
 * PLAN_CATALOG_V2 ADR-038 + 5.10.
 */

import { NextResponse } from "next/server";
import { listTemplatesByProduct } from "@/lib/catalog";
import { rateLimit } from "@/lib/rate-limit";
import { ipKey } from "@/lib/rate-limit-keys";
import { getClientIp } from "@/lib/client-ip";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ip = getClientIp(req.headers);
  const { allowed } = await rateLimit(ipKey("catalog_templates", ip), 60, 60);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const url = new URL(req.url);
  const productSlug = url.searchParams.get("productSlug");
  const modeRaw = url.searchParams.get("mode");
  const mode =
    modeRaw === "EDITABLE" || modeRaw === "PREMADE"
      ? (modeRaw as "EDITABLE" | "PREMADE")
      : undefined;

  if (!productSlug) {
    return NextResponse.json({ error: "productSlug query param required" }, { status: 400 });
  }

  const templates = await listTemplatesByProduct(productSlug, mode);

  return NextResponse.json(
    {
      templates,
      count: templates.length,
      productSlug,
      mode,
      generatedAt: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    },
  );
}
