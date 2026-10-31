/*
 * LUC-SEC-010 (auditoría 2026-10-30) — purga programada de rate_limit_buckets.
 *
 * La tabla crecía monotónicamente por diseño (migración 003 lo dejó TODO
 * manual): cada clave nueva crea un bucket para siempre. La migración 047 crea
 * purge_rate_limit_buckets() + la agenda diaria en pg_cron.
 *
 * Se certifica contra la DB real (función SQL de verdad):
 *   - claves con ventana >7 días → borradas; frescas → intactas;
 *   - re-ejecutable sin carrera (segunda corrida borra 0);
 *   - el latido con cardinalidad queda en AlertState (cron:purge-rate-limits),
 *     que es lo que getCronHealth muestra en /admin/observability.
 *
 * El job está registrado en CRON_JOBS (cron-heartbeat.ts) con intervalo 24 h.
 */

import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";

const hasDb = Boolean(process.env.DATABASE_URL);
const RUN = `rlpurge${Date.now()}`.toLowerCase();

async function insertBucket(key: string, ageDays: number): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO rate_limit_buckets (key, count, window_start)
    VALUES (${key}, 1, now() - (${ageDays} || ' days')::interval)
    ON CONFLICT (key) DO UPDATE SET window_start = EXCLUDED.window_start`;
}

async function bucketExists(key: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT count(*)::bigint AS n FROM rate_limit_buckets WHERE key = ${key}`;
  return Number(rows[0]?.n ?? 0) > 0;
}

describe.skipIf(!hasDb)("purge_rate_limit_buckets (LUC-SEC-010)", () => {
  afterAll(async () => {
    if (!hasDb) return;
    await prisma.$executeRaw`DELETE FROM rate_limit_buckets WHERE key LIKE ${RUN + "%"}`.catch(
      () => {},
    );
    await prisma.alertState
      .deleteMany({ where: { key: "cron:purge-rate-limits" } })
      .catch(() => {});
  });

  it("borra claves >7 días, conserva frescas, idempotente y deja latido con cardinalidad", async () => {
    await insertBucket(`${RUN}-vieja`, 30); // 30 días inactiva
    await insertBucket(`${RUN}-borde`, 8); // 8 días
    await insertBucket(`${RUN}-fresca`, 0); // ahora

    const deleted = await prisma.$queryRaw<{ purge_rate_limit_buckets: bigint }[]>`
      SELECT purge_rate_limit_buckets()`;
    expect(Number(deleted[0]!.purge_rate_limit_buckets)).toBeGreaterThanOrEqual(2);

    expect(await bucketExists(`${RUN}-vieja`)).toBe(false);
    expect(await bucketExists(`${RUN}-borde`)).toBe(false);
    expect(await bucketExists(`${RUN}-fresca`)).toBe(true);

    // Re-ejecutable sin carrera: la segunda corrida no borra nada de este RUN.
    const again = await prisma.$queryRaw<{ purge_rate_limit_buckets: bigint }[]>`
      SELECT purge_rate_limit_buckets()`;
    expect(Number(again[0]!.purge_rate_limit_buckets)).toBe(0);

    // Latido con métrica de cardinalidad (lo lee getCronHealth en observability).
    const beat = await prisma.alertState.findUnique({
      where: { key: "cron:purge-rate-limits" },
    });
    expect(beat).not.toBeNull();
    expect(beat!.lastDetail).toMatch(/borradas \d+, quedan \d+/);
    expect(Date.now() - beat!.lastSentAt.getTime()).toBeLessThan(60_000);
  });

  it("una ventana en curso NUNCA se borra aunque la clave sea longeva (window_start se actualiza al acceder)", async () => {
    // Simula una clave viva: window_start reciente aunque la clave tenga semanas.
    await insertBucket(`${RUN}-viva`, 0);
    await prisma.$queryRaw`SELECT purge_rate_limit_buckets()`;
    expect(await bucketExists(`${RUN}-viva`)).toBe(true);
  });
});
