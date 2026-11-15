/*
 * Centro de notificaciones del admin (2026-08-05).
 *
 * Qué es: feed in-app de eventos del SISTEMA (alertas que disparan, crons que
 * fallan, pedidos nuevos, resumen diario). Es la fuente de verdad operativa:
 * el email queda para alertas críticas y avisos comerciales puntuales; el resto
 * del correo operativo se elimina (adiós al spam de "⚠️ N alertas Lucams").
 *
 * Política anti-ruido (mandato del plan):
 *   - Los éxitos NO se registran (un cron que corre bien no avisa nada).
 *   - `dedupKey` agrupa repeticiones de la misma alerta: si ya existe una NO
 *     leída con esa key, se ACTUALIZA (detalle + createdAt → sube al tope del
 *     feed) en vez de duplicar filas.
 *
 * Quién escribe: features/observability/alerts.ts (ALERT), los catch de los
 * /api/cron/* (CRON), features/orders/emails.ts (ORDER),
 * features/orders/stock-alerts.ts (ALERT — venta perdida por stock, inmediata),
 * features/orders/saga.ts (ALERT — tracking sin orden) y
 * features/observability/daily-summary.ts (SYSTEM).
 * Quién lee: /admin/notificaciones (page + actions) y el badge del sidebar.
 */

import "server-only";
import type { AdminRole } from "@lucams/db";
import { getNotificationRouteScope } from "@/lib/admin-rbac";
import { formatDayMonthCO, formatIsoDateCO } from "@/lib/datetime";
import { prisma, Prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export type NotificationType = "ALERT" | "CRON" | "SYSTEM" | "ORDER";
export type NotificationSeverity = "info" | "warning" | "critical";

function prefixActionUrlClause(prefix: string): Prisma.NotificationWhereInput {
  return {
    OR: [
      { actionUrl: prefix },
      { actionUrl: { startsWith: `${prefix}/` } },
      { actionUrl: { startsWith: `${prefix}?` } },
    ],
  };
}

function patternActionUrlClause(pattern: {
  prefix: string;
  suffix: string;
}): Prisma.NotificationWhereInput {
  return {
    AND: [
      { actionUrl: { startsWith: pattern.prefix } },
      {
        OR: [
          { actionUrl: { endsWith: pattern.suffix } },
          { actionUrl: { contains: `${pattern.suffix}?` } },
          { actionUrl: { contains: `${pattern.suffix}/` } },
        ],
      },
    ],
  };
}

/** Construye el filtro SQL de alcance por rol para `Notification`, fail-closed sin rol. */
export function buildNotificationRoleWhere(role: AdminRole): Prisma.NotificationWhereInput {
  if (!role) return { id: "__no_access__" };
  const scope = getNotificationRouteScope(role);
  if (scope.unrestricted) return {};
  const allowed = [
    ...scope.allowedPrefixes.map(prefixActionUrlClause),
    ...scope.allowedPatterns.map(patternActionUrlClause),
  ];
  if (allowed.length === 0) return { id: "__no_access__" };
  const denied = [
    ...scope.deniedPrefixes.map(prefixActionUrlClause),
    ...scope.deniedPatterns.map(patternActionUrlClause),
  ];
  return {
    actionUrl: { not: null },
    OR: allowed,
    ...(denied.length > 0 ? { NOT: { OR: denied } } : {}),
  };
}

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
  role: AdminRole;
  unreadOnly?: boolean;
  type?: NotificationType;
  limit?: number;
}) {
  return prisma.notification.findMany({
    where: {
      ...(opts.unreadOnly ? { readAt: null } : {}),
      ...(opts.type ? { type: opts.type } : {}),
      ...buildNotificationRoleWhere(opts.role),
    },
    orderBy: { createdAt: "desc" },
    take: opts.limit ?? 100,
  });
}

/** Conteo de no leídas — badge del sidebar. Query barata (índice readAt, createdAt). */
export async function getUnreadCount(role: AdminRole): Promise<number> {
  return prisma.notification.count({
    where: { readAt: null, ...buildNotificationRoleWhere(role) },
  });
}

/** Marca UNA como leída dentro del ámbito del rol. Idempotente. */
export async function markRead(id: string, role: AdminRole): Promise<void> {
  await prisma.notification.updateMany({
    where: { id, readAt: null, ...buildNotificationRoleWhere(role) },
    data: { readAt: new Date() },
  });
}

/** Marca TODAS las no leídas del ámbito del rol (y tipo opcional) como leídas. */
export async function markAllRead(opts: {
  role: AdminRole;
  type?: NotificationType;
}): Promise<void> {
  await prisma.notification.updateMany({
    where: {
      readAt: null,
      ...(opts.type ? { type: opts.type } : {}),
      ...buildNotificationRoleWhere(opts.role),
    },
    data: { readAt: new Date() },
  });
}

export interface NotificationPulseSummary {
  unreadCount: number;
  priorityUnreadCount: number;
  windowTotal: number;
  commercialWindowCount: number;
  byType: Record<NotificationType, number>;
  buckets: Array<{
    key: string;
    label: string;
    tickLabel: string;
    total: number;
    priority: number;
  }>;
}

/**
 * Pulso diario (Bogotá `-05:00`) + resumen ejecutivo de notificaciones dentro del
 * alcance RBAC del rol actual. Mantiene aislamiento estricto de alertas financieras,
 * fiscales y de infraestructura fuera de `SUPERADMIN`.
 */
export async function getNotificationPulseAndSummary(opts: {
  role: AdminRole;
  days?: number;
  now?: Date;
}): Promise<NotificationPulseSummary> {
  const days = Math.max(1, Math.min(30, opts.days ?? 14));
  const now = opts.now ?? new Date();
  const roleWhere = buildNotificationRoleWhere(opts.role);

  const todayIso = formatIsoDateCO(now);
  const noonToday = new Date(`${todayIso}T12:00:00.000-05:00`);
  const buckets: NotificationPulseSummary["buckets"] = [];
  const bucketByKey = new Map<string, NotificationPulseSummary["buckets"][number]>();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(noonToday.getTime() - i * 86_400_000);
    const key = formatIsoDateCO(d);
    const entry = {
      key,
      label: formatDayMonthCO(d),
      tickLabel: `${key.slice(8)}/${key.slice(5, 7)}`,
      total: 0,
      priority: 0,
    };
    buckets.push(entry);
    bucketByKey.set(key, entry);
  }

  const firstKey = buckets[0]?.key ?? todayIso;
  const since = new Date(`${firstKey}T00:00:00.000-05:00`);

  const [unreadCount, priorityUnreadCount, recentRows] = await Promise.all([
    prisma.notification.count({
      where: { readAt: null, ...roleWhere },
    }),
    prisma.notification.count({
      where: {
        readAt: null,
        severity: { in: ["critical", "warning"] },
        ...roleWhere,
      },
    }),
    prisma.notification.findMany({
      where: {
        createdAt: { gte: since },
        ...roleWhere,
      },
      select: {
        createdAt: true,
        type: true,
        severity: true,
      },
    }),
  ]);

  const byType: Record<NotificationType, number> = {
    ORDER: 0,
    ALERT: 0,
    CRON: 0,
    SYSTEM: 0,
  };

  for (const row of recentRows) {
    const key = formatIsoDateCO(row.createdAt);
    const bucket = bucketByKey.get(key);
    if (bucket) {
      bucket.total += 1;
      if (row.severity === "critical" || row.severity === "warning") {
        bucket.priority += 1;
      }
    }
    if (row.type in byType) {
      byType[row.type as NotificationType] += 1;
    }
  }

  return {
    unreadCount,
    priorityUnreadCount,
    windowTotal: recentRows.length,
    commercialWindowCount: byType.ORDER,
    byType,
    buckets,
  };
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
