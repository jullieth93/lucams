/*
 * GET /api/health/storage — chequea Supabase Storage bucket
 * `product-images`. Lista 1 file (cheap) y mide latencia.
 *
 * 503 si el bucket no responde o auth falla.
 */

import { logger } from "@/lib/logger";
import { InternalError, problemResponse } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const start = Date.now();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) {
    return Response.json({
      status: "skipped",
      service: "supabase-storage",
      check: "list-bucket",
      detail: "SUPABASE_SECRET_KEY no configurada (build/CI).",
      latencyMs: 0,
      timestamp: new Date().toISOString(),
    });
  }
  // Lazy import para evitar inicialización en build phase.
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    const { error } = await supabase.storage.from("product-images").list("", { limit: 1 });
    if (error) {
      logger.warn({ event: "health.storage.error", message: error.message });
      return problemResponse(
        new InternalError(`Supabase Storage no responde: ${error.message.slice(0, 80)}`),
      );
    }
    return Response.json({
      status: "ok",
      service: "supabase-storage",
      check: "list-bucket",
      latencyMs: Date.now() - start,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const latencyMs = Date.now() - start;
    logger.error({
      event: "health.storage.fail",
      latencyMs,
      err: err instanceof Error ? err.message : String(err),
    });
    return problemResponse(new InternalError("Supabase Storage healthcheck falló."));
  }
}
