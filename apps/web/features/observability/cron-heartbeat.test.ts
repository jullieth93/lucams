/*
 * Unit — getCronHealth / getDisabledCronJobs (dead-man switch, auditoría v3 · #15)
 * y el latido de backups (N-19a, 2026-09-11: recordBackupHeartbeat / getBackupHealth
 * sobre AlertState["backup:last-success"] — el backup corre en GitHub Actions, fuera
 * de pg_cron, y su salud era invisible desde la app).
 *
 * Prisma mockeado: la lógica de overdue/disabled/stale es determinista y no necesita DB.
 * Cubre: los jobs rastreados (cms-publish-scheduled; expire-pending-orders de N-12),
 * la ventana 2× del overdue, y
 * CRON_JOBS_DISABLED — un job desagendado A PROPÓSITO (ej. los crons de email en STG)
 * reporta disabled:true y nunca cuenta como overdue (anti falso-degraded eterno).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted: el factory de vi.mock se eleva sobre los imports (mismo patrón que
// features/admin-users/service.test.ts).
const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    alertState: { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn() },
  },
}));
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

import {
  BACKUP_HEARTBEAT_KEY,
  BACKUP_STALE_MS,
  CRON_JOBS,
  getBackupHealth,
  getCronHealth,
  getDisabledCronJobs,
  recordBackupHeartbeat,
} from "./cron-heartbeat";

const NOW = new Date("2026-08-05T12:00:00Z");

/** Siembra latidos: mapa job → fecha de su última ejecución. */
function heartbeats(entries: Record<string, Date>) {
  mockPrisma.alertState.findMany.mockResolvedValue(
    Object.entries(entries).map(([job, lastSentAt]) => ({
      key: `cron:${job}`,
      lastSentAt,
    })),
  );
}

describe("cron-heartbeat", () => {
  const originalDisabled = process.env.CRON_JOBS_DISABLED;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CRON_JOBS_DISABLED;
  });
  afterEach(() => {
    if (originalDisabled === undefined) delete process.env.CRON_JOBS_DISABLED;
    else process.env.CRON_JOBS_DISABLED = originalDisabled;
  });

  it("rastrea los 10 jobs HTTP, incluidos cms-publish-scheduled (5 min) y expire-pending-orders (N-12)", () => {
    expect(Object.keys(CRON_JOBS)).toHaveLength(10);
    expect(CRON_JOBS["cms-publish-scheduled"]).toEqual({
      intervalMs: 5 * 60 * 1000,
      label: "Publicación programada CMS",
    });
    // N-12: el cron que auto-cancela pendientes — la alerta pending_payment_wompi_stale
    // (N-12b) existe para detectar precisamente que ESTE job no corrió.
    expect(CRON_JOBS["expire-pending-orders"]).toEqual({
      intervalMs: 60 * 60 * 1000,
      label: "Expiración de pedidos sin pagar",
    });
    // Feedback Lucy 2026-09-18: purga post-entrega de fotos + renders (migración pg_cron 035).
    expect(CRON_JOBS["purge-delivered-designs"]).toEqual({
      intervalMs: 24 * 60 * 60 * 1000,
      label: "Purga diseños entregados",
    });
  });

  it("marca overdue el job sin latido o vencido en 2× su intervalo", async () => {
    heartbeats({
      alerts: new Date(NOW.getTime() - 4 * 60 * 1000), // dentro de 2×5min → al día
      "daily-summary": new Date(NOW.getTime() - 49 * 60 * 60 * 1000), // >2×24h → vencido
      // cms-publish-scheduled sin latido → vencido
    });
    const health = await getCronHealth(NOW);
    const byJob = new Map(health.map((c) => [c.job, c]));
    expect(byJob.get("alerts")?.overdue).toBe(false);
    expect(byJob.get("daily-summary")?.overdue).toBe(true);
    expect(byJob.get("cms-publish-scheduled")?.overdue).toBe(true);
    expect(byJob.get("cms-publish-scheduled")?.lastRunAt).toBeNull();
  });

  it("CRON_JOBS_DISABLED: el job desagendado a propósito NO cuenta como overdue", async () => {
    process.env.CRON_JOBS_DISABLED =
      "alerts,daily-summary,review-request,cart-recovery,back-in-stock";
    heartbeats({}); // ningún latido: sin la var TODOS estarían vencidos
    const health = await getCronHealth(NOW);
    const byJob = new Map(health.map((c) => [c.job, c]));
    // Disabled: reportados como disabled y nunca overdue.
    expect(byJob.get("alerts")).toMatchObject({ disabled: true, overdue: false });
    expect(byJob.get("back-in-stock")).toMatchObject({ disabled: true, overdue: false });
    // No disabled: siguen evaluando normal (sin latido → vencidos).
    expect(byJob.get("cms-publish-scheduled")).toMatchObject({ disabled: false, overdue: true });
    expect(byJob.get("purge-event-logs")).toMatchObject({ disabled: false, overdue: true });
  });

  it("getDisabledCronJobs: parsea comma-separado, recorta espacios e ignora nombres ajenos", () => {
    process.env.CRON_JOBS_DISABLED = " alerts , , no-existe ,purge-event-logs ";
    expect(getDisabledCronJobs()).toEqual(["alerts", "purge-event-logs"]);
    delete process.env.CRON_JOBS_DISABLED;
    expect(getDisabledCronJobs()).toEqual([]);
  });
});

describe("backup heartbeat (N-19a) — AlertState['backup:last-success']", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.alertState.upsert.mockResolvedValue({});
  });

  it("recordBackupHeartbeat hace upsert con la clave y el detalle (trazabilidad del dump)", async () => {
    await recordBackupHeartbeat("db/lucams-2026-09-12T071300Z.sql.gz.gpg");

    expect(mockPrisma.alertState.upsert).toHaveBeenCalledTimes(1);
    const args = mockPrisma.alertState.upsert.mock.calls[0][0];
    expect(args.where).toEqual({ key: BACKUP_HEARTBEAT_KEY });
    expect(args.create.key).toBe(BACKUP_HEARTBEAT_KEY);
    expect(args.create.lastDetail).toBe("db/lucams-2026-09-12T071300Z.sql.gz.gpg");
    expect(args.update.lastDetail).toBe("db/lucams-2026-09-12T071300Z.sql.gz.gpg");
    expect(args.create.lastSentAt).toBeInstanceOf(Date);
    expect(args.update.lastSentAt).toBeInstanceOf(Date);
  });

  it("recordBackupHeartbeat NO traga el error del upsert (el endpoint responde 500 y el workflow sale rojo)", async () => {
    mockPrisma.alertState.upsert.mockRejectedValueOnce(new Error("db caída"));
    await expect(recordBackupHeartbeat()).rejects.toThrow("db caída");
  });

  it("getBackupHealth: sin fila → stale (nunca reportó éxito)", async () => {
    mockPrisma.alertState.findUnique.mockResolvedValue(null);
    const health = await getBackupHealth(new Date("2026-09-12T12:00:00Z"));
    expect(health).toEqual({ lastSuccessAt: null, stale: true });
  });

  it("getBackupHealth: latido dentro de 36h → al día; más viejo → stale", async () => {
    const NOW = new Date("2026-09-12T12:00:00Z");
    mockPrisma.alertState.findUnique.mockResolvedValue({
      lastSentAt: new Date(NOW.getTime() - 20 * 60 * 60 * 1000), // 20h → fresco
    });
    expect(await getBackupHealth(NOW)).toEqual({
      lastSuccessAt: new Date(NOW.getTime() - 20 * 60 * 60 * 1000),
      stale: false,
    });

    mockPrisma.alertState.findUnique.mockResolvedValue({
      lastSentAt: new Date(NOW.getTime() - BACKUP_STALE_MS - 1000), // >36h → viejo
    });
    expect((await getBackupHealth(NOW)).stale).toBe(true);
  });

  it("el tope de frescura es 36h (mismo criterio que el DR drill)", () => {
    expect(BACKUP_STALE_MS).toBe(36 * 60 * 60 * 1000);
  });
});
