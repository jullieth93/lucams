/*
 * Registro durable de eventos de seguridad (F-07, auditoría 2026-09-19;
 * anti-amplificación LUC-SEC-008, 2026-10-31).
 *
 * Antes de F-07, los eventos de seguridad rechazados (login fallido de cliente
 * o admin, firma/secreto de webhook inválido) solo iban a `logger.warn` — logs
 * efímeros de Vercel con la IP redactada: una campaña de password-spraying o
 * de firmas falsas era PREVENIDA (rate limit + firma timing-safe) pero
 * INVISIBLE y no investigable más allá de la retención de logs de Vercel.
 *
 * LUC-SEC-008 — antes, CADA request inválido creaba una fila: un atacante sin
 * firma válida llegaba a una escritura durable por request (amplificación de
 * invocaciones serverless, lecturas de body y crecimiento de tabla/backups,
 * con ruido que oculta ataques reales). Ahora el evento se AGREGA por ventana:
 *
 *   - dedupKey = evento | outcome | ipHash | actorId | hash(metadata) | minuto.
 *     Una FILA por bucket (upsert atómico con incremento — dos instancias en
 *     carrera no pierden cuentas: Prisma reintenta el update ante P2002).
 *   - Coalescing en la instancia caliente: los primeros 5 eventos de una clave
 *     se escriben de inmediato (un incidente aislado queda puntual y exacto);
 *     a partir del 6.º se escribe en lotes de 10 (sampling que NO pierde el
 *     contador: cada escritura incrementa el tamaño exacto del lote — bajo
 *     ráfaga el count queda exacto en múltiplos de 10 y aproximado en el
 *     resto, y los eventos de cola de un lote incompleto pueden quedar sin
 *     flush si la instancia muere — trade-off aceptado y documentado: solo
 *     afecta a ráfagas ya registradas como patrón, nunca a incidentes
 *     aislados). El Map se acota (10k claves → se reinicia) para que una
 *     campaña con IPs rotadas no infle la memoria de la lambda.
 *   - Las alertas SUMAN `count` (alerts.ts), no cuentan filas — las filas
 *     históricas (count=1 por defecto) suman igual que antes.
 *
 * Cada fila en `SecurityEvent` lleva:
 *   - event    → nombre del evento (constantes SECURITY_EVENT de acá abajo)
 *   - outcome  → "failure" (auth rechazada) | "rejected" (firma/secreto inválido)
 *   - ipHash   → hashIp() de lib/rate-limit-keys.ts (SHA-256 truncado a 16 hex).
 *                La IP es dato personal (Ley 1581, política C-8): NUNCA en claro,
 *                pero el hash determinista permite correlacionar una campaña.
 *   - actorId  → id del customer/admin si se conoce (normalmente null: el
 *                evento típico es un intento NO autenticado)
 *   - metadata → JSON mínimo sin PII (código de error, proveedor, vía)
 *   - count    → ocurrencias agregadas en el bucket (LUC-SEC-008)
 *
 * Los consumen evaluateAlerts (reglas security_admin_login_fails y
 * security_webhook_invalid) y el cron purge-event-logs (retención 180 días).
 *
 * FAIL-OPEN (mismo patrón que lib/admin-audit.ts): si la persistencia falla,
 * loguea y NO propaga — la detección jamás debe romper el flujo principal
 * (un login o un webhook válido no puede caerse porque la tabla falle).
 */

import "server-only";
import { createHash } from "node:crypto";
import { prisma, type Prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { hashIp } from "@/lib/rate-limit-keys";

/** Nombres canónicos de evento (los usan los callsites Y las reglas de alerta). */
export const SECURITY_EVENT = {
  LOGIN_FAIL: "auth.login.fail",
  ADMIN_LOGIN_FAIL: "auth.admin_login.fail",
  WEBHOOK_INVALID_SIGNATURE: "webhook.invalid_signature",
} as const;

export type SecurityEventName = (typeof SECURITY_EVENT)[keyof typeof SECURITY_EVENT];

export type SecurityEventEntry = {
  event: SecurityEventName;
  outcome: "failure" | "rejected";
  /** IP del cliente (getClientIp) — se persiste SOLO su hash. */
  ip?: string | null;
  actorId?: string | null;
  metadata?: Record<string, unknown>;
};

// ── LUC-SEC-008: coalescing por instancia + agregación por minuto ────────────

/** Los primeros N eventos de una clave se escriben al instante (incidente aislado exacto). */
const ALWAYS_WRITE_FIRST = 5;
/** Después se escribe solo cuando el conteo local cruza un múltiplo de este lote. */
const WRITE_BATCH = 10;
/** Techo del Map en memoria (campaña con IPs rotadas no infla la lambda). */
const MAX_TRACKED_KEYS = 10_000;

/** Conteo local por dedupKey dentro de ESTA instancia (efímera en serverless). */
const localSeen = new Map<string, number>();

function minuteBucket(now: Date): number {
  return Math.floor(now.getTime() / 60_000);
}

/** Hash estable de la metadata (claves ordenadas) para la clave de dedup. */
function metadataHash(metadata: Record<string, unknown> | undefined): string {
  if (!metadata) return "";
  const sorted = Object.keys(metadata)
    .sort()
    .map((k) => [k, metadata[k]]);
  return createHash("sha256").update(JSON.stringify(sorted)).digest("hex").slice(0, 16);
}

export async function recordSecurityEvent(entry: SecurityEventEntry): Promise<void> {
  try {
    const dedupKey = [
      entry.event,
      entry.outcome,
      entry.ip ? hashIp(entry.ip) : "",
      entry.actorId ?? "",
      metadataHash(entry.metadata),
      minuteBucket(new Date()),
    ].join("|");

    // Coalescing local: exacto en incidentes aislados, por lotes bajo ráfaga.
    // Invariante: cada escritura incrementa EXACTAMENTE los eventos desde la
    // escritura anterior (n=1..5 → +1; n=15,25,… → +10 cubre el lote de 10).
    if (localSeen.size >= MAX_TRACKED_KEYS) localSeen.clear();
    const seen = (localSeen.get(dedupKey) ?? 0) + 1;
    localSeen.set(dedupKey, seen);
    const batch = seen <= ALWAYS_WRITE_FIRST ? 1 : seen % WRITE_BATCH === 5 ? WRITE_BATCH : 0;
    if (batch === 0) return; // coalescido: lo cubre el próximo múltiplo del lote

    await prisma.securityEvent.upsert({
      where: { dedupKey },
      create: {
        event: entry.event,
        outcome: entry.outcome,
        ipHash: entry.ip ? hashIp(entry.ip) : null,
        actorId: entry.actorId ?? null,
        metadata: (entry.metadata ?? {}) as Prisma.InputJsonValue,
        dedupKey,
        count: batch,
      },
      update: { count: { increment: batch } },
    });
  } catch (err) {
    logger.warn({
      event: "security_event.persist_fail",
      securityEvent: entry.event,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
