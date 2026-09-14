/*
 * Entregabilidad de email — fuente única de las stats de EmailEvent (N-04,
 * auditoría 2026-09-11). Los eventos de Resend (delivered/bounced/delayed) ya
 * se persisten vía /api/webhooks/resend, pero NADIE los miraba: un bounce rate
 * altísimo podía sostenerse semanas sin ninguna señal en la app.
 *
 * La consumen tres superficies, siempre con la MISMA semántica:
 *   1. La regla `email_bounce_rate` (alerts.ts) — dispara con umbral + volumen.
 *   2. La sección "Entregabilidad de email" de /admin/observability.
 *   3. El resumen diario (daily-summary.ts) — línea de atención si supera el umbral.
 */

import "server-only";
import { prisma } from "@/lib/db";

/** Ventana de las stats: los bounces recientes son los que importan (7 días). */
export const EMAIL_STATS_WINDOW_DAYS = 7;

/**
 * Umbral de la tasa de rebote (en %): por encima hay un problema real de
 * entregabilidad (dominio sin DKIM/SPF sano, lista envejecida, spam traps).
 * Referencia del sector: >2 % ya degrada la reputación del sender; 5 % es el
 * piso de "acción urgente" (y el umbral histórico de suspensiones de Resend).
 */
export const EMAIL_BOUNCE_RATE_ALERT_PCT = 5;

/**
 * Volumen mínimo (delivered + bounced) para evaluar la tasa: con 3 entregas y
 * 1 rebote (25 %) no hay señal estadística — la alerta no debe sonar por ruido.
 */
export const EMAIL_BOUNCE_MIN_EVENTS = 20;

export type EmailDeliverabilityStats = {
  windowDays: number;
  delivered: number;
  bounced: number;
  delayed: number;
  /** bounced / (delivered + bounced) en %; null si no hubo NINGÚN evento terminal. */
  bounceRatePct: number | null;
  /** true solo cuando la tasa supera el umbral CON volumen mínimo (lo que alerta). */
  bounceRateAlert: boolean;
  /**
   * Eventos excluidos por ir a dominios de test (TLD `.test`, RFC 2606): las
   * suites de integración/e2e enviaron correos reales a esas direcciones y
   * TODO rebota por diseño — medirlas fingiría un problema de entregabilidad
   * que los clientes reales no tienen (verificado 2026-09-13: 240/240 bounces
   * de PRD eran a `*.test`, 0 en dominios reales).
   */
  excludedTestEvents: number;
};

export async function getEmailDeliverabilityStats(
  now: Date = new Date(),
): Promise<EmailDeliverabilityStats> {
  const from = new Date(now.getTime() - EMAIL_STATS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  // occurredAt (cuándo ocurrió el evento en Resend), no createdAt (cuándo llegó
  // el webhook): un webhook rezagado no mueve el evento de ventana. Hay índice
  // (type, occurredAt) en el modelo.
  const groups = await prisma.emailEvent.groupBy({
    by: ["type"],
    where: {
      type: { in: ["email.delivered", "email.bounced", "email.delayed"] },
      occurredAt: { gte: from },
      // Excluir destinatarios *.test (su bounce es esperado, no señal).
      NOT: { to: { endsWith: ".test" } },
    },
    _count: { _all: true },
  });
  const excludedGroups = await prisma.emailEvent.groupBy({
    by: ["type"],
    where: {
      type: { in: ["email.delivered", "email.bounced", "email.delayed"] },
      occurredAt: { gte: from },
      to: { endsWith: ".test" },
    },
    _count: { _all: true },
  });
  const countOf = (type: string) => groups.find((g) => g.type === type)?._count._all ?? 0;
  const delivered = countOf("email.delivered");
  const bounced = countOf("email.bounced");
  const delayed = countOf("email.delayed");
  const excludedTestEvents = excludedGroups.reduce((acc, g) => acc + g._count._all, 0);

  // La tasa se calcula sobre eventos TERMINALES (delivered + bounced): sent/opened/
  // clicked/complained no dicen si el correo llegó — complained ya alimenta la
  // supresión de lib/resend.ts aparte.
  const terminal = delivered + bounced;
  const bounceRatePct = terminal > 0 ? (bounced / terminal) * 100 : null;
  const bounceRateAlert =
    bounceRatePct !== null &&
    terminal >= EMAIL_BOUNCE_MIN_EVENTS &&
    bounceRatePct > EMAIL_BOUNCE_RATE_ALERT_PCT;

  return {
    windowDays: EMAIL_STATS_WINDOW_DAYS,
    delivered,
    bounced,
    delayed,
    bounceRatePct,
    bounceRateAlert,
    excludedTestEvents,
  };
}
