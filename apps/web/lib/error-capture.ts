/*
 * Captura de errores en DB (Bloque D, sin Sentry — mandato #7).
 *   - `captureServerError` → ErrorLog (alimentado por instrumentation.onRequestError).
 *   - `captureClientError` → ErrorReport, deduplicado por fingerprint (alternativa
 *     propia a Sentry). Alimentado por /api/log-error desde los error boundaries.
 * Best-effort: NUNCA lanzan (no deben romper el manejo del error original).
 */

import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { logger, scrubPii } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";

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
        // scrubPii (F-6): un error de DB/validación puede traer PII embebida
        // (`Key (email)=(cliente@x.com) already exists`) — la misma redacción
        // que el logger aplica a stdout se aplica a lo que persiste en DB.
        message: scrubPii((e.message || "unknown").slice(0, 2000)),
        digest: e.digest ?? null,
        stack: e.stack ? scrubPii(e.stack.slice(0, 4000)) : null,
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
 *  - query strings volátiles (`?v=...`, cache-busters)
 *  - posiciones `:línea:columna` de los stack frames minificados
 *  - runs de hex largos (hashes de chunk/build, p.ej. `234-<hash>.js`)
 * NO se colapsa la URL entera: el PATH identifica el archivo/endpoint de origen,
 * así que dos errores en rutas distintas deben seguir siendo fingerprints
 * distintos (evita falsos merges). Solo se normaliza la parte volátil.
 */
function normalizeForFingerprint(s: string): string {
  return s
    .replace(/\?[^\s)'"]*/g, "")
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

// Backstop anti-bloat: SOLO filas NUEVAS (fingerprints no vistos) cuentan contra
// este tope global. Los incrementos de dedup de un fingerprint existente jamás son
// bloat y se permiten siempre → un bug ruidoso legítimo (que deduplica) nunca
// agota el cupo ni oculta otros errores. Acota el peor caso de un atacante que
// rota IPs + varía el message para generar fingerprints únicos. 300 filas
// nuevas/5min es holgadísimo para tráfico real (los errores únicos son pocos).
const NEW_ROW_LIMIT = 300;
const NEW_ROW_WINDOW_S = 5 * 60;

/**
 * Registra un error del CLIENTE en ErrorReport, deduplicado por fingerprint.
 * Best-effort (nunca lanza). Flujo:
 *  - fingerprint ya visto → incrementa count/lastSeenAt SIEMPRE (no es bloat) y
 *    reabre si estaba RESUELTO (regresión visible; IGNORED se respeta).
 *  - fingerprint nuevo → aplica el tope anti-bloat y crea la fila.
 *  - race de create concurrente (P2002) → cae al catch y trata como incremento.
 */
export async function captureClientError(e: ClientErrorReport): Promise<void> {
  // scrubPii ANTES de persistir (F-6): el payload viene de /api/log-error (público,
  // controlado por el cliente) y los errores de DB traen PII embebida. El fingerprint
  // se calcula sobre los valores YA redactados: lo persistido y lo deduplicado son lo
  // mismo, y dos ocurrencias que solo difieren en la PII embebida colapsan en una fila.
  const message = scrubPii((e.message || "unknown").slice(0, 2000));
  const stack = e.stack ? scrubPii(e.stack.slice(0, 4000)) : null;
  const fingerprint = fingerprintOf(message, stack ?? undefined, e.digest);
  try {
    const existing = await prisma.errorReport.findUnique({
      where: { fingerprint },
      select: { id: true, status: true },
    });
    if (existing) {
      // Incremento (siempre permitido). Reabrir SOLO si estaba RESUELTO — así la
      // regresión vuelve a ser visible; `IGNORED` queda silenciado a propósito.
      await prisma.errorReport.update({
        where: { id: existing.id },
        data: {
          count: { increment: 1 },
          lastSeenAt: new Date(),
          ...(existing.status === "RESOLVED"
            ? { status: "OPEN", resolvedAt: null, resolvedBy: null }
            : {}),
        },
      });
      return;
    }
    // Fila NUEVA: acá —y solo acá— aplica el tope anti-bloat.
    const rl = await rateLimit("error-report:new", NEW_ROW_LIMIT, NEW_ROW_WINDOW_S);
    if (!rl.allowed) {
      logger.warn({ event: "observability.client_capture.new_row_capped" });
      return;
    }
    await prisma.errorReport.create({
      data: {
        fingerprint,
        message,
        stack,
        url: e.url?.slice(0, 500) ?? null,
        userAgent: e.userAgent?.slice(0, 500) ?? null,
        userId: e.userId ?? null,
        digest: e.digest ?? null,
      },
    });
  } catch (err) {
    // Race: otro request creó la misma fila entre el findUnique y el create
    // (P2002), o cualquier otro fallo → intentar incrementar (best-effort).
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
