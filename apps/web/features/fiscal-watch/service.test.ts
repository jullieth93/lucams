/*
 * Unit — vigilancia fiscal (ADR-196): calendario fiscal colombiano (UTC-5 fijo),
 * motor puro de reglas (niveles 70/90/100 %, proyección run-rate, fecha de cruce)
 * y el despacho runFiscalWatch (dedup in-app por regla-año + email una vez por
 * cruce 90 %/100 %, sin sello si el envío falla).
 *
 * Prisma/notify/email mockeados: la lógica es determinista y no necesita DB
 * (la agregación real la cubre service.integration.test.ts).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockNotify, mockSendEmail } = vi.hoisted(() => ({
  mockPrisma: {
    order: { aggregate: vi.fn() },
    wompiPaymentTransaction: { aggregate: vi.fn() },
    alertState: { findUnique: vi.fn(), upsert: vi.fn() },
  },
  mockNotify: vi.fn(),
  mockSendEmail: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));
vi.mock("@/features/notifications/service", () => ({ notify: mockNotify }));
vi.mock("@/lib/resend", () => ({ sendEmail: mockSendEmail }));
vi.mock("@/lib/cms", () => ({
  getSettingValue: async (_key: string, fallback: string) => fallback,
}));
vi.mock("@/features/emails/registry", () => ({
  renderFiscalThresholdAlertEmail: async () => ({
    subject: "s",
    html: "<p>h</p>",
    text: "t",
  }),
}));

import {
  evaluateFiscalRules,
  fiscalYearBoundsUtc,
  fiscalYearOf,
  getFiscalYearSnapshot,
  runFiscalWatch,
  type FiscalYearSnapshot,
} from "./service";

// 3 500 UVT al UVT 2026 ($52.374) = $183.309.000 → en centavos:
const THRESHOLD_2026 = 18_330_900_000;
// 2 jul 2026 07:00 COT (mediodía UTC): 183 días transcurridos de 365.
const NOW = new Date("2026-07-02T12:00:00.000Z");

function snap(partial: Partial<FiscalYearSnapshot> = {}): FiscalYearSnapshot {
  return {
    year: 2026,
    computedAt: NOW,
    uvtCop: 52_374,
    elapsedDays: 183,
    totalDaysInYear: 365,
    remainingDays: 182,
    grossIncomeYtdCop: 0,
    cardIncomeYtdCop: 0,
    electronicIncomeYtdCop: 0,
    grossIncomeRecentCop: 0,
    cardIncomeRecentCop: 0,
    ...partial,
  };
}

/** Cola de agregados mockeados en el orden del Promise.all de getFiscalYearSnapshot. */
function mockAggregates(input: {
  grossYtd: number;
  cardYtd: number;
  electronicYtd: number;
  grossRecent: number;
  cardRecent: number;
}) {
  const orderQueue = [input.grossYtd, input.grossRecent];
  const txQueue = [input.cardYtd, input.electronicYtd, input.cardRecent];
  mockPrisma.order.aggregate.mockImplementation(async () => ({
    _sum: { total: orderQueue.shift() ?? 0 },
  }));
  mockPrisma.wompiPaymentTransaction.aggregate.mockImplementation(async () => ({
    _sum: { amountInCents: txQueue.shift() ?? 0 },
  }));
}

describe("calendario fiscal (UTC-5 fijo)", () => {
  it("el 31-dic 23:59 COT sigue siendo el año que termina", () => {
    expect(fiscalYearOf(new Date("2026-01-01T04:59:59.000Z"))).toBe(2025);
    expect(fiscalYearOf(new Date("2026-01-01T05:00:00.000Z"))).toBe(2026);
  });

  it("los límites del año corren a las 05:00 UTC (00:00 Bogotá)", () => {
    const { startUtc, endUtc } = fiscalYearBoundsUtc(2026);
    expect(startUtc.toISOString()).toBe("2026-01-01T05:00:00.000Z");
    expect(endUtc.toISOString()).toBe("2027-01-01T05:00:00.000Z");
  });
});

describe("evaluateFiscalRules (motor puro)", () => {
  it("sin ventas → todo en rango y sin cruce estimado", () => {
    const evals = evaluateFiscalRules(snap());
    expect(evals).toHaveLength(2);
    for (const ev of evals) {
      expect(ev.level).toBe("ok");
      expect(ev.projectedLevel).toBe("ok");
      expect(ev.estimatedCrossingAt).toBeNull();
      expect(ev.thresholdCop).toBe(THRESHOLD_2026);
    }
  });

  it("mapea niveles sobre el acumulado del año (70/90/100 %)", () => {
    const at = (pct: number) => Math.floor(THRESHOLD_2026 * pct);
    const [rule] = evaluateFiscalRules(snap({ grossIncomeYtdCop: at(0.72) }));
    expect(rule.ruleId).toBe("invoicing-threshold");
    expect(rule.level).toBe("watch");

    expect(evaluateFiscalRules(snap({ grossIncomeYtdCop: at(0.95) }))[0].level).toBe("warning");
    expect(evaluateFiscalRules(snap({ grossIncomeYtdCop: THRESHOLD_2026 + 1 }))[0].level).toBe(
      "critical",
    );
    // La regla de tarjeta se evalúa sobre su propia métrica:
    expect(evaluateFiscalRules(snap({ cardIncomeYtdCop: at(0.95) }))[1].level).toBe("warning");
  });

  it("proyección run-rate: ritmo reciente fuerte anuncia cruce aunque el acumulado esté bajo", () => {
    const current = Math.floor(THRESHOLD_2026 * 0.2); // 20 % acumulado
    const recent = 3_000_000_000; // 30 días × 100M centavos/día
    const [rule] = evaluateFiscalRules(
      snap({ grossIncomeYtdCop: current, grossIncomeRecentCop: recent }),
    );
    expect(rule.level).toBe("ok");
    expect(rule.projectedLevel).toBe("critical");
    // Cruce en ceil((threshold - current) / 100M) = 147 días desde NOW, dentro del año.
    expect(rule.estimatedCrossingAt?.toISOString()).toBe(
      new Date(NOW.getTime() + 147 * 24 * 60 * 60 * 1000).toISOString(),
    );
  });

  it("ritmo reciente insuficiente → no proyecta cruce", () => {
    const [rule] = evaluateFiscalRules(
      snap({
        grossIncomeYtdCop: Math.floor(THRESHOLD_2026 * 0.2),
        grossIncomeRecentCop: 100_000_000, // ~3,3M centavos/día → cierre ~40 %
      }),
    );
    expect(rule.projectedLevel).toBe("ok");
    expect(rule.estimatedCrossingAt).toBeNull();
  });
});

describe("getFiscalYearSnapshot (agregación)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("suma YTD + ventana reciente y atribuye la tarjeta al año de la orden", async () => {
    mockAggregates({
      grossYtd: 1_000,
      cardYtd: 600,
      electronicYtd: 900,
      grossRecent: 300,
      cardRecent: 200,
    });
    const s = await getFiscalYearSnapshot(NOW);
    expect(s).toMatchObject({
      year: 2026,
      uvtCop: 52_374,
      elapsedDays: 183,
      totalDaysInYear: 365,
      remainingDays: 182,
      grossIncomeYtdCop: 1_000,
      cardIncomeYtdCop: 600,
      electronicIncomeYtdCop: 900,
      grossIncomeRecentCop: 300,
      cardIncomeRecentCop: 200,
    });
    // La regla de tarjeta filtra paymentMethodType = CARD; la electrónica no.
    const txCalls = mockPrisma.wompiPaymentTransaction.aggregate.mock.calls;
    expect(txCalls[0][0].where.paymentMethodType).toBe("CARD");
    expect(txCalls[1][0].where.paymentMethodType).toBeUndefined();
    // Ventana YTD = año civil colombiano (05:00 UTC) y base BRUTA (incluye REFUNDED).
    const orderCalls = mockPrisma.order.aggregate.mock.calls;
    expect(orderCalls[0][0].where.createdAt).toEqual({
      gte: new Date("2026-01-01T05:00:00.000Z"),
      lt: new Date("2027-01-01T05:00:00.000Z"),
    });
    expect(orderCalls[0][0].where.status.in).toContain("REFUNDED");
    expect(orderCalls[0][0].where.deletedAt).toBeNull();
  });
});

describe("runFiscalWatch (despacho)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.alertState.findUnique.mockResolvedValue(null);
    mockPrisma.alertState.upsert.mockResolvedValue({});
    mockSendEmail.mockResolvedValue({ sent: true, id: "email_1" });
  });

  it("todo en rango → sin notificación ni email, pero sella el estado por regla-año", async () => {
    mockAggregates({ grossYtd: 0, cardYtd: 0, electronicYtd: 0, grossRecent: 0, cardRecent: 0 });
    await runFiscalWatch(NOW);
    expect(mockNotify).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
    const keys = mockPrisma.alertState.upsert.mock.calls.map((c) => c[0].where.key);
    expect(keys).toEqual([
      "fiscal-watch:invoicing-threshold:2026",
      "fiscal-watch:iva-card-condition:2026",
    ]);
  });

  it("70 % (watch) → notificación in-app info SIN email (email solo 90 %/100 %)", async () => {
    mockAggregates({
      grossYtd: Math.floor(THRESHOLD_2026 * 0.75),
      cardYtd: 0,
      electronicYtd: 0,
      grossRecent: 0,
      cardRecent: 0,
    });
    await runFiscalWatch(NOW);
    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockNotify.mock.calls[0][0]).toMatchObject({
      severity: "info",
      dedupKey: "fiscal-watch:invoicing-threshold:2026",
      actionUrl: "/admin/metricas",
    });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("90 % (warning) → in-app + UNA sola vez por email; un segundo ciclo no re-envía", async () => {
    mockAggregates({
      grossYtd: Math.floor(THRESHOLD_2026 * 0.95),
      cardYtd: 0,
      electronicYtd: 0,
      grossRecent: 0,
      cardRecent: 0,
    });
    await runFiscalWatch(NOW);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail.mock.calls[0][0].to).toBe("hola@lucamsshop.com");
    const sealed = JSON.parse(
      mockPrisma.alertState.upsert.mock.calls.find(
        (c) => c[0].where.key === "fiscal-watch:invoicing-threshold:2026",
      )![0].create.lastDetail,
    );
    expect(sealed).toEqual({ level: "warning", emailedLevel: "warning" });

    // Segundo ciclo: el estado ya venía sellado en warning → no repite email.
    vi.clearAllMocks();
    mockPrisma.alertState.findUnique.mockImplementation(
      async ({ where }: { where: { key: string } }) =>
        where.key === "fiscal-watch:invoicing-threshold:2026"
          ? { lastDetail: JSON.stringify({ level: "warning", emailedLevel: "warning" }) }
          : null,
    );
    mockAggregates({
      grossYtd: Math.floor(THRESHOLD_2026 * 0.96),
      cardYtd: 0,
      electronicYtd: 0,
      grossRecent: 0,
      cardRecent: 0,
    });
    await runFiscalWatch(NOW);
    expect(mockSendEmail).not.toHaveBeenCalled();
    // La notificación in-app SÍ se refresca (queda viva con el ratio vigente).
    expect(mockNotify).toHaveBeenCalledTimes(1);
  });

  it("si el email falla NO se sella emailedLevel → reintenta en el próximo ciclo", async () => {
    mockSendEmail.mockResolvedValue({ sent: false, reason: "boom", skipped: false });
    mockAggregates({
      grossYtd: Math.floor(THRESHOLD_2026 * 0.95),
      cardYtd: 0,
      electronicYtd: 0,
      grossRecent: 0,
      cardRecent: 0,
    });
    await runFiscalWatch(NOW);
    const sealed = JSON.parse(
      mockPrisma.alertState.upsert.mock.calls.find(
        (c) => c[0].where.key === "fiscal-watch:invoicing-threshold:2026",
      )![0].create.lastDetail,
    );
    expect(sealed).toEqual({ level: "warning", emailedLevel: "ok" });
  });

  it("acumulado bajo pero proyección de cruce → alerta temprana in-app (sin email)", async () => {
    mockAggregates({
      grossYtd: Math.floor(THRESHOLD_2026 * 0.2),
      cardYtd: 0,
      electronicYtd: 0,
      grossRecent: 3_000_000_000,
      cardRecent: 0,
    });
    await runFiscalWatch(NOW);
    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockNotify.mock.calls[0][0]).toMatchObject({
      severity: "info",
      dedupKey: "fiscal-watch:invoicing-threshold:2026:projection",
    });
    expect(mockNotify.mock.calls[0][0].title).toContain("proyecta superar");
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("100 % (critical) → severidad critical en el feed + email", async () => {
    mockAggregates({
      grossYtd: THRESHOLD_2026 + 500_000,
      cardYtd: 0,
      electronicYtd: 0,
      grossRecent: 0,
      cardRecent: 0,
    });
    await runFiscalWatch(NOW);
    expect(mockNotify.mock.calls[0][0]).toMatchObject({ severity: "critical" });
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });
});
