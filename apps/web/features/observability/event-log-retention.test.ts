/*
 * Unit — purgeExpiredEventLogs (retención Ley 1581; auditoría v3 · #10 +
 * auditoría 2026-08-24 F-6). Prisma mockeado: se verifica que la purga cubre
 * EmailEvent/WebhookEvent (180 d) y AHORA también ErrorLog/ErrorReport (90 d),
 * con el campo de fecha correcto por tabla (ErrorReport por lastSeenAt — un
 * error que sigue recurrente no se borra aunque sea viejo).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    emailEvent: { deleteMany: vi.fn() },
    webhookEvent: { deleteMany: vi.fn() },
    errorLog: { deleteMany: vi.fn() },
    errorReport: { deleteMany: vi.fn() },
  },
}));
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

import {
  EMAIL_EVENT_RETENTION_DAYS,
  ERROR_LOG_RETENTION_DAYS,
  ERROR_REPORT_RETENTION_DAYS,
  WEBHOOK_EVENT_RETENTION_DAYS,
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
  });

  it("purga las 4 tablas y devuelve los conteos", async () => {
    const res = await purgeExpiredEventLogs();
    expect(mockPrisma.emailEvent.deleteMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.webhookEvent.deleteMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.errorLog.deleteMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.errorReport.deleteMany).toHaveBeenCalledTimes(1);
    expect(res).toEqual({
      emailEventsPurged: 1,
      webhookEventsPurged: 2,
      errorLogsPurged: 3,
      errorReportsPurged: 4,
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

  it("los overrides de días aplican por tabla", async () => {
    await purgeExpiredEventLogs({ errorLogOlderThanDays: 30, errorReportOlderThanDays: 7 });
    const logCutoff = (
      mockPrisma.errorLog.deleteMany.mock.calls[0][0].where.createdAt.lt as Date
    ).getTime();
    const reportCutoff = (
      mockPrisma.errorReport.deleteMany.mock.calls[0][0].where.lastSeenAt.lt as Date
    ).getTime();
    expect((Date.now() - logCutoff) / DAY_MS).toBeCloseTo(30, 1);
    expect((Date.now() - reportCutoff) / DAY_MS).toBeCloseTo(7, 1);
  });

  it("exporta las constantes de retención documentadas", () => {
    expect(EMAIL_EVENT_RETENTION_DAYS).toBe(180);
    expect(WEBHOOK_EVENT_RETENTION_DAYS).toBe(180);
    expect(ERROR_LOG_RETENTION_DAYS).toBe(90);
    expect(ERROR_REPORT_RETENTION_DAYS).toBe(90);
  });
});
