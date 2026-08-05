/*
 * Unit — getCronHealth / getDisabledCronJobs (dead-man switch, auditoría v3 · #15).
 *
 * Prisma mockeado: la lógica de overdue/disabled es determinista y no necesita DB.
 * Cubre: cms-publish-scheduled rastreado (8º job HTTP), la ventana 2× del overdue, y
 * CRON_JOBS_DISABLED — un job desagendado A PROPÓSITO (ej. los crons de email en STG)
 * reporta disabled:true y nunca cuenta como overdue (anti falso-degraded eterno).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted: el factory de vi.mock se eleva sobre los imports (mismo patrón que
// features/admin-users/service.test.ts).
const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: { alertState: { findMany: vi.fn() } },
}));
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

import { CRON_JOBS, getCronHealth, getDisabledCronJobs } from "./cron-heartbeat";

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

  it("rastrea los 8 jobs HTTP, incluido cms-publish-scheduled (cada 5 min)", () => {
    expect(Object.keys(CRON_JOBS)).toHaveLength(8);
    expect(CRON_JOBS["cms-publish-scheduled"]).toEqual({
      intervalMs: 5 * 60 * 1000,
      label: "Publicación programada CMS",
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
