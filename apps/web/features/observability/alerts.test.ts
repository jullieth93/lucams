/*
 * Semántica de errors_spike (N-33, 2026-09-11): el doc (OBSERVABILITY.md) define
 * el pico como "5+ errores 500 en 5 min en una misma ruta", pero la regla contaba
 * un TOTAL global de cualquier ErrorLog — ruido repartido en rutas sanas pageaba
 * como incidente. Estos tests fijan la semántica alineada al doc: agrupar por
 * `routePath`, umbral 5 por ruta, filas sin ruta no atribuibles → no disparan.
 *
 * Además (misma remediación 2026-09-11):
 *   - N-12b — pending_payment_wompi_stale solo dispara cuando la orden supera
 *     PENDING_PAYMENT_EXPIRY_HOURS (la auto-cancelación debió correr: si sigue
 *     pendiente, el cron expire-pending-orders falló = fallo real, no abandono).
 *   - N-04 — email_bounce_rate: tasa de rebote 7d > 5% con ≥20 eventos → ALTA
 *     (in-app, nunca crítica: no re-emailar un problema que tarda en limpiarse).
 *   - N-19a — backup_stale: sin latido de backup (GitHub Actions) en >36h → ALTA.
 *
 * prisma mockeado (la integración DB vive en alerts.integration.test.ts): acá se
 * verifica el filtro/umbral/mensaje de forma determinista.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const groupBy = vi.hoisted(() => vi.fn());
// El arg tipado permite mockImplementation que distingue la query "stale wompi"
// (status PENDING_PAYMENT) del conteo de reconciliación.
const orderCount = vi.hoisted(() => vi.fn(async (_args?: { where?: { status?: string } }) => 0));
const webhookCount = vi.hoisted(() => vi.fn(async () => 0));
// F-07 (2026-09-19): las reglas de seguridad cuentan SecurityEvent por `event`.
const securityEventCount = vi.hoisted(() =>
  vi.fn(async (_args?: { where?: { event?: string } }) => 0),
);
const getCronHealth = vi.hoisted(() => vi.fn(async () => []));
// Tipos explícitos: sin ellos TS infiere `lastSuccessAt: Date` / `bounceRatePct:
// null` del valor inicial y los mockResolvedValue posteriores (null / number) fallan.
const getBackupHealth = vi.hoisted(() =>
  vi.fn(async (): Promise<{ lastSuccessAt: Date | null; stale: boolean }> => ({
    lastSuccessAt: new Date(),
    stale: false,
  })),
);
const getMonitorHealth = vi.hoisted(() =>
  vi.fn(
    async (): Promise<{
      lastRunAt: Date | null;
      lastDetail: string | null;
      stale: boolean;
      failing: boolean;
    }> => ({ lastRunAt: new Date(), lastDetail: "OK 5/5", stale: false, failing: false }),
  ),
);
const getEmailDeliverabilityStats = vi.hoisted(() =>
  vi.fn(
    async (): Promise<{
      windowDays: number;
      delivered: number;
      bounced: number;
      delayed: number;
      bounceRatePct: number | null;
      bounceRateAlert: boolean;
      excludedTestEvents: number;
    }> => ({
      windowDays: 7,
      delivered: 0,
      bounced: 0,
      delayed: 0,
      bounceRatePct: null,
      bounceRateAlert: false,
      excludedTestEvents: 0,
    }),
  ),
);

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  prisma: {
    errorLog: { groupBy },
    order: { count: orderCount },
    webhookEvent: { count: webhookCount },
    securityEvent: { count: securityEventCount },
  },
}));
vi.mock("@/lib/resend", () => ({ sendEmail: vi.fn(async () => ({ sent: true })) }));
vi.mock("@/lib/cms", () => ({ getSettingValue: async (_k: string, fb: string) => fb }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/features/notifications/service", () => ({ notify: vi.fn(async () => {}) }));
vi.mock("./cron-heartbeat", () => ({
  getCronHealth,
  getBackupHealth,
  getMonitorHealth,
  BACKUP_STALE_MS: 36 * 60 * 60 * 1000,
}));
vi.mock("./email-deliverability", () => ({ getEmailDeliverabilityStats }));

import { evaluateAlerts } from "./alerts";
import { PENDING_PAYMENT_EXPIRY_HOURS } from "@/features/orders/constants";

function errorGroups(rows: Array<{ routePath: string | null; n: number }>) {
  groupBy.mockResolvedValue(rows.map((r) => ({ routePath: r.routePath, _count: { _all: r.n } })));
}

beforeEach(() => {
  vi.clearAllMocks();
  errorGroups([]);
  orderCount.mockResolvedValue(0);
  securityEventCount.mockResolvedValue(0);
  getCronHealth.mockResolvedValue([]);
  getBackupHealth.mockResolvedValue({ lastSuccessAt: new Date(), stale: false });
  getMonitorHealth.mockResolvedValue({
    lastRunAt: new Date(),
    lastDetail: "OK 5/5",
    stale: false,
    failing: false,
  });
  getEmailDeliverabilityStats.mockResolvedValue({
    windowDays: 7,
    delivered: 0,
    bounced: 0,
    delayed: 0,
    bounceRatePct: null,
    bounceRateAlert: false,
    excludedTestEvents: 0,
  });
});

describe("evaluateAlerts — errors_spike por ruta (N-33)", () => {
  it("consulta ErrorLog agrupado por routePath en la ventana de 5 min desde `now`", async () => {
    const now = new Date("2026-09-11T12:00:00Z");

    await evaluateAlerts(now);

    expect(groupBy).toHaveBeenCalledWith({
      by: ["routePath"],
      where: { createdAt: { gte: new Date("2026-09-11T11:55:00Z") } },
      _count: { _all: true },
    });
  });

  it("5+ errores en UNA misma ruta → dispara, nombrando la ruta y el conteo", async () => {
    errorGroups([{ routePath: "/checkout/pago", n: 6 }]);

    const firing = await evaluateAlerts();
    const spike = firing.find((a) => a.key === "errors_spike");

    expect(spike).toBeDefined();
    expect(spike!.severity).toBe("alta");
    expect(spike!.title).toContain("6 errores 500");
    expect(spike!.title).toContain("/checkout/pago");
    expect(spike!.detail).toContain("/checkout/pago (6)");
    expect(spike!.detail).toContain("5 en 5 min");
    expect(spike!.action.toLowerCase()).toContain("observability");
  });

  it("ruido REPARTIDO entre rutas (4+4, 8 totales) NO dispara: ninguna ruta llega a 5", async () => {
    errorGroups([
      { routePath: "/api/a", n: 4 },
      { routePath: "/api/b", n: 4 },
    ]);

    const firing = await evaluateAlerts();

    expect(firing.some((a) => a.key === "errors_spike")).toBe(false);
  });

  it("errores sin routePath no son atribuibles a una ruta → NO disparan aunque sean 5+", async () => {
    errorGroups([{ routePath: null, n: 9 }]);

    const firing = await evaluateAlerts();

    expect(firing.some((a) => a.key === "errors_spike")).toBe(false);
  });

  it("varias rutas en pico → UNA alerta que detalla cada ruta (la peor en el título)", async () => {
    errorGroups([
      { routePath: "/api/x", n: 5 },
      { routePath: "/api/y", n: 8 },
      { routePath: "/api/ok", n: 2 },
    ]);

    const firing = await evaluateAlerts();
    const spikes = firing.filter((a) => a.key === "errors_spike");

    expect(spikes).toHaveLength(1);
    expect(spikes[0].title).toContain("/api/y"); // la de mayor conteo encabeza
    expect(spikes[0].detail).toContain("/api/y (8)");
    expect(spikes[0].detail).toContain("/api/x (5)");
    expect(spikes[0].detail).not.toContain("/api/ok");
  });
});

describe("evaluateAlerts — pending_payment_wompi_stale (N-12b: ventana de auto-cancelación)", () => {
  /** Solo la query "stale wompi" devuelve `stale`; el resto de conteos queda en 0. */
  function staleWompiCount(stale: number) {
    orderCount.mockImplementation((args?: { where?: { status?: string } }) =>
      Promise.resolve(args?.where?.status === "PENDING_PAYMENT" ? stale : 0),
    );
  }

  it("cuenta órdenes Wompi PENDING_PAYMENT más viejas que PENDING_PAYMENT_EXPIRY_HOURS desde `now`", async () => {
    const now = new Date("2026-09-11T12:00:00Z");

    await evaluateAlerts(now);

    expect(orderCount).toHaveBeenCalledWith({
      where: {
        status: "PENDING_PAYMENT",
        paymentMethod: "WOMPI",
        deletedAt: null,
        createdAt: {
          lt: new Date(now.getTime() - PENDING_PAYMENT_EXPIRY_HOURS * 60 * 60 * 1000),
        },
      },
    });
  });

  it("una orden que supera la ventana → CRÍTICA: la auto-cancelación no corrió (acción = revisar el cron)", async () => {
    staleWompiCount(2);

    const firing = await evaluateAlerts();
    const stale = firing.find((a) => a.key === "pending_payment_wompi_stale");

    expect(stale).toBeDefined();
    expect(stale!.severity).toBe("crítica");
    expect(stale!.title).toContain("2 orden(es)");
    expect(stale!.title).toContain(`${PENDING_PAYMENT_EXPIRY_HOURS}h`);
    // El mensaje ya NO habla de "checkout abandonado": el fallo es del sistema.
    expect(stale!.detail).toContain("auto-cancelación");
    expect(stale!.detail).toContain("expire-pending-orders");
    expect(stale!.action).toContain("expire-pending-orders");
    expect(stale!.action).toContain("/admin/observability");
  });

  it("sin órdenes vencidas → NO dispara (el abandono dentro de la ventana es esperado)", async () => {
    staleWompiCount(0);

    const firing = await evaluateAlerts();

    expect(firing.some((a) => a.key === "pending_payment_wompi_stale")).toBe(false);
  });
});

describe("evaluateAlerts — email_bounce_rate (N-04)", () => {
  function emailStats(over: {
    delivered: number;
    bounced: number;
    delayed?: number;
    alert: boolean;
  }) {
    const terminal = over.delivered + over.bounced;
    getEmailDeliverabilityStats.mockResolvedValue({
      windowDays: 7,
      delivered: over.delivered,
      bounced: over.bounced,
      delayed: over.delayed ?? 0,
      bounceRatePct: terminal > 0 ? (over.bounced / terminal) * 100 : null,
      bounceRateAlert: over.alert,
      excludedTestEvents: 0,
    });
  }

  it("tasa > 5% con volumen suficiente → dispara ALTA con la tasa y los conteos", async () => {
    emailStats({ delivered: 30, bounced: 10, alert: true });

    const firing = await evaluateAlerts();
    const bounce = firing.find((a) => a.key === "email_bounce_rate");

    expect(bounce).toBeDefined();
    // ALTA a propósito (in-app): NUNCA crítica — no re-emailar cada 30 min un
    // problema de entregabilidad que tarda en limpiarse.
    expect(bounce!.severity).toBe("alta");
    expect(bounce!.title).toContain("25.0%");
    expect(bounce!.detail).toContain("10 rebotados de 40");
    expect(bounce!.action).toContain("/admin/observability");
  });

  it("tasa alta pero SIN volumen mínimo (o bajo el umbral) → NO dispara", async () => {
    emailStats({ delivered: 2, bounced: 1, alert: false }); // 33% pero 3 eventos

    const firing = await evaluateAlerts();

    expect(firing.some((a) => a.key === "email_bounce_rate")).toBe(false);
  });

  it("sin eventos terminales → NO dispara", async () => {
    emailStats({ delivered: 0, bounced: 0, alert: false });

    const firing = await evaluateAlerts();

    expect(firing.some((a) => a.key === "email_bounce_rate")).toBe(false);
  });
});

describe("evaluateAlerts — backup_stale (N-19a)", () => {
  it("latido más viejo que 36h → ALTA con las horas desde el último éxito", async () => {
    const now = new Date("2026-09-11T12:00:00Z");
    getBackupHealth.mockResolvedValue({
      lastSuccessAt: new Date(now.getTime() - 50 * 60 * 60 * 1000),
      stale: true,
    });

    const firing = await evaluateAlerts(now);
    const backup = firing.find((a) => a.key === "backup_stale");

    expect(backup).toBeDefined();
    expect(backup!.severity).toBe("alta"); // in-app; NO crítica (sin email cada 30 min)
    expect(backup!.title).toContain("50h");
    expect(backup!.action).toContain("backup.yml");
  });

  it("sin NINGÚN latido registrado → dispara igual (el backup nunca reportó éxito)", async () => {
    getBackupHealth.mockResolvedValue({ lastSuccessAt: null, stale: true });

    const firing = await evaluateAlerts();
    const backup = firing.find((a) => a.key === "backup_stale");

    expect(backup).toBeDefined();
    expect(backup!.title).toContain("Ningún backup");
    expect(backup!.detail).toContain("PITR");
  });

  it("latido fresco → NO dispara", async () => {
    getBackupHealth.mockResolvedValue({ lastSuccessAt: new Date(), stale: false });

    const firing = await evaluateAlerts();

    expect(firing.some((a) => a.key === "backup_stale")).toBe(false);
  });
});

describe("evaluateAlerts — monitor externo de uptime (VM, 2026-09-13)", () => {
  it("última corrida con FALLA → dispara ALTA uptime_monitor_failing con el detalle", async () => {
    getMonitorHealth.mockResolvedValue({
      lastRunAt: new Date(),
      lastDetail: "FALLA 1/5: /api/health/wompi",
      stale: false,
      failing: true,
    });

    const firing = await evaluateAlerts();

    const alert = firing.find((a) => a.key === "uptime_monitor_failing");
    expect(alert).toBeDefined();
    expect(alert!.severity).toBe("alta");
    expect(alert!.title).toContain("FALLA 1/5: /api/health/wompi");
    expect(alert!.action).toContain("/admin/integraciones");
  });

  it("failing tiene prioridad sobre stale (una corrida fallida reciente no es VM apagada)", async () => {
    getMonitorHealth.mockResolvedValue({
      lastRunAt: new Date(),
      lastDetail: "FALLA 2/5: /api/health/all, /api/health/crons",
      stale: true, // aunque el flag también venga viejo, failing manda
      failing: true,
    });

    const firing = await evaluateAlerts();

    expect(firing.some((a) => a.key === "uptime_monitor_failing")).toBe(true);
    expect(firing.some((a) => a.key === "uptime_monitor_stale")).toBe(false);
  });

  it("sin corrida en >30 min → dispara ALTA uptime_monitor_stale (VM apagada)", async () => {
    getMonitorHealth.mockResolvedValue({
      lastRunAt: new Date(Date.now() - 45 * 60 * 1000),
      lastDetail: "OK 5/5",
      stale: true,
      failing: false,
    });

    const firing = await evaluateAlerts();

    const alert = firing.find((a) => a.key === "uptime_monitor_stale");
    expect(alert).toBeDefined();
    expect(alert!.severity).toBe("alta");
    expect(alert!.title).toContain("45 min");
    expect(alert!.action).toContain("uptime-monitor-prd");
  });

  it("nunca ha reportado → uptime_monitor_stale", async () => {
    getMonitorHealth.mockResolvedValue({
      lastRunAt: null,
      lastDetail: null,
      stale: true,
      failing: false,
    });

    const firing = await evaluateAlerts();

    expect(firing.some((a) => a.key === "uptime_monitor_stale")).toBe(true);
  });

  it("corrida fresca OK → NO dispara ninguna de las dos", async () => {
    getMonitorHealth.mockResolvedValue({
      lastRunAt: new Date(),
      lastDetail: "OK 5/5",
      stale: false,
      failing: false,
    });

    const firing = await evaluateAlerts();

    expect(firing.some((a) => a.key === "uptime_monitor_stale")).toBe(false);
    expect(firing.some((a) => a.key === "uptime_monitor_failing")).toBe(false);
  });
});

describe("evaluateAlerts — reglas de seguridad sobre SecurityEvent (F-07, 2026-09-19)", () => {
  /** Solo el evento indicado devuelve `n`; el resto de conteos queda en 0. */
  function securityCount(event: string, n: number) {
    securityEventCount.mockImplementation((args?: { where?: { event?: string } }) =>
      Promise.resolve(args?.where?.event === event ? n : 0),
    );
  }

  it("cuenta logins admin fallidos en la ventana de 15 min desde `now`", async () => {
    const now = new Date("2026-09-19T12:00:00Z");

    await evaluateAlerts(now);

    expect(securityEventCount).toHaveBeenCalledWith({
      where: {
        event: "auth.admin_login.fail",
        createdAt: { gte: new Date("2026-09-19T11:45:00Z") },
      },
    });
  });

  it("≥5 logins admin fallidos en 15 min → ALTA (umbral coherente con el rate limit 5/15 min)", async () => {
    securityCount("auth.admin_login.fail", 7);

    const firing = await evaluateAlerts();
    const alert = firing.find((a) => a.key === "security_admin_login_fails");

    expect(alert).toBeDefined();
    // ALTA (in-app; NO crítica): el rate limit ya frena al atacante — la alerta
    // es para investigar la campaña, no para re-emailar cada 30 min.
    expect(alert!.severity).toBe("alta");
    expect(alert!.title).toContain("7");
    expect(alert!.action).toContain("/admin/observability");
  });

  it("<5 logins admin fallidos → NO dispara (un usuario que olvidó su clave no es un ataque)", async () => {
    securityCount("auth.admin_login.fail", 4);

    const firing = await evaluateAlerts();

    expect(firing.some((a) => a.key === "security_admin_login_fails")).toBe(false);
  });

  it("≥3 firmas/secretos de webhook inválidos en 5 min → MEDIA (objetivo OBSERVABILITY.md)", async () => {
    securityCount("webhook.invalid_signature", 3);

    const firing = await evaluateAlerts();
    const alert = firing.find((a) => a.key === "security_webhook_invalid");

    expect(alert).toBeDefined();
    expect(alert!.severity).toBe("media");
    expect(alert!.title).toContain("3");
    expect(alert!.detail.toLowerCase()).toContain("replay");
  });

  it("<3 firmas inválidas → NO dispara", async () => {
    securityCount("webhook.invalid_signature", 2);

    const firing = await evaluateAlerts();

    expect(firing.some((a) => a.key === "security_webhook_invalid")).toBe(false);
  });
});
