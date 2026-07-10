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
 * Normaliza tokens VOLÁTILES que cambian entre deploys/sesiones y romperían la
 * deduplicación si entraran crudos al fingerprint:
 *  - URLs (los chunks de Next llevan hash por build: `.../234-<hash>.js`)
 *  - posiciones `:línea:columna` de los stack frames minificados
 *  - runs de hex largos (ids de chunk, hashes de build)
 * Así, recurrencias del MISMO error lógico mapean al mismo fingerprint.
 */
function normalizeForFingerprint(s: string): string {
  return s
    .replace(/https?:\/\/\S+/g, "URL")
    .replace(/:\d+:\d+/g, ":N:N")
    .replace(/\b[0-9a-f]{8,}\b/gi, "HASH");
}

/**
 * Fingerprint de deduplicación: SHA-1 de `message` + las primeras 3 líneas del
 * stack (ambos normalizados) + `digest`. Se incluye `digest` porque en un build
 * de PRODUCCIÓN de Next los errores de Server Component llegan a los boundaries
 * con un `message` GENÉRICO idéntico ("The specific message is omitted..."); sin
 * el digest, bugs distintos colapsarían en una sola fila. Se calcula en el server
 * (no se confía en el cliente).
 */
function fingerprintOf(message: string, stack?: string, digest?: string): string {
  const top3 = (stack ?? "")
    .split("\n")
    .slice(0, 3)
    .map((l) => l.trim())
    .join("\n");
  const basis = `${normalizeForFingerprint(message)}\n${normalizeForFingerprint(top3)}\n${digest ?? ""}`;
  return crypto.createHash("sha1").update(basis).digest("hex");
}

/**
 * Registra un error del CLIENTE en ErrorReport, deduplicado por fingerprint.
 * Best-effort (nunca lanza). Race-safe: si dos requests concurrentes con el
 * mismo fingerprint nuevo colisionan en el create (P2002), reintenta como update.
 */
export async function captureClientError(e: ClientErrorReport): Promise<void> {
  const message = (e.message || "unknown").slice(0, 2000);
  const stack = e.stack ? e.stack.slice(0, 4000) : null;
  const fingerprint = fingerprintOf(message, e.stack, e.digest);
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
      return;
    }
  }

  // Regresión: si el error estaba RESUELTO y vuelve a ocurrir, reabrirlo para que
  // sea visible de nuevo en el panel (como hace Sentry). `IGNORED` se respeta
  // (silenciado a propósito = ruido conocido). updateMany es atómico sobre el
  // filtro → seguro ante concurrencia; best-effort (no rompe el flujo).
  await prisma.errorReport
    .updateMany({
      where: { fingerprint, status: "RESOLVED" },
      data: { status: "OPEN", resolvedAt: null, resolvedBy: null },
    })
    .catch(() => {});
}
