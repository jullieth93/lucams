/*
 * Integración — getDailySummary + sendDailySummary contra la DB de dev.
 *
 * getDailySummary cuenta GLOBALMENTE (no hay scoping por RUN), así que asertamos
 * LOWER BOUNDS tras crear fixtures RUN-prefijados (robusto ante datos concurrentes de
 * otros tests). sendDailySummary se prueba con el email mockeado + la idempotencia de
 * 12h. afterAll borra las órdenes creadas + el AlertState "daily_summary".
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// next/cache passthrough (getSettingValue usa unstable_cache).
vi.mock("next/cache", () => ({
  unstable_cache:
    (fn: (...a: unknown[]) => unknown) =>
    (...a: unknown[]) =>
      fn(...a),
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}));

const emailsSent: Array<{ to: string; subject: string }> = [];
vi.mock("@/lib/resend", () => ({
  sendEmail: async (args: { to: string; subject: string }) => {
    emailsSent.push({ to: args.to, subject: args.subject });
    return { sent: true };
  },
}));

vi.mock("@/lib/cms", () => ({
  getSettingValue: async (_key: string, fallback: string) => fallback,
}));

import { prisma } from "@/lib/db";
import { getDailySummary, sendDailySummary } from "./daily-summary";

const hasDb = Boolean(process.env.DATABASE_URL);
const RUN = `dsum${Date.now()}${Math.floor(Math.random() * 1e6)}`.toLowerCase();
const createdOrderIds: string[] = [];

async function makeOrder(tag: string, status: string, total: number): Promise<string> {
  const o = await prisma.order.create({
    data: {
      number: `${RUN}-${tag}`,
      email: `${RUN}@lucams.test`,
      phone: "3001112233",
      shippingAddress: { fullName: "T", city: "Bogotá", department: "Bogotá D.C." },
      subtotal: total - 10000,
      shipping: 10000,
      total,
      paymentMethod: "WOMPI",
      status: status as never,
    },
    select: { id: true },
  });
  createdOrderIds.push(o.id);
  return o.id;
}

describe.skipIf(!hasDb)("daily-summary — integración DB", () => {
  beforeAll(async () => {
    await makeOrder("paid1", "PAID", 55000);
    await makeOrder("paid2", "PAID", 45000);
    await makeOrder("pend1", "PENDING_PAYMENT", 30000);
  });

  afterAll(async () => {
    await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } }).catch(() => {});
    // La clave del resumen es singleton (no RUN-scoped). En dev el cron real no está
    // agendado, así que borrarla es seguro y evita contaminar el estado.
    await prisma.alertState.deleteMany({ where: { key: "daily_summary" } }).catch(() => {});
  });

  it("getDailySummary refleja las órdenes creadas (lower bounds) y tiene forma válida", async () => {
    const s = await getDailySummary();
    // Creamos 3 no-DRAFT (2 PAID + 1 PENDING_PAYMENT) con total 55k+45k pagados.
    expect(s.ordersLast24h).toBeGreaterThanOrEqual(3);
    expect(s.paidOrdersLast24h).toBeGreaterThanOrEqual(2);
    expect(s.revenueLast24hCop).toBeGreaterThanOrEqual(100000); // 55000 + 45000
    expect(s.pendingPayment).toBeGreaterThanOrEqual(1);
    expect(s.toShip).toBeGreaterThanOrEqual(2); // 2 PAID ∈ [PAID, FULFILLING]
    // Forma: todos los campos numéricos >= 0.
    for (const k of [
      "lowStock",
      "pendingReviews",
      "abandonedCarts24h",
      "recoveredCarts24h",
      "errors24h",
      "needsReconciliation",
    ] as const) {
      expect(typeof s[k]).toBe("number");
      expect(s[k]).toBeGreaterThanOrEqual(0);
    }
  });

  it("sendDailySummary envía el email y luego DEDUP (no re-envía dentro de 12h)", async () => {
    await prisma.alertState.deleteMany({ where: { key: "daily_summary" } });
    emailsSent.length = 0;
    const now = new Date();

    const first = await sendDailySummary(now);
    expect(first.sent).toBe(true);
    expect(emailsSent).toHaveLength(1);
    expect(emailsSent[0].subject).toContain("Resumen Lucams");

    // 2da llamada inmediata (mismo now) → dentro de la ventana de 12h → skip.
    const second = await sendDailySummary(now);
    expect(second.sent).toBe(false);
    expect(second.skipped).toBe("already_sent");
    expect(emailsSent).toHaveLength(1); // NO se re-envió
  });
});
