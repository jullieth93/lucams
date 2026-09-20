/*
 * Unit — purgeExpiredEventLogs (retención Ley 1581; auditoría v3 · #10 +
 * auditoría 2026-08-24 F-6 + auditoría 2026-09-11 N-13). Prisma mockeado: se
 * verifica que la purga cubre EmailEvent/WebhookEvent (180 d), ErrorLog/
 * ErrorReport (90 d, ErrorReport por lastSeenAt — un error que sigue recurrente
 * no se borra aunque sea viejo), Notification LEÍDAS (90 d — las no leídas se
 * conservan: son avisos pendientes) y WebVital (35 d).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    emailEvent: { deleteMany: vi.fn() },
    webhookEvent: { deleteMany: vi.fn() },
    errorLog: { deleteMany: vi.fn() },
    errorReport: { deleteMany: vi.fn() },
    notification: { deleteMany: vi.fn() },
    webVital: { deleteMany: vi.fn() },
    securityEvent: { deleteMany: vi.fn() },
  },
}));
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

import {
  EMAIL_EVENT_RETENTION_DAYS,
  ERROR_LOG_RETENTION_DAYS,
  ERROR_REPORT_RETENTION_DAYS,
  NOTIFICATION_RETENTION_DAYS,
  SECURITY_EVENT_RETENTION_DAYS,
  WEBHOOK_EVENT_RETENTION_DAYS,
  WEB_VITAL_RETENTION_DAYS,
  purgeExpiredEventLogs,
} from "./event-log-retention";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("purgeExpiredEventLogs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.emailEvent.deleteMany.mockResolvedValue({ count: 1 });
    mockPrisma.webhookEvent.deleteMany.mockResolvedValue({ count: 2 });
    mockPrisma.errorLog.deleteMany.mockResolvedValue({ count: 3 });
    mockPrisma.errorReport.deleteMany.mockResolvedValue({ count: 4 });
    mockPrisma.notification.deleteMany.mockResolvedValue({ count: 5 });
    mockPrisma.webVital.deleteMany.mockResolvedValue({ count: 6 });
    mockPrisma.securityEvent.deleteMany.mockResolvedValue({ count: 7 });
  });

  it("purga las 7 tablas y devuelve los conteos", async () => {
    const res = await purgeExpiredEventLogs();
    expect(mockPrisma.emailEvent.deleteMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.webhookEvent.deleteMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.errorLog.deleteMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.errorReport.deleteMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.notification.deleteMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.webVital.deleteMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.securityEvent.deleteMany).toHaveBeenCalledTimes(1);
    expect(res).toEqual({
      emailEventsPurged: 1,
      webhookEventsPurged: 2,
      errorLogsPurged: 3,
      errorReportsPurged: 4,
      notificationsPurged: 5,
      webVitalsPurged: 6,
      securityEventsPurged: 7,
    });
  });

  it("ErrorLog por createdAt y ErrorReport por lastSeenAt, cutoff ≈ 90 días (F-6)", async () => {
    const before = Date.now();
    await purgeExpiredEventLogs();
    const after = Date.now();

    const errorLogWhere = mockPrisma.errorLog.deleteMany.mock.calls[0][0].where;
    const errorReportWhere = mockPrisma.errorReport.deleteMany.mock.calls[0][0].where;

    expect(Object.keys(errorLogWhere)).toEqual(["createdAt"]);
    expect(Object.keys(errorReportWhere)).toEqual(["lastSeenAt"]);

    const logCutoff = (errorLogWhere.createdAt.lt as Date).getTime();
    const reportCutoff = (errorReportWhere.lastSeenAt.lt as Date).getTime();
    for (const cutoff of [logCutoff, reportCutoff]) {
      const ageDays = (before - cutoff) / DAY_MS;
      expect(ageDays).toBeGreaterThanOrEqual(90);
      expect(ageDays).toBeLessThan(91);
      expect(cutoff).toBeLessThanOrEqual(after - 90 * DAY_MS + 1000);
    }
  });

  it("EmailEvent/WebhookEvent conservan su retención de 180 días", async () => {
    const before = Date.now();
    await purgeExpiredEventLogs();
    const emailCutoff = (
      mockPrisma.emailEvent.deleteMany.mock.calls[0][0].where.createdAt.lt as Date
    ).getTime();
    expect((before - emailCutoff) / DAY_MS).toBeGreaterThanOrEqual(180);
    // WebhookEvent mantiene el guard processedAt (ventana de reintento/idempotencia).
    expect(mockPrisma.webhookEvent.deleteMany.mock.calls[0][0].where.processedAt).toEqual({
      not: null,
    });
  });

  it("F-07: purga SecurityEvent por createdAt con retención de 180 días", async () => {
    const before = Date.now();
    await purgeExpiredEventLogs();

    const where = mockPrisma.securityEvent.deleteMany.mock.calls[0][0].where;
    expect(Object.keys(where)).toEqual(["createdAt"]);
    const cutoff = (where.createdAt.lt as Date).getTime();
    const ageDays = (before - cutoff) / DAY_MS;
    expect(ageDays).toBeGreaterThanOrEqual(180);
    expect(ageDays).toBeLessThan(181);
  });

  it("N-13: purga solo notificaciones LEÍDAS con createdAt > 90 días (las no leídas se conservan)", async () => {
    const before = Date.now();
    await purgeExpiredEventLogs();

    const where = mockPrisma.notification.deleteMany.mock.calls[0][0].where;
    // Guard explícito: readAt not null — un aviso SIN leer jamás se purga.
    expect(where.readAt).toEqual({ not: null });
    const cutoff = (where.createdAt.lt as Date).getTime();
    const ageDays = (before - cutoff) / DAY_MS;
    expect(ageDays).toBeGreaterThanOrEqual(90);
    expect(ageDays).toBeLessThan(91);
  });

  it("N-13: purga WebVital con createdAt > 35 días", async () => {
    const before = Date.now();
    await purgeExpiredEventLogs();

    const where = mockPrisma.webVital.deleteMany.mock.calls[0][0].where;
    expect(Object.keys(where)).toEqual(["createdAt"]);
    const cutoff = (where.createdAt.lt as Date).getTime();
    const ageDays = (before - cutoff) / DAY_MS;
    expect(ageDays).toBeGreaterThanOrEqual(35);
    expect(ageDays).toBeLessThan(36);
  });

  it("los overrides de días aplican por tabla", async () => {
    await purgeExpiredEventLogs({
      errorLogOlderThanDays: 30,
      errorReportOlderThanDays: 7,
      notificationOlderThanDays: 10,
      webVitalOlderThanDays: 14,
      securityEventOlderThanDays: 60,
    });
    const logCutoff = (
      mockPrisma.errorLog.deleteMany.mock.calls[0][0].where.createdAt.lt as Date
    ).getTime();
    const reportCutoff = (
      mockPrisma.errorReport.deleteMany.mock.calls[0][0].where.lastSeenAt.lt as Date
    ).getTime();
    const notificationCutoff = (
      mockPrisma.notification.deleteMany.mock.calls[0][0].where.createdAt.lt as Date
    ).getTime();
    const webVitalCutoff = (
      mockPrisma.webVital.deleteMany.mock.calls[0][0].where.createdAt.lt as Date
    ).getTime();
    const securityEventCutoff = (
      mockPrisma.securityEvent.deleteMany.mock.calls[0][0].where.createdAt.lt as Date
    ).getTime();
    expect((Date.now() - logCutoff) / DAY_MS).toBeCloseTo(30, 1);
    expect((Date.now() - reportCutoff) / DAY_MS).toBeCloseTo(7, 1);
    expect((Date.now() - notificationCutoff) / DAY_MS).toBeCloseTo(10, 1);
    expect((Date.now() - webVitalCutoff) / DAY_MS).toBeCloseTo(14, 1);
    expect((Date.now() - securityEventCutoff) / DAY_MS).toBeCloseTo(60, 1);
  });

  it("exporta las constantes de retención documentadas", () => {
    expect(EMAIL_EVENT_RETENTION_DAYS).toBe(180);
    expect(WEBHOOK_EVENT_RETENTION_DAYS).toBe(180);
    expect(ERROR_LOG_RETENTION_DAYS).toBe(90);
    expect(ERROR_REPORT_RETENTION_DAYS).toBe(90);
    expect(NOTIFICATION_RETENTION_DAYS).toBe(90);
    expect(WEB_VITAL_RETENTION_DAYS).toBe(35);
    expect(SECURITY_EVENT_RETENTION_DAYS).toBe(180);
  });
});
