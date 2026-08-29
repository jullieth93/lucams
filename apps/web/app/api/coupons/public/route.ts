/*
 * GET /api/coupons/public — Cupones vigentes públicos.
 *
 * Bot WhatsApp Fase 5+ consume y responde "Hay descuento MAMA2026 -15%
 * vigente hasta el 12 de mayo". NUNCA inventa códigos.
 *
 * Excluye:
 *   - Cupones isPublic=false (códigos privados)
 *   - Cupones expirados o no vigentes (validFrom/validTo)
 *   - Cupones soft-deleted
 *   - Cupones agotados (usedCount >= maxUses) → NO filtramos acá, el bot
 *     informa que existe + el sistema valida al aplicar.
 *
 * PLAN_CATALOG_V2 ADR-038 + 3.9.
 */

import { NextResponse } from "next/server";
import { listPublicCoupons } from "@/lib/catalog";
import { rateLimit } from "@/lib/rate-limit";
import { ipKey } from "@/lib/rate-limit-keys";
import { getClientIp } from "@/lib/client-ip";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ip = getClientIp(req.headers);
  const { allowed } = await rateLimit(ipKey("coupons_public", ip), 30, 60);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const coupons = await listPublicCoupons();

  // ADR-062 — NO hard-codear `Access-Control-Allow-Origin: *`. El proxy ya gobierna CORS de forma
  // central: 403ea orígenes de navegador no-allowlisted y firma ACAO=origin (+credentials) a los
  // permitidos. Un `*` acá es engañoso (los consumidores reales del bot son server-side, sin
  // header Origin → ni pasan por CORS) y además `*` + credentials es una combinación inválida que
  // el navegador rechaza. Se retira el header; la política central decide.
  return NextResponse.json(
    { coupons, count: coupons.length, generatedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "public, max-age=600, s-maxage=600" } },
  );
}
