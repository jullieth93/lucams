/*
 * GET /api/designs/<designId>/render-status — progreso REAL del render de producción
 * asíncrono (ADR-131, 2026-10-13).
 *
 * El Estudio lo pollea mientras finalize + add-to-cart completan, para mostrar "Preparando
 * página X de N…" en vez de dejar al cliente esperando "Guardando…" a ciegas (el síntoma del
 * incidente STG 2026-10). Respuesta mínima y sin PII: estado del job + contadores. Ownership
 * por las mismas cookies que el Estudio (customerId logueado / sessionId anónimo): un id
 * ajeno responde 404, igual que un diseño inexistente (sin oráculo de ids).
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getCurrentCustomer } from "@/lib/auth";
import { peekCartSession } from "@/lib/cart-session";
import { getClientIp } from "@/lib/client-ip";
import { rateLimit } from "@/lib/rate-limit";
import { ipKey } from "@/lib/rate-limit-keys";
import { getOwnedDesign } from "@/features/personalization/service";
import { getRenderJobProgress } from "@/features/personalization/render-job-service";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ designId: string }> }) {
  const rl = await rateLimit(
    ipKey("render_status", getClientIp(await headers())),
    process.env.VERCEL_ENV === "production" ? 120 : 600,
    600,
  );
  if (!rl.allowed) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  const { designId } = await ctx.params;
  if (!designId || designId.length > 64) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const session = await getCurrentCustomer();
  const customerId = session?.customer.id ?? null;
  const sessionId = customerId ? null : await peekCartSession();
  const design = await getOwnedDesign(designId, { customerId, sessionId });
  if (!design) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  const job = await getRenderJobProgress(design.id);
  return NextResponse.json({
    ok: true,
    designStatus: design.status,
    productionReady: design.productionUrls.length > 0,
    job: job
      ? {
          status: job.status,
          totalUnits: job.totalUnits,
          doneUnits: job.doneUnits,
        }
      : null,
  });
}
