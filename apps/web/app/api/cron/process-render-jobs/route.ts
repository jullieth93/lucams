/*
 * Cron de render asíncrono (ADR-131, 2026-10-13): procesa los RenderJob PENDING de la cola de
 * producción — los PNG 300 DPI que antes se renderizaban DENTRO de la Server Action de
 * finalize (un set de calendario ×3 = 36 páginas contra maxDuration=60 → 500/504 y el cliente
 * esperando a ciegas). Corre página por página con presupuesto de tiempo, progreso real
 * (doneUnits) y reintentos acotados (FAILED → ErrorLog); lo agendado lo reanuda desde donde
 * quedó si un tick muere a la mitad (lease de PROCESSING).
 *
 * Se agenda con pg_cron cada minuto (migración supabase 041, lee cron_base_url/cron_secret del
 * Vault — misma convención que 015/032/035). El finalize además dispara un "kick" acotado
 * (RENDER_JOB_KICK_BUDGET_MS) para que diseños chicos terminen dentro del propio request; este
 * cron es la red que completa los grandes y reintenta los fallidos. Protegido por CRON_SECRET
 * (header `x-cron-secret`) como los demás /api/cron/*.
 */

import type { NextRequest } from "next/server";
import {
  processRenderJobs,
  RENDER_JOB_CRON_BUDGET_MS,
} from "@/features/personalization/render-job-service";
import { logger } from "@/lib/logger";
import { captureServerError } from "@/lib/error-capture";
import { recordCronHeartbeat } from "@/features/observability/cron-heartbeat";
import { notifyCronFailure } from "@/features/notifications/service";
import { cronSecretOk } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
// Presupuesto de la Function > presupuesto interno del worker (45s), con margen para cerrar.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const provided = req.headers.get("x-cron-secret"); // #14 solo header (?secret= queda en logs)
  if (!cronSecretOk(provided)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await processRenderJobs({ budgetMs: RENDER_JOB_CRON_BUDGET_MS });
    await recordCronHeartbeat("process-render-jobs"); // #15 dead-man switch (solo en éxito)
    return Response.json({ ok: true, ...result });
  } catch (err) {
    logger.error({
      event: "cron.process_render_jobs.fail",
      err: err instanceof Error ? err.message : String(err),
    });
    // Que el error del cron caiga en ErrorLog (alimenta errors_spike, resumen y panel).
    await captureServerError({
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      routePath: "/api/cron/process-render-jobs",
      routeType: "cron",
    });
    await notifyCronFailure("process-render-jobs", err);
    return Response.json({ ok: false, error: "internal" }, { status: 500 });
  }
}
