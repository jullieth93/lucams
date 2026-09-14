/*
 * Latido de backups (N-19a, auditoría 2026-09-11) — NO es un job pg_cron.
 *
 * Su consumidor es GitHub ACTIONS: el workflow backup.yml hace POST acá tras un
 * backup exitoso a R2, y esta ruta hace upsert de AlertState["backup:last-success"]
 * (mismo mecanismo de AlertState que los heartbeats de crons — cron-heartbeat.ts).
 * Antes el backup corría fuera de la app y su salud era invisible desde el panel:
 * un backup roto solo se veía en la pestaña Actions de GitHub. Ahora:
 *   - la regla backup_stale (features/observability/alerts.ts) alerta en el centro
 *     de notificaciones si pasan >36h sin latido, y
 *   - /admin/observability muestra el tile "Backup diario a R2".
 *
 * Protegido por CRON_SECRET (header `x-cron-secret`, timing-safe — nunca en la URL,
 * para no filtrarlo en logs), igual que los crons pg_cron. En ambientes detrás de
 * Vercel Authentication el workflow añade `x-vercel-protection-bypass` (mismo patrón
 * que los smokes CI con VERCEL_BYPASS_TOKEN).
 *
 * Body JSON opcional: { "detail": "<llave del dump subido>" } — queda en
 * AlertState.lastDetail como trazabilidad (nunca secretos).
 */

import type { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { recordBackupHeartbeat } from "@/features/observability/cron-heartbeat";
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

  // El body es opcional y best-effort: un body ausente/inválido NO bloquea el latido.
  let detail: string | undefined;
  try {
    const body = (await req.json()) as { detail?: unknown };
    if (typeof body?.detail === "string" && body.detail.trim()) {
      detail = body.detail.trim().slice(0, 200);
    }
  } catch {
    detail = undefined;
  }

  try {
    // Si el upsert falla, respondemos 500 A PROPÓSITO: el workflow sale ROJO y el
    // fallo se ve en GitHub el mismo día (un "ok" falso solo lo delataría la alerta
    // backup_stale 36h después).
    await recordBackupHeartbeat(detail);
    return Response.json({ ok: true });
  } catch (err) {
    logger.error({
      event: "cron.backup_heartbeat.fail",
      err: err instanceof Error ? err.message : String(err),
    });
    await captureServerError({
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      routePath: "/api/cron/backup-heartbeat",
      routeType: "cron",
    });
    return Response.json({ ok: false, error: "internal" }, { status: 500 });
  }
}
