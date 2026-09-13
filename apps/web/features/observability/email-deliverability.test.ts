/*
 * Unit — getEmailDeliverabilityStats (N-04 + refinamiento 2026-09-13).
 *
 * El refinamiento excluye los destinatarios con TLD `.test` (RFC 2606): las
 * suites de integración/e2e enviaron correos reales a esas direcciones y TODO
 * rebota por diseño — contarlos fingía una crisis de entregabilidad inexistente
 * (verificado en PRD: 240/240 bounces eran a *.test, 0 en dominios reales).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { groupBy } = vi.hoisted(() => ({ groupBy: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { emailEvent: { groupBy } } }));

import {
  EMAIL_BOUNCE_MIN_EVENTS,
  EMAIL_BOUNCE_RATE_ALERT_PCT,
  getEmailDeliverabilityStats,
} from "./email-deliverability";

function seedGroups(
  real: Array<{ type: string; n: number }>,
  test: Array<{ type: string; n: number }> = [],
) {
  groupBy
    .mockResolvedValueOnce(real.map((g) => ({ type: g.type, _count: { _all: g.n } })))
    .mockResolvedValueOnce(test.map((g) => ({ type: g.type, _count: { _all: g.n } })));
}

describe("getEmailDeliverabilityStats", () => {
  beforeEach(() => vi.clearAllMocks());

  it("excluye los destinatarios con TLD .test de la query principal y los cuenta aparte", async () => {
    seedGroups(
      [
        { type: "email.delivered", n: 10 },
        { type: "email.bounced", n: 1 },
      ],
      [
        { type: "email.delivered", n: 3 },
        { type: "email.bounced", n: 97 },
      ],
    );
    const stats = await getEmailDeliverabilityStats(new Date("2026-09-13T12:00:00Z"));

    expect(groupBy).toHaveBeenCalledTimes(2);
    expect(groupBy.mock.calls[0][0].where.NOT).toEqual({ to: { endsWith: ".test" } });
    expect(groupBy.mock.calls[1][0].where.to).toEqual({ endsWith: ".test" });
    // 97 bounces de test NO entran a la tasa: 1/(10+1) ≈ 9.1 %.
    expect(stats.delivered).toBe(10);
    expect(stats.bounced).toBe(1);
    expect(stats.bounceRatePct).toBeCloseTo(9.09, 1);
    expect(stats.excludedTestEvents).toBe(100);
  });

  it("ventana: filtra por occurredAt >= now − 7 días (no createdAt)", async () => {
    seedGroups([]);
    const now = new Date("2026-09-13T12:00:00Z");
    await getEmailDeliverabilityStats(now);
    const from = groupBy.mock.calls[0][0].where.occurredAt.gte as Date;
    expect(now.getTime() - from.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("sin eventos → tasa null y sin alerta", async () => {
    seedGroups([]);
    const stats = await getEmailDeliverabilityStats();
    expect(stats.bounceRatePct).toBeNull();
    expect(stats.bounceRateAlert).toBe(false);
  });

  it("tasa alta pero sin volumen mínimo → NO alerta (ruido estadístico)", async () => {
    seedGroups([
      { type: "email.delivered", n: 1 },
      { type: "email.bounced", n: 2 },
    ]);
    const stats = await getEmailDeliverabilityStats();
    expect(stats.bounceRatePct).toBeCloseTo(66.7, 0);
    expect(stats.bounceRateAlert).toBe(false);
    expect(EMAIL_BOUNCE_MIN_EVENTS).toBeGreaterThan(3);
  });

  it("tasa > umbral con volumen → alerta", async () => {
    seedGroups([
      { type: "email.delivered", n: 10 },
      { type: "email.bounced", n: 15 },
    ]);
    const stats = await getEmailDeliverabilityStats();
    expect(stats.bounceRatePct).toBeGreaterThan(EMAIL_BOUNCE_RATE_ALERT_PCT);
    expect(stats.bounceRateAlert).toBe(true);
  });

  it("tasa justo en el umbral → NO alerta (estrictamente mayor)", async () => {
    seedGroups([
      { type: "email.delivered", n: 19 },
      { type: "email.bounced", n: 1 },
    ]);
    const stats = await getEmailDeliverabilityStats();
    expect(stats.bounceRatePct).toBeCloseTo(EMAIL_BOUNCE_RATE_ALERT_PCT, 5);
    expect(stats.bounceRateAlert).toBe(false);
  });
});
