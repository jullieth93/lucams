/*
 * Integración DB — alertas del sistema (Bloque D → centro de notificaciones,
 * 2026-08-05). sendEmail mockeado para no pegar a Resend. Verifica:
 *   - la regla de pico de errores dispara (evaluateAlerts, intacta),
 *   - CADA alerta que dispara crea/actualiza su notificación in-app (dedupKey),
 *   - el EMAIL del lote solo sale cuando hay una CRÍTICA (dedup AlertState intacto).
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const emailCalls: Array<{ to: string; subject: string }> = [];
vi.mock("@/lib/resend", () => ({
  sendEmail: async (args: { to: string; subject: string }) => {
    emailCalls.push({ to: args.to, subject: args.subject });
    return { sent: true };
  },
}));
// getSettingValue usa unstable_cache (requiere contexto Next, ausente en vitest).
vi.mock("@/lib/cms", () => ({ getSettingValue: async (_k: string, fallback: string) => fallback }));

import { prisma } from "@/lib/db";
import { evaluateAlerts, dispatchAlerts } from "./alerts";

const hasDb = !!process.env.DATABASE_URL;
// F-6 (auditoría 2026-08-24): los mensajes se persisten con scrubPii (ver
// lib/error-capture.integration.test.ts) — RUN solo con letras para que el
// valor almacenado coincida con el consultado.
const RUN = `alr${Date.now()}${Math.floor(Math.random() * 1e6)}`.replace(
  /\d/g,
  (d) => "ABCDEFGHIJ"[Number(d)],
);
const MSG = `${RUN} boom`;
const ALERT_KEYS = ["errors_spike", "pending_payment_wompi_stale"];
let staleOrderId: string | null = null;

describe.skipIf(!hasDb)("observability/alerts — integración DB", { timeout: 30_000 }, () => {
  beforeAll(async () => {
    await prisma.errorLog.createMany({
      data: Array.from({ length: 5 }, () => ({ message: MSG, routePath: "/x" })),
    });
    await prisma.alertState.deleteMany({ where: { key: { in: ALERT_KEYS } } });
    await prisma.notification.deleteMany({ where: { dedupKey: { in: ALERT_KEYS } } });
  });

  afterAll(async () => {
    await prisma.errorLog.deleteMany({ where: { message: { startsWith: RUN } } }).catch(() => {});
    if (staleOrderId) {
      await prisma.order.deleteMany({ where: { id: staleOrderId } }).catch(() => {});
    }
    await prisma.alertState.deleteMany({ where: { key: { in: ALERT_KEYS } } }).catch(() => {});
    await prisma.notification
      .deleteMany({ where: { dedupKey: { in: ALERT_KEYS } } })
      .catch(() => {});
    await prisma.$disconnect();
  });

  it("evaluateAlerts dispara errors_spike con 5+ errores en 5 min (con qué hacer)", async () => {
    const firing = await evaluateAlerts();
    const spike = firing.find((a) => a.key === "errors_spike");
    expect(spike).toBeDefined();
    expect(spike!.severity).toBe("alta");
    expect(spike!.action.toLowerCase()).toContain("observability");
  });

  it("dispatch SIEMPRE notifica in-app y, sin críticas en el lote, NO emailéa ni sella AlertState", async () => {
    // ¿Alguna crítica disparando por datos de OTRAS suites (DB compartida)?
    // Las aserciones de email solo son deterministas si no — ver comentario abajo.
    const anyCritical = (await evaluateAlerts()).some((a) => a.severity === "crítica");
    emailCalls.length = 0;

    const result = await dispatchAlerts();

    // Notificación in-app SIEMPRE (fuente de verdad), con severidad mapeada alta→warning.
    const n = await prisma.notification.findFirst({ where: { dedupKey: "errors_spike" } });
    expect(n).toBeTruthy();
    expect(n!.type).toBe("ALERT");
    expect(n!.severity).toBe("warning");
    expect(n!.actionUrl).toBe("/admin/observability");
    expect(n!.readAt).toBeNull();
    expect(n!.detail).toContain("Qué hacer");

    if (!anyCritical) {
      // Política 2026-08-05: sin críticas NO hay email y no se sella lastSentAt
      // (la alerta queda disponible para viajar en el correo de una futura crítica).
      expect(result.sent).not.toContain("errors_spike");
      expect(emailCalls).toHaveLength(0);
      expect(await prisma.alertState.findUnique({ where: { key: "errors_spike" } })).toBeNull();
    }
  });

  it("con una crítica en el lote SÍ sale UN email (y AlertState lo dedup 30 min; el feed no duplica)", async () => {
    // Idempotente ante retry de vitest (repite el test sin beforeAll/afterAll).
    await prisma.order.deleteMany({ where: { number: `${RUN}-stale` } });
    await prisma.alertState.deleteMany({ where: { key: { in: ALERT_KEYS } } });
    await prisma.notification.deleteMany({ where: { dedupKey: { in: ALERT_KEYS } } });

    // Siembra la crítica: orden Wompi >2h en PENDING_PAYMENT (backstop #9).
    const stale = await prisma.order.create({
      data: {
        number: `${RUN}-stale`,
        email: `${RUN}@lucams.test`,
        phone: "3001112233",
        shippingAddress: { fullName: "T", city: "Bogotá", department: "Bogotá D.C." },
        subtotal: 40000,
        shipping: 10000,
        total: 50000,
        paymentMethod: "WOMPI",
        status: "PENDING_PAYMENT",
        createdAt: new Date(Date.now() - 3 * 3600 * 1000),
      },
      select: { id: true },
    });
    staleOrderId = stale.id;

    emailCalls.length = 0;
    const first = await dispatchAlerts();
    expect(first.sent).toContain("pending_payment_wompi_stale");
    // errors_spike viaja en el mismo correo (contexto) — salvo que otra suite lo
    // hubiera emailado justo antes (DB compartida): entonces cae en skipped.
    expect([...first.sent, ...first.skipped]).toContain("errors_spike");
    expect(emailCalls).toHaveLength(1);
    expect(emailCalls[0].subject).toMatch(/alertas? Lucams/i);

    // Notificación de la crítica: severidad mapeada crítica→critical + deep link a pedidos.
    const crit = await prisma.notification.findFirst({
      where: { dedupKey: "pending_payment_wompi_stale" },
    });
    expect(crit).toBeTruthy();
    expect(crit!.severity).toBe("critical");
    expect(crit!.actionUrl).toBe("/admin/pedidos");

    // Segundo ciclo inmediato: AlertState frena el email; el feed ACTUALIZA la
    // no leída en vez de duplicar (dedupKey).
    const second = await dispatchAlerts();
    expect(second.skipped).toContain("errors_spike");
    expect(second.skipped).toContain("pending_payment_wompi_stale");
    expect(second.sent).not.toContain("errors_spike");
    expect(second.sent).not.toContain("pending_payment_wompi_stale");
    expect(emailCalls).toHaveLength(1); // NO se re-envió
    expect(await prisma.notification.count({ where: { dedupKey: "errors_spike" } })).toBe(1);
    expect(
      await prisma.notification.count({ where: { dedupKey: "pending_payment_wompi_stale" } }),
    ).toBe(1);
  });
});
