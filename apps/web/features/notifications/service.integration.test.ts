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
import { notify, listNotifications, getUnreadCount, markRead, markAllRead } from "./service";

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
    await markRead(first.id);

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
    await markRead(read.id);

    const byType = await listNotifications({ type: "QUOTE", limit: 100 });
    expect(byType.every((n) => n.type === "QUOTE")).toBe(true);
    expect(byType.some((n) => n.id === unread.id)).toBe(true);

    const unreadOnly = await listNotifications({ unreadOnly: true, limit: 100 });
    expect(unreadOnly.every((n) => n.readAt === null)).toBe(true);
    expect(unreadOnly.some((n) => n.id === unread.id)).toBe(true);
    expect(unreadOnly.some((n) => n.id === read.id)).toBe(false);

    // Orden: más recientes primero.
    const feed = await listNotifications({ limit: 10 });
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
    const withUnread = await getUnreadCount();
    await markRead(n.id);
    const afterRead = await getUnreadCount();
    expect(afterRead).toBe(withUnread - 1);

    // markRead es idempotente (updateMany): no explota ni descuenta de nuevo.
    await markRead(n.id);
    expect(await getUnreadCount()).toBe(afterRead);
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

    await markAllRead();

    const rows = await prisma.notification.findMany({ where: { id: { in: [a.id, b.id] } } });
    expect(rows.every((r) => r.readAt !== null)).toBe(true);
  });
});
