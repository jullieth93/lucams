/*
 * Latido del monitor EXTERNO de uptime — NO es un job pg_cron de ESTA base.
 *
 * Su productor es el job `uptime-monitor-prd` que corre en el proyecto SUPABASE
 * DE STG (scripts/monitor-uptime-stg.sql; decisión Lucy 2026-09-14: sin SaaS,
 * sin Actions y sin depender de la VM de desarrollo): sondea los 5 healthchecks
 * de PRD cada 10 min (lote asíncrono de 2 fases) y hace POST acá con el resumen.
 * Esta ruta hace upsert de AlertState["uptime-monitor:last-run"] (mismo
 * mecanismo que los heartbeats de crons y del backup — cron-heartbeat.ts):
 *   - /admin/observability muestra el tile «Monitor externo (Supabase STG)»,
 *   - la regla uptime_monitor_stale (features/observability/alerts.ts) alerta si
 *     pasan >30 min sin corrida (job o proyecto STG caídos = sin monitor externo), y
 *   - la regla uptime_monitor_failing alerta si la última corrida reportó fallas
 *     persistentes (probes de PRD caídos — complementa el email Resend del job).
 *
 * Protegido por CRON_SECRET (header `x-cron-secret`, timing-safe — nunca en la
 * URL), igual que los demás endpoints /api/cron/*.
 *
 * Body JSON: { "detail": "OK 5/5" | "FALLA n/5: /api/health/x, …" } — queda en
 * AlertState.lastDetail como trazabilidad (nunca secretos; nunca URLs firmadas).
 */

import type { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { recordMonitorHeartbeat } from "@/features/observability/cron-heartbeat";
import { logger } from "@/lib/logger";
import { captureServerError } from "@/lib/error-capture";

export const dynamic = "force-dynamic";

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

  let detail: string | undefined;
  try {
    const body = (await req.json()) as { detail?: unknown };
    if (typeof body?.detail === "string" && body.detail.trim()) {
      detail = body.detail.trim().slice(0, 300);
    }
  } catch {
    detail = undefined;
  }

  try {
    // Si el upsert falla, respondemos 500 A PROPÓSITO: el script de la VM lo
    // loguea como error y uptime_monitor_stale lo delata a los 30 min.
    await recordMonitorHeartbeat(detail);
    return Response.json({ ok: true });
  } catch (err) {
    logger.error({
      event: "cron.monitor_heartbeat.fail",
      err: err instanceof Error ? err.message : String(err),
    });
    await captureServerError({
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      routePath: "/api/cron/monitor-heartbeat",
      routeType: "cron",
    });
    return Response.json({ ok: false, error: "internal" }, { status: 500 });
  }
}
