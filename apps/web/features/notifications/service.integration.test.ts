/*
 * Integración DB — centro de notificaciones (features/notifications/service.ts).
 *
 * Cubre: create, dedup por dedupKey (ACTUALIZA la no leída en vez de duplicar),
 * listado con filtros (unreadOnly, type), conteo de no leídas y
 * markRead/markAllRead. RUN-scoped: toda fila creada lleva metadata.run = RUN
 * y el afterAll la borra por ese filtro (limpieza propia, convención del repo).
 * getUnreadCount cuenta GLOBAL → se aserten DELTAS (robusto ante concurrencia).
 */

import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  notify,
  listNotifications,
  getUnreadCount,
  getNotificationPulseAndSummary,
  markRead,
  markAllRead,
  buildNotificationRoleWhere,
} from "./service";

const hasDb = !!process.env.DATABASE_URL;
const RUN = `ntf${Date.now()}${Math.floor(Math.random() * 1e6)}`;
const runMeta = { run: RUN } as const;

const cleanup = () =>
  prisma.notification.deleteMany({ where: { metadata: { path: ["run"], equals: RUN } } });

describe.skipIf(!hasDb)("notifications/service — integración DB", { timeout: 30_000 }, () => {
  afterAll(async () => {
    await cleanup().catch(() => {});
    await prisma.$disconnect();
  });

  it("notify crea la notificación con defaults (no leída, metadata)", async () => {
    const n = await notify({
      type: "SYSTEM",
      severity: "info",
      title: `${RUN} hola`,
      detail: "detalle de prueba",
      actionUrl: "/admin/metricas",
      metadata: runMeta,
    });
    expect(n.id).toBeTruthy();
    expect(n.readAt).toBeNull();
    expect(n.type).toBe("SYSTEM");
    expect(n.severity).toBe("info");
    expect(n.actionUrl).toBe("/admin/metricas");
  });

  it("dedupKey: la 2ª con la misma key ACTUALIZA la no leída (no duplica) y sube al tope", async () => {
    const key = `${RUN}:dedup`;
    const first = await notify({
      type: "ALERT",
      severity: "warning",
      title: `${RUN} alerta v1`,
      detail: "detalle viejo",
      metadata: runMeta,
      dedupKey: key,
    });
    // Pequeña pausa para que createdAt cambie de forma observable.
    await new Promise((r) => setTimeout(r, 20));
    const second = await notify({
      type: "ALERT",
      severity: "critical", // la severidad también se refresca
      title: `${RUN} alerta v2`,
      detail: "detalle nuevo",
      metadata: runMeta,
      dedupKey: key,
    });

    expect(second.id).toBe(first.id); // misma fila
    expect(second.detail).toBe("detalle nuevo");
    expect(second.severity).toBe("critical");
    expect(second.createdAt.getTime()).toBeGreaterThanOrEqual(first.createdAt.getTime());

    const rows = await prisma.notification.findMany({ where: { dedupKey: key } });
    expect(rows).toHaveLength(1); // NO duplicó
  });

  it("dedupKey: si la anterior YA está leída, crea una nueva (no resucita la leída)", async () => {
    const key = `${RUN}:dedup-read`;
    const first = await notify({
      type: "CRON",
      severity: "warning",
      title: `${RUN} cron v1`,
      detail: "falló",
      metadata: runMeta,
      dedupKey: key,
    });
    await markRead(first.id, "SUPERADMIN");

    const second = await notify({
      type: "CRON",
      severity: "warning",
      title: `${RUN} cron v2`,
      detail: "siguió fallando",
      metadata: runMeta,
      dedupKey: key,
    });
    expect(second.id).not.toBe(first.id);
    const rows = await prisma.notification.findMany({ where: { dedupKey: key } });
    expect(rows).toHaveLength(2);
  });

  it("listNotifications filtra por type y unreadOnly", async () => {
    const unread = await notify({
      type: "QUOTE",
      severity: "info",
      title: `${RUN} quote unread`,
      detail: "x",
      metadata: runMeta,
    });
    const read = await notify({
      type: "QUOTE",
      severity: "info",
      title: `${RUN} quote read`,
      detail: "x",
      metadata: runMeta,
    });
    await markRead(read.id, "SUPERADMIN");

    const byType = await listNotifications({ role: "SUPERADMIN", type: "QUOTE", limit: 100 });
    expect(byType.every((n) => n.type === "QUOTE")).toBe(true);
    expect(byType.some((n) => n.id === unread.id)).toBe(true);

    const unreadOnly = await listNotifications({
      role: "SUPERADMIN",
      unreadOnly: true,
      limit: 100,
    });
    expect(unreadOnly.every((n) => n.readAt === null)).toBe(true);
    expect(unreadOnly.some((n) => n.id === unread.id)).toBe(true);
    expect(unreadOnly.some((n) => n.id === read.id)).toBe(false);

    // Orden: más recientes primero.
    const feed = await listNotifications({ role: "SUPERADMIN", limit: 10 });
    for (let i = 1; i < feed.length; i++) {
      expect(feed[i - 1].createdAt.getTime()).toBeGreaterThanOrEqual(feed[i].createdAt.getTime());
    }
  });

  it("getUnreadCount + markRead mueven el conteo en la dirección correcta", async () => {
    const n = await notify({
      type: "SYSTEM",
      severity: "info",
      title: `${RUN} count`,
      detail: "x",
      metadata: runMeta,
    });
    const withUnread = await getUnreadCount("SUPERADMIN");
    await markRead(n.id, "SUPERADMIN");
    const afterRead = await getUnreadCount("SUPERADMIN");
    expect(afterRead).toBe(withUnread - 1);

    // markRead es idempotente (updateMany): no explota ni descuenta de nuevo.
    await markRead(n.id, "SUPERADMIN");
    expect(await getUnreadCount("SUPERADMIN")).toBe(afterRead);
  });

  it("markAllRead marca todas las no leídas", async () => {
    const a = await notify({
      type: "ALERT",
      severity: "warning",
      title: `${RUN} all a`,
      detail: "x",
      metadata: runMeta,
    });
    const b = await notify({
      type: "CRON",
      severity: "warning",
      title: `${RUN} all b`,
      detail: "x",
      metadata: runMeta,
    });

    await markAllRead({ role: "SUPERADMIN" });

    const rows = await prisma.notification.findMany({ where: { id: { in: [a.id, b.id] } } });
    expect(rows.every((r) => r.readAt !== null)).toBe(true);
  });

  it("aísla por rol: OPERATIONS_MANAGER no lee ni silencia avisos de SUPERADMIN (finanzas/DIAN/seguridad/infra)", async () => {
    const opsOrder = await notify({
      type: "ORDER",
      severity: "info",
      title: `${RUN} pedido nuevo`,
      detail: "Pedido confirmado",
      actionUrl: "/admin/pedidos/LCM-2026-9999",
      metadata: runMeta,
    });
    const opsQuote = await notify({
      type: "QUOTE",
      severity: "info",
      title: `${RUN} cotización nueva`,
      detail: "Solicitud B2B",
      actionUrl: "/admin/cotizaciones",
      metadata: runMeta,
    });
    const superDailySummary = await notify({
      type: "SYSTEM",
      severity: "info",
      title: `${RUN} resumen diario $5.000.000`,
      detail: "Ingresos netos 24h",
      actionUrl: "/admin/metricas",
      metadata: runMeta,
    });
    const superSecurity = await notify({
      type: "ALERT",
      severity: "critical",
      title: `${RUN} MFA recovery usado`,
      detail: "Acceso de emergencia",
      actionUrl: "/admin/auditoria?vista=seguridad",
      metadata: runMeta,
    });
    const superInfra = await notify({
      type: "CRON",
      severity: "warning",
      title: `${RUN} cron falló`,
      detail: "Timeout",
      actionUrl: "/admin/observability",
      metadata: runMeta,
    });

    const opsFeed = await listNotifications({
      unreadOnly: true,
      limit: 100,
      role: "OPERATIONS_MANAGER",
    });
    const opsIds = new Set(opsFeed.map((n) => n.id));
    expect(opsIds.has(opsOrder.id)).toBe(true);
    expect(opsIds.has(opsQuote.id)).toBe(true);
    expect(opsIds.has(superDailySummary.id)).toBe(false);
    expect(opsIds.has(superSecurity.id)).toBe(false);
    expect(opsIds.has(superInfra.id)).toBe(false);

    // Intento directo de marcar como leída una alerta de SUPERADMIN por OPERATIONS_MANAGER → no-op
    await markRead(superSecurity.id, "OPERATIONS_MANAGER");
    const stillUnreadSecurity = await prisma.notification.findUnique({
      where: { id: superSecurity.id },
    });
    expect(stillUnreadSecurity?.readAt).toBeNull();

    // Pulso 14d por rol: 14 cubetas Bogotá y conteos aislados
    const pulse = await getNotificationPulseAndSummary({ role: "OPERATIONS_MANAGER", days: 14 });
    expect(pulse.buckets).toHaveLength(14);
    expect(pulse.unreadCount).toBeGreaterThanOrEqual(2);

    // markAllRead de OPERATIONS_MANAGER limpia sus avisos pero preserva intactos los de SUPERADMIN
    await markAllRead({ role: "OPERATIONS_MANAGER" });

    const afterRows = await prisma.notification.findMany({
      where: {
        id: {
          in: [opsOrder.id, opsQuote.id, superDailySummary.id, superSecurity.id, superInfra.id],
        },
      },
    });
    const byId = new Map(afterRows.map((r) => [r.id, r]));
    expect(byId.get(opsOrder.id)?.readAt).not.toBeNull();
    expect(byId.get(opsQuote.id)?.readAt).not.toBeNull();
    expect(byId.get(superDailySummary.id)?.readAt).toBeNull();
    expect(byId.get(superSecurity.id)?.readAt).toBeNull();
    expect(byId.get(superInfra.id)?.readAt).toBeNull();
  });
});

describe.skipIf(!hasDb)("notifications/service — subrutas dinámicas y fail-closed", () => {
  afterAll(async () => {
    await cleanup().catch(() => {});
  });

  it("filtra producción, guías, taller y previews con la misma paridad RBAC", async () => {
    const [production, guide, quoteWorkshop, cartPreview, cartDetail] = await Promise.all([
      notify({
        type: "ORDER",
        severity: "info",
        title: `${RUN} producción`,
        detail: "piezas 300 DPI",
        actionUrl: "/admin/pedidos/LCM-2026-0001/produccion",
        metadata: runMeta,
      }),
      notify({
        type: "ORDER",
        severity: "info",
        title: `${RUN} guía`,
        detail: "etiqueta con dirección",
        actionUrl: "/admin/pedidos/LCM-2026-0001/guia/etiqueta?fuente=externa",
        metadata: runMeta,
      }),
      notify({
        type: "QUOTE",
        severity: "info",
        title: `${RUN} taller cotización`,
        detail: "piezas de taller",
        actionUrl: "/admin/cotizaciones/qt_1/taller",
        metadata: runMeta,
      }),
      notify({
        type: "ORDER",
        severity: "info",
        title: `${RUN} preview carrito`,
        detail: "preview con PII",
        actionUrl: "/admin/carritos/cart_1/preview",
        metadata: runMeta,
      }),
      notify({
        type: "ORDER",
        severity: "info",
        title: `${RUN} detalle carrito`,
        detail: "detalle analítico",
        actionUrl: "/admin/carritos/cart_1",
        metadata: runMeta,
      }),
    ]);

    const workshopIds = new Set(
      (await listNotifications({ role: "PRINT_WORKSHOP", limit: 100 })).map((row) => row.id),
    );
    expect(workshopIds.has(production.id)).toBe(true);
    expect(workshopIds.has(quoteWorkshop.id)).toBe(true);
    expect(workshopIds.has(guide.id)).toBe(false);

    const supportIds = new Set(
      (await listNotifications({ role: "CUSTOMER_SUPPORT", limit: 100 })).map((row) => row.id),
    );
    expect(supportIds.has(guide.id)).toBe(true);
    expect(supportIds.has(cartPreview.id)).toBe(true);
    expect(supportIds.has(quoteWorkshop.id)).toBe(false);
    expect(supportIds.has(production.id)).toBe(false);

    const fulfillmentIds = new Set(
      (await listNotifications({ role: "FULFILLMENT", limit: 100 })).map((row) => row.id),
    );
    expect(fulfillmentIds.has(guide.id)).toBe(true);
    expect(fulfillmentIds.has(production.id)).toBe(false);

    const financeIds = new Set(
      (await listNotifications({ role: "FINANCE_ANALYST", limit: 100 })).map((row) => row.id),
    );
    expect(financeIds.has(cartDetail.id)).toBe(true);
    expect(financeIds.has(cartPreview.id)).toBe(false);
    expect(financeIds.has(guide.id)).toBe(false);

    await markRead(guide.id, "PRINT_WORKSHOP");
    expect((await prisma.notification.findUnique({ where: { id: guide.id } }))?.readAt).toBeNull();
    await markRead(production.id, "PRINT_WORKSHOP");
    expect(
      (await prisma.notification.findUnique({ where: { id: production.id } }))?.readAt,
    ).not.toBeNull();
  });

  it("buildNotificationRoleWhere se cierra incluso si JavaScript omite el rol en runtime", () => {
    expect(buildNotificationRoleWhere(undefined as never)).toEqual({ id: "__no_access__" });
  });
});
