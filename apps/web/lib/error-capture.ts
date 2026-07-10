/*
 * Captura de errores en DB (Bloque D, sin Sentry — mandato #7).
 *   - `captureServerError` → ErrorLog (alimentado por instrumentation.onRequestError).
 *   - `captureClientError` → ErrorReport, deduplicado por fingerprint (alternativa
 *     propia a Sentry). Alimentado por /api/log-error desde los error boundaries.
 * Best-effort: NUNCA lanzan (no deben romper el manejo del error original).
 */

import crypto from "node:crypto";
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

export type ClientErrorReport = {
  message: string;
  stack?: string;
  url?: string;
  userAgent?: string;
  userId?: string;
  digest?: string;
};

/**
 * Fingerprint de deduplicación: SHA-1 de `message` + las primeras 3 líneas del
 * stack. Mismo error recurrente → mismo fingerprint → incrementa `count` en vez
 * de crear filas nuevas. Se calcula en el server (no se confía en el cliente).
 */
function fingerprintOf(message: string, stack?: string): string {
  const top3 = (stack ?? "")
    .split("\n")
    .slice(0, 3)
    .map((l) => l.trim())
    .join("\n");
  return crypto.createHash("sha1").update(`${message}\n${top3}`).digest("hex");
}

/**
 * Registra un error del CLIENTE en ErrorReport, deduplicado por fingerprint.
 * Best-effort (nunca lanza). Race-safe: si dos requests concurrentes con el
 * mismo fingerprint nuevo colisionan en el create (P2002), reintenta como update.
 */
export async function captureClientError(e: ClientErrorReport): Promise<void> {
  const message = (e.message || "unknown").slice(0, 2000);
  const stack = e.stack ? e.stack.slice(0, 4000) : null;
  const fingerprint = fingerprintOf(message, e.stack);
  try {
    await prisma.errorReport.upsert({
      where: { fingerprint },
      create: {
        fingerprint,
        message,
        stack,
        url: e.url?.slice(0, 500) ?? null,
        userAgent: e.userAgent?.slice(0, 500) ?? null,
        userId: e.userId ?? null,
        digest: e.digest ?? null,
      },
      update: { count: { increment: 1 }, lastSeenAt: new Date() },
    });
  } catch (err) {
    // Race de create concurrente (P2002 en el upsert): la fila ya existe →
    // reintentar como update para no perder el incremento.
    try {
      await prisma.errorReport.update({
        where: { fingerprint },
        data: { count: { increment: 1 }, lastSeenAt: new Date() },
      });
    } catch {
      logger.error({
        event: "observability.client_capture_fail",
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
