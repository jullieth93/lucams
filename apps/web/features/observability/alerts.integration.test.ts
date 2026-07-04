/*
 * Integración DB — alertas por email (Bloque D). sendEmail mockeado para no
 * pegar a Resend. Verifica que la regla de pico de errores dispara y que el
 * dispatch deduplica dentro de la ventana anti-spam.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/resend", () => ({ sendEmail: async () => ({ sent: true }) }));
// getSettingValue usa unstable_cache (requiere contexto Next, ausente en vitest).
vi.mock("@/lib/cms", () => ({ getSettingValue: async (_k: string, fallback: string) => fallback }));

import { prisma } from "@/lib/db";
import { evaluateAlerts, dispatchAlerts } from "./alerts";

const hasDb = !!process.env.DATABASE_URL;
const RUN = `alr${Date.now()}${Math.floor(Math.random() * 1e6)}`;
const MSG = `${RUN} boom`;

describe.skipIf(!hasDb)("observability/alerts — integración DB", { timeout: 30_000 }, () => {
  beforeAll(async () => {
    await prisma.errorLog.createMany({
      data: Array.from({ length: 5 }, () => ({ message: MSG, routePath: "/x" })),
    });
    await prisma.alertState.deleteMany({ where: { key: "errors_spike" } });
  });

  afterAll(async () => {
    await prisma.errorLog.deleteMany({ where: { message: { startsWith: RUN } } }).catch(() => {});
    await prisma.alertState.deleteMany({ where: { key: "errors_spike" } }).catch(() => {});
    await prisma.$disconnect();
  });

  it("evaluateAlerts dispara errors_spike con 5+ errores en 5 min (con qué hacer)", async () => {
    const firing = await evaluateAlerts();
    const spike = firing.find((a) => a.key === "errors_spike");
    expect(spike).toBeDefined();
    expect(spike!.severity).toBe("alta");
    expect(spike!.action.toLowerCase()).toContain("observability");
  });

  it("dispatchAlerts envía y luego DEDUPLICA la misma alerta", async () => {
    const first = await dispatchAlerts();
    expect(first.sent).toContain("errors_spike");

    // Segundo intento inmediato → deduplicado por AlertState (ventana 30 min).
    const second = await dispatchAlerts();
    expect(second.skipped).toContain("errors_spike");
    expect(second.sent).not.toContain("errors_spike");
  });
});
