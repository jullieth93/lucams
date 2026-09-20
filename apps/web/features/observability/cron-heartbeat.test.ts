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

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
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

  it("rastrea los 11 jobs HTTP, incluidos cms-publish-scheduled (5 min) y expire-pending-orders (N-12)", () => {
    expect(Object.keys(CRON_JOBS)).toHaveLength(11);
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
    // L-H3/L-N1 (2026-09-20): vigilante del dominio — su productor es GitHub Actions
    // (domain-watch.yml), no pg_cron; el latido lo registra /api/cron/domain-watch.
    expect(CRON_JOBS["domain-watch"]).toEqual({
      intervalMs: 31 * 24 * 60 * 60 * 1000,
      label: "Vigilancia del dominio (RDAP)",
    });
  });

  it("marca overdue el job vencido en 2× su intervalo; el que NUNCA ha latido queda pending (F-04)", async () => {
    heartbeats({
      alerts: new Date(NOW.getTime() - 4 * 60 * 1000), // dentro de 2×5min → al día
      "daily-summary": new Date(NOW.getTime() - 49 * 60 * 60 * 1000), // >2×24h → vencido
      // cms-publish-scheduled sin latido → pending (NO overdue): un cron recién
      // agendado jamás degrada el health (F-04, auditoría 2026-09-19).
    });
    const health = await getCronHealth(NOW);
    const byJob = new Map(health.map((c) => [c.job, c]));
    expect(byJob.get("alerts")).toMatchObject({ overdue: false, pending: false });
    expect(byJob.get("daily-summary")).toMatchObject({ overdue: true, pending: false });
    expect(byJob.get("cms-publish-scheduled")).toMatchObject({
      overdue: false,
      pending: true,
      lastRunAt: null,
    });
  });

  it("un job con latido sembrado que NUNCA corre SÍ se vence pasada la gracia de 2× intervalo", async () => {
    // La siembra (supabase/migrations 037) convierte el "nunca corrió" en un
    // lastRunAt real → el dead-man switch sigue detectando un cron nuevo roto.
    heartbeats({
      "purge-delivered-designs": new Date(NOW.getTime() - 49 * 60 * 60 * 1000), // >2×24h
    });
    const health = await getCronHealth(NOW);
    const byJob = new Map(health.map((c) => [c.job, c]));
    expect(byJob.get("purge-delivered-designs")).toMatchObject({
      overdue: true,
      pending: false,
    });
  });

  it("CRON_JOBS_DISABLED: el job desagendado a propósito NO cuenta como overdue", async () => {
    process.env.CRON_JOBS_DISABLED =
      "alerts,daily-summary,review-request,cart-recovery,back-in-stock";
    heartbeats({}); // ningún latido: sin la var TODOS estarían vencidos
    const health = await getCronHealth(NOW);
    const byJob = new Map(health.map((c) => [c.job, c]));
    // Disabled: reportados como disabled y nunca overdue ni pending.
    expect(byJob.get("alerts")).toMatchObject({ disabled: true, overdue: false, pending: false });
    expect(byJob.get("back-in-stock")).toMatchObject({ disabled: true, overdue: false });
    // No disabled: sin latido → pending (NO vencidos — F-04).
    expect(byJob.get("cms-publish-scheduled")).toMatchObject({
      disabled: false,
      overdue: false,
      pending: true,
    });
    expect(byJob.get("purge-event-logs")).toMatchObject({
      disabled: false,
      overdue: false,
      pending: true,
    });
  });

  it("getDisabledCronJobs: parsea comma-separado, recorta espacios e ignora nombres ajenos", () => {
    process.env.CRON_JOBS_DISABLED = " alerts , , no-existe ,purge-event-logs ";
    expect(getDisabledCronJobs()).toEqual(["alerts", "purge-event-logs"]);
    delete process.env.CRON_JOBS_DISABLED;
    expect(getDisabledCronJobs()).toEqual([]);
  });

  it("F-04: todo job de CRON_JOBS tiene su latido 'cron:<job>' sembrado en supabase/migrations", () => {
    // Convención estructural: como un cron sin latido queda `pending` y JAMÁS
    // degrada el health, la única señal contra un cron nuevo que nunca corre es
    // la siembra del latido inicial en la migración que lo agenda (ver 037).
    // Agregar un cron a CRON_JOBS sin su INSERT en AlertState rompe este gate.
    const dir = resolve(__dirname, "../../../../supabase/migrations");
    const sql = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => readFileSync(join(dir, f), "utf8"))
      .join("\n");
    for (const job of Object.keys(CRON_JOBS)) {
      expect(sql, `falta la siembra del latido inicial de "${job}"`).toContain(`cron:${job}`);
    }
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
