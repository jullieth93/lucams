/*
 * POST /api/funnel — ingesta anónima y sin cookies del embudo tienda + Estudio ([ANA-01]).
 *
 * Seguridad y privacidad mandatoria:
 *   - Techo estricto de body (4 KB) vía `readBodyWithLimit`.
 *   - Rate-limit por IP hasheada (`ipKey("funnel", ...)`) + backstop global.
 *   - Validación Zod de lista cerrada (`FunnelPayloadSchema`): imposible persistir
 *     emails, nombres, teléfonos, tokens, IDs de sesión o mensajes libres.
 *   - NO lee cookies (`cart_session`, Supabase Auth, etc.) ni persiste IP o `user-agent`.
 *     El `user-agent` solo se evalúa en memoria si el evento no trajo `deviceCategory`
 *     y se descarta de inmediato.
 */

import { NextResponse } from "next/server";
import { readBodyWithLimit, BodyTooLargeError } from "@/lib/read-body-with-limit";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { ipKey } from "@/lib/rate-limit-keys";
import { getClientIp } from "@/lib/client-ip";
import {
  detectFunnelDeviceCategory,
  FunnelPayloadSchema,
  normalizeFunnelPayload,
} from "@/features/analytics/funnel-schema";
import { recordFunnelEvents } from "@/features/analytics/funnel-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FUNNEL_MAX_BODY_BYTES = 4 * 1024;

export async function POST(request: Request) {
  try {
    const { allowed } = await rateLimit(ipKey("funnel", getClientIp(request.headers)), 180, 60);
    if (!allowed) return NextResponse.json({ ok: false }, { status: 429 });

    const rlGlobal = await rateLimit("funnel:ingest:global", 6000, 5 * 60);
    if (!rlGlobal.allowed) return NextResponse.json({ ok: false });

    let rawBody: unknown;
    try {
      rawBody = JSON.parse(await readBodyWithLimit(request, FUNNEL_MAX_BODY_BYTES));
    } catch (err) {
      if (err instanceof BodyTooLargeError) {
        return NextResponse.json({ error: "payload too large" }, { status: 413 });
      }
      return NextResponse.json({ error: "invalid" }, { status: 400 });
    }

    const parsed = FunnelPayloadSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid" }, { status: 400 });
    }

    const fallbackDevice = detectFunnelDeviceCategory({
      userAgent: request.headers.get("user-agent"),
    });

    const events = normalizeFunnelPayload(parsed.data).map((ev) => ({
      ...ev,
      deviceCategory:
        ev.deviceCategory && ev.deviceCategory !== "unknown" ? ev.deviceCategory : fallbackDevice,
    }));

    await recordFunnelEvents(events);
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.warn(
      { event: "funnel.persist_fail", err: err instanceof Error ? err.message : String(err) },
      "Failed to persist anonymous funnel counter",
    );
    return NextResponse.json({ ok: false });
  }
}
