/*
 * POST /api/cron/domain-watch — observación del vigilante del dominio (mensual)
 * (FASE B auditoría 2026-09-19, L-H3/L-N1: expiración y secuestro/suspensión de
 * lucamsshop.com eran invisibles).
 *
 * Productor: `.github/workflows/domain-watch.yml` (GitHub Actions, runners Azure)
 * — la alternativa pg_cron+pg_net desde Supabase se descartó el 2026-09-20:
 * Verisign/rdap.org rechazan las conexiones HTTPS salientes de pg_net (verificado
 * en vivo). El workflow consulta RDAP y POSTea acá la observación; la lógica de
 * baseline/alertas vive en features/observability/domain-watch.ts y el estado en
 * AlertState (keys `domain-watch:*`).
 *
 * Protegido por CRON_SECRET (header `x-cron-secret`, timing-safe — nunca en la
 * URL), igual que los demás endpoints /api/cron/*. El body es Zod-validado: sin
 * `rdapOk` booleano o con tipos errados → 400 (un payload malformado NO debe
 * pisar el baseline ni disparar alertas).
 *
 * Si el procesamiento falla (p.ej. DB caída) respondemos 500 A PROPÓSITO: el job
 * de GitHub sale rojo el mismo día en vez de dejar la vigilancia muda en silencio
 * (patrón backup-heartbeat). El latido `cron:domain-watch` (recordCronHeartbeat,
 * intervalo 31 días en CRON_JOBS) cierra el dead-man: si el workflow deja de correr,
 * la regla cron_stale_domain-watch lo delata a las 48 h.
 */

import type { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { processDomainObservation } from "@/features/observability/domain-watch";
import { recordCronHeartbeat } from "@/features/observability/cron-heartbeat";
import { logger } from "@/lib/logger";
import { captureServerError } from "@/lib/error-capture";

export const dynamic = "force-dynamic";

const ObservationSchema = z.object({
  rdapOk: z.boolean(),
  expiresAt: z.iso.datetime({ offset: true }).optional(),
  daysLeft: z.number().int().min(0).optional(),
  nameservers: z.array(z.string()).max(20).optional(),
  status: z.array(z.string()).max(20).optional(),
});

// Mismo chequeo que las demás rutas /api/cron/* (timing-safe, fail-closed).
function secretOk(provided: string | null): boolean {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const provided = req.headers.get("x-cron-secret"); // #14 solo header (?secret= queda en logs)
  if (!secretOk(provided)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const parsed = ObservationSchema.safeParse(body);
  if (!parsed.success) {
    logger.warn({
      event: "cron.domain_watch.bad_body",
      issues: parsed.error.issues.map((i) => i.path.join(".") || "(root)"),
    });
    return Response.json({ ok: false, error: "invalid body" }, { status: 400 });
  }

  try {
    const { alerts } = await processDomainObservation(parsed.data);
    // Latido best-effort (nunca lanza): el resumen queda en AlertState.lastDetail
    // (nunca secretos). Sin latido en 2×31 días → cron_stale_domain-watch.
    const detail = parsed.data.rdapOk
      ? `rdap ok · ${parsed.data.daysLeft ?? "?"} días · ${alerts.length} alerta(s)`
      : `rdap FALLA · ${alerts.length} alerta(s)`;
    await recordCronHeartbeat("domain-watch", detail);
    return Response.json({ ok: true, alerts });
  } catch (err) {
    logger.error({
      event: "cron.domain_watch.fail",
      err: err instanceof Error ? err.message : String(err),
    });
    await captureServerError({
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      routePath: "/api/cron/domain-watch",
      routeType: "cron",
    });
    return Response.json({ ok: false, error: "internal" }, { status: 500 });
  }
}
