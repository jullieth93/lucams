/*
 * Registro durable de eventos de seguridad (F-07, auditoría 2026-09-19).
 *
 * Antes de F-07, los eventos de seguridad rechazados (login fallido de cliente
 * o admin, firma/secreto de webhook inválido) solo iban a `logger.warn` — logs
 * efímeros de Vercel con la IP redactada: una campaña de password-spraying o
 * de firmas falsas era PREVENIDA (rate limit + firma timing-safe) pero
 * INVISIBLE y no investigable más allá de la retención de logs de Vercel.
 *
 * Cada evento persiste una fila en `SecurityEvent` con:
 *   - event    → nombre del evento (constantes SECURITY_EVENT de acá abajo)
 *   - outcome  → "failure" (auth rechazada) | "rejected" (firma/secreto inválido)
 *   - ipHash   → hashIp() de lib/rate-limit-keys.ts (SHA-256 truncado a 16 hex).
 *                La IP es dato personal (Ley 1581, política C-8): NUNCA en claro,
 *                pero el hash determinista permite correlacionar una campaña.
 *   - actorId  → id del customer/admin si se conoce (normalmente null: el
 *                evento típico es un intento NO autenticado)
 *   - metadata → JSON mínimo sin PII (código de error, proveedor, vía)
 *
 * Los consumen evaluateAlerts (reglas security_admin_login_fails y
 * security_webhook_invalid) y el cron purge-event-logs (retención 180 días).
 *
 * Uso:
 *
 *   await recordSecurityEvent({
 *     event: SECURITY_EVENT.ADMIN_LOGIN_FAIL,
 *     outcome: "failure",
 *     ip,
 *     metadata: { code: authError?.code },
 *   });
 *
 * FAIL-OPEN (mismo patrón que lib/admin-audit.ts): si la persistencia falla,
 * loguea y NO propaga — la detección jamás debe romper el flujo principal
 * (un login o un webhook válido no puede caerse porque la tabla falle).
 */

import "server-only";
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

export async function recordSecurityEvent(entry: SecurityEventEntry): Promise<void> {
  try {
    await prisma.securityEvent.create({
      data: {
        event: entry.event,
        outcome: entry.outcome,
        ipHash: entry.ip ? hashIp(entry.ip) : null,
        actorId: entry.actorId ?? null,
        metadata: (entry.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    logger.warn({
      event: "security_event.persist_fail",
      securityEvent: entry.event,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
