/*
 * Centro de notificaciones del admin (2026-08-05).
 *
 * Qué es: feed in-app de eventos del SISTEMA (alertas que disparan, crons que
 * fallan, cotizaciones nuevas, resumen diario). Es la fuente de verdad
 * operativa: el email queda solo para alertas críticas y para el aviso de
 * cotización nueva (canal de venta) — el resto del correo operativo se elimina
 * (adiós al spam de "⚠️ N alertas Lucams").
 *
 * Política anti-ruido (mandato del plan):
 *   - Los éxitos NO se registran (un cron que corre bien no avisa nada).
 *   - `dedupKey` agrupa repeticiones de la misma alerta: si ya existe una NO
 *     leída con esa key, se ACTUALIZA (detalle + createdAt → sube al tope del
 *     feed) en vez de duplicar filas.
 *
 * Quién escribe: features/observability/alerts.ts (ALERT), los catch de los
 * /api/cron/* (CRON), features/quotes/emails.ts (QUOTE) y
 * features/observability/daily-summary.ts (SYSTEM).
 * Quién lee: /admin/notificaciones (page + actions) y el badge del sidebar.
 */

import "server-only";
import { prisma, Prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export type NotificationType = "ALERT" | "CRON" | "QUOTE" | "SYSTEM" | "ORDER";
export type NotificationSeverity = "info" | "warning" | "critical";

export type NotifyInput = {
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  detail: string;
  /** Deep link admin (e.g. /admin/pedidos) — botón de acción en el feed. */
  actionUrl?: string;
  actionLabel?: string;
  metadata?: Prisma.InputJsonValue;
  /** Anti-ruido: si hay una no leída con esta key, se actualiza en vez de duplicar. */
  dedupKey?: string;
};

/**
 * Crea una notificación. Con `dedupKey`: si existe una NO leída con la misma
 * key, actualiza su contenido y createdAt (sube al tope) en vez de duplicar —
 * una alerta que persiste varios ciclos no llena el feed.
 */
export async function notify(input: NotifyInput) {
  if (input.dedupKey) {
    const existing = await prisma.notification.findFirst({
      where: { dedupKey: input.dedupKey, readAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      return prisma.notification.update({
        where: { id: existing.id },
        data: {
          severity: input.severity,
          title: input.title,
          detail: input.detail,
          actionUrl: input.actionUrl ?? null,
          actionLabel: input.actionLabel ?? null,
          metadata: input.metadata ?? {},
          createdAt: new Date(), // sube al tope del feed
        },
      });
    }
  }
  return prisma.notification.create({
    data: {
      type: input.type,
      severity: input.severity,
      title: input.title,
      detail: input.detail,
      actionUrl: input.actionUrl ?? null,
      actionLabel: input.actionLabel ?? null,
      metadata: input.metadata ?? {},
      dedupKey: input.dedupKey ?? null,
    },
  });
}

/** Feed del centro: más recientes primero. El índice (readAt, createdAt) cubre el filtro. */
export async function listNotifications(opts: {
  unreadOnly?: boolean;
  type?: NotificationType;
  limit?: number;
}) {
  return prisma.notification.findMany({
    where: {
      ...(opts.unreadOnly ? { readAt: null } : {}),
      ...(opts.type ? { type: opts.type } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: opts.limit ?? 100,
  });
}

/** Conteo de no leídas — badge del sidebar. Query barata (índice readAt, createdAt). */
export async function getUnreadCount(): Promise<number> {
  return prisma.notification.count({ where: { readAt: null } });
}

/** Marca UNA como leída. updateMany: idempotente (no explota si ya estaba leída o no existe). */
export async function markRead(id: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { id, readAt: null },
    data: { readAt: new Date() },
  });
}

/** Marca TODAS las no leídas como leídas (botón "Marcar todas"). */
export async function markAllRead(): Promise<void> {
  await prisma.notification.updateMany({
    where: { readAt: null },
    data: { readAt: new Date() },
  });
}

/**
 * Atajo para la rama catch de los /api/cron/*: registra el FALLO del cron como
 * notificación CRON (severity warning; los éxitos NO se registran — anti-ruido).
 * Best-effort: NUNCA lanza (estamos dentro del manejo de error del cron — no
 * puede romper la respuesta 500). Mismo patrón que lib/error-capture.
 */
export async function notifyCronFailure(job: string, err: unknown): Promise<void> {
  try {
    await notify({
      type: "CRON",
      severity: "warning",
      title: `Cron "${job}" falló`,
      detail: err instanceof Error ? err.message : String(err),
      actionUrl: "/admin/observability",
      actionLabel: "Ver salud técnica",
      dedupKey: `cron_fail_${job}`,
    });
  } catch (notifyErr) {
    logger.error({
      event: "notifications.cron_failure_notify_failed",
      job,
      err: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
    });
  }
}
