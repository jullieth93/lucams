import type { NextRequest } from "next/server";
import { runLifecycleCycle } from "@/features/lifecycle/runner";
import { logger } from "@/lib/logger";
import { captureServerError } from "@/lib/error-capture";
import { recordCronHeartbeat } from "@/features/observability/cron-heartbeat";
import { notifyCronFailure } from "@/features/notifications/service";
import { cronSecretOk } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!cronSecretOk(req.headers.get("x-cron-secret"))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runLifecycleCycle();
    if (result.errors > 0) {
      throw new Error(`Lifecycle terminó con ${result.errors} errores de ejecución.`);
    }
    await recordCronHeartbeat("lifecycle");
    return Response.json({ ok: true, ...result });
  } catch (error) {
    logger.error({
      event: "cron.lifecycle.fail",
      err: error instanceof Error ? error.message : String(error),
    });
    await captureServerError({
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      routePath: "/api/cron/lifecycle",
      routeType: "cron",
    });
    await notifyCronFailure("lifecycle", error);
    return Response.json({ ok: false, error: "internal" }, { status: 500 });
  }
}
