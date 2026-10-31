/*
 * Integración DB — SecurityEvent (F-07, auditoría 2026-09-19): persistencia
 * durable de eventos de seguridad (antes solo logs efímeros de Vercel con la
 * IP redactada), las dos reglas de alerta que los consumen
 * (security_admin_login_fails / security_webhook_invalid_signatures) y la
 * retención de 180 días vía purgeExpiredEventLogs.
 *
 * Requiere DATABASE_URL (Supabase local). Sin DB → skipIf.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// evaluateAlerts envía email solo si hay críticas; se mockea para no pegar Resend.
vi.mock("@/lib/resend", () => ({ sendEmail: async () => ({ sent: true }) }));
// getSettingValue usa unstable_cache (requiere contexto Next, ausente en vitest).
vi.mock("@/lib/cms", () => ({ getSettingValue: async (_k: string, fallback: string) => fallback }));

import { prisma } from "@/lib/db";
import { hashIp } from "@/lib/rate-limit-keys";
import { evaluateAlerts } from "@/features/observability/alerts";
import { purgeExpiredEventLogs } from "@/features/observability/event-log-retention";
import { recordSecurityEvent, SECURITY_EVENT } from "./security-events";

const hasDb = !!process.env.DATABASE_URL;
const RUN = `f07${Date.now()}${Math.floor(Math.random() * 1e6)}`;
const DAY_MS = 24 * 60 * 60 * 1000;

describe.skipIf(!hasDb)("security-events — integración DB (F-07)", { timeout: 30_000 }, () => {
  beforeAll(async () => {
    // Limpieza previa por si una corrida anterior quedó a medias.
    await prisma.securityEvent.deleteMany({ where: { metadata: { path: ["run"], equals: RUN } } });
  });

  afterAll(async () => {
    await prisma.securityEvent
      .deleteMany({ where: { metadata: { path: ["run"], equals: RUN } } })
      .catch(() => {});
    await prisma.notification
      .deleteMany({
        where: { dedupKey: { in: ["security_admin_login_fails", "security_webhook_invalid"] } },
      })
      .catch(() => {});
    await prisma.$disconnect();
  });

  it("recordSecurityEvent persiste la fila con ipHash HMAC-truncado (la IP jamás en claro)", async () => {
    await recordSecurityEvent({
      event: SECURITY_EVENT.ADMIN_LOGIN_FAIL,
      outcome: "failure",
      ip: "203.0.113.9",
      metadata: { run: RUN, code: "invalid_credentials" },
    });

    const rows = await prisma.securityEvent.findMany({
      where: { event: SECURITY_EVENT.ADMIN_LOGIN_FAIL, metadata: { path: ["run"], equals: RUN } },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].outcome).toBe("failure");
    expect(rows[0].ipHash).toBe(hashIp("203.0.113.9"));
    expect(rows[0].ipHash).toMatch(/^[0-9a-f]{16}$/);
    expect(rows[0].actorId).toBeNull();
    expect(rows[0].createdAt).toBeInstanceOf(Date);
    expect(rows[0].count).toBe(1); // LUC-SEC-008: toda fila lleva su conteo
    expect(rows[0].dedupKey).toBeTruthy();
  });

  it("LUC-SEC-008 — agregación por ventana: 3 eventos de la MISMA clave en el mismo minuto → 1 fila con count=3", async () => {
    const meta = { run: RUN, case: "agg" };
    for (let i = 0; i < 3; i++) {
      await recordSecurityEvent({
        event: SECURITY_EVENT.WEBHOOK_INVALID_SIGNATURE,
        outcome: "rejected",
        ip: "192.0.2.55",
        metadata: meta,
      });
    }
    const rows = await prisma.securityEvent.findMany({
      where: {
        event: SECURITY_EVENT.WEBHOOK_INVALID_SIGNATURE,
        metadata: { path: ["run"], equals: RUN },
      },
    });
    const mine = rows.filter(
      (r) => (r.metadata as { case?: string }).case === "agg",
    );
    expect(mine).toHaveLength(1); // una fila por bucket, no una por request
    expect(mine[0].count).toBe(3);
  });

  it("LUC-SEC-008 — ráfaga de 25 (misma clave): sigue siendo 1 fila y el contador queda EXACTO en el múltiplo de lote", async () => {
    const meta = { run: RUN, case: "flood" };
    for (let i = 0; i < 25; i++) {
      await recordSecurityEvent({
        event: SECURITY_EVENT.WEBHOOK_INVALID_SIGNATURE,
        outcome: "rejected",
        ip: "198.51.100.44",
        metadata: meta,
      });
    }
    const rows = await prisma.securityEvent.findMany({
      where: {
        event: SECURITY_EVENT.WEBHOOK_INVALID_SIGNATURE,
        metadata: { path: ["run"], equals: RUN },
      },
    });
    const mine = rows.filter(
      (r) => (r.metadata as { case?: string }).case === "flood",
    );
    expect(mine).toHaveLength(1);
    // 5 escrituras de +1 (n=1..5) + n=15 (+10) + n=25 (+10) = 25 exacto.
    expect(mine[0].count).toBe(25);
  });

  it("LUC-SEC-008 — la alerta SUMA count (no cuenta filas): una fila agregada con count=5 dispara igual", async () => {
    await prisma.securityEvent.create({
      data: {
        event: SECURITY_EVENT.ADMIN_LOGIN_FAIL,
        outcome: "failure",
        ipHash: hashIp("192.0.2.200"),
        metadata: { run: RUN, case: "sum" },
        count: 5,
      },
    });
    const firing = await evaluateAlerts();
    const alert = firing.find((a) => a.key === "security_admin_login_fails");
    expect(alert).toBeDefined();
  });

  it("LUC-SEC-008 — fail-open intacto: si la persistencia falla, el flujo no se rompe", async () => {
    const spy = vi
      .spyOn(prisma.securityEvent, "upsert")
      .mockRejectedValueOnce(new Error("db caída (simulada)"));
    await expect(
      recordSecurityEvent({
        event: SECURITY_EVENT.LOGIN_FAIL,
        outcome: "failure",
        ip: "192.0.2.99",
        metadata: { run: RUN, case: "failopen" },
      }),
    ).resolves.toBeUndefined();
    spy.mockRestore();
  });

  it("evaluateAlerts dispara security_admin_login_fails con ≥5 logins admin fallidos en 15 min", async () => {
    await prisma.securityEvent.createMany({
      data: Array.from({ length: 5 }, () => ({
        event: SECURITY_EVENT.ADMIN_LOGIN_FAIL,
        outcome: "failure",
        ipHash: hashIp("198.51.100.7"),
        metadata: { run: RUN },
      })),
    });

    const firing = await evaluateAlerts();
    const alert = firing.find((a) => a.key === "security_admin_login_fails");
    expect(alert).toBeDefined();
    expect(alert!.severity).toBe("alta");
    expect(alert!.action.length).toBeGreaterThan(0);
  });

  it("evaluateAlerts dispara security_webhook_invalid con ≥3 firmas/secretos inválidos en 5 min", async () => {
    await prisma.securityEvent.createMany({
      data: Array.from({ length: 3 }, () => ({
        event: SECURITY_EVENT.WEBHOOK_INVALID_SIGNATURE,
        outcome: "rejected",
        ipHash: hashIp("192.0.2.10"),
        metadata: { run: RUN, source: "resend" },
      })),
    });

    const firing = await evaluateAlerts();
    const alert = firing.find((a) => a.key === "security_webhook_invalid");
    expect(alert).toBeDefined();
    expect(alert!.severity).toBe("media");
  });

  it("purgeExpiredEventLogs borra SecurityEvent con >180 días y conserva los recientes", async () => {
    await prisma.securityEvent.createMany({
      data: [
        {
          event: SECURITY_EVENT.LOGIN_FAIL,
          outcome: "failure",
          metadata: { run: RUN, age: "old" },
          createdAt: new Date(Date.now() - 200 * DAY_MS),
        },
        {
          event: SECURITY_EVENT.LOGIN_FAIL,
          outcome: "failure",
          metadata: { run: RUN, age: "fresh" },
        },
      ],
    });

    const result = await purgeExpiredEventLogs();

    expect(result.securityEventsPurged).toBeGreaterThanOrEqual(1);
    const remaining = await prisma.securityEvent.findMany({
      where: { event: SECURITY_EVENT.LOGIN_FAIL, metadata: { path: ["run"], equals: RUN } },
    });
    expect(remaining).toHaveLength(1);
    expect((remaining[0].metadata as { age: string }).age).toBe("fresh");
  });
});
