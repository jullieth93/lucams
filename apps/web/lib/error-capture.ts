/*
 * Captura de errores del servidor en DB (Bloque D, sin Sentry — mandato #7).
 * Persiste en ErrorLog. Best-effort: NUNCA lanza (no debe romper el manejo del
 * error original). Alimentado por instrumentation.onRequestError.
 */

import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export type CapturedError = {
  message: string;
  digest?: string;
  stack?: string;
  routePath?: string;
  requestPath?: string;
  method?: string;
  routeType?: string;
};

export async function captureServerError(e: CapturedError): Promise<void> {
  try {
    await prisma.errorLog.create({
      data: {
        message: (e.message || "unknown").slice(0, 2000),
        digest: e.digest ?? null,
        stack: e.stack ? e.stack.slice(0, 4000) : null,
        routePath: e.routePath ?? null,
        requestPath: e.requestPath ?? null,
        method: e.method ?? null,
        routeType: e.routeType ?? null,
      },
    });
  } catch (err) {
    // No romper el flujo de error original por un fallo al registrar (ej. runtime
    // Edge sin Prisma, o DB caída). Solo dejamos rastro en el log estructurado.
    logger.error({
      event: "observability.capture_fail",
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
