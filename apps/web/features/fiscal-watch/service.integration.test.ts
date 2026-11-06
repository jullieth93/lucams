/*
 * Integración — vigilancia fiscal (ADR-196) contra la DB de dev.
 *
 * El snapshot cuenta GLOBALMENTE (no hay scoping por RUN), así que se asertan
 * LOWER BOUNDS tras crear fixtures RUN-prefijados (robusto ante datos de otros
 * tests o del seed local). Se verifica:
 *   - la base bruta conservadora (REFUNDED también suma),
 *   - la discriminación tarjeta (CARD) vs electrónicos (PSE suma en la línea
 *     informativa pero NO en la regla de IVA),
 *   - runFiscalWatch de punta a punta: sella AlertState por regla-año.
 * El email va mockeado (guardián: si el módulo enviara sin mock, se vería acá).
 * afterAll borra fixtures + AlertState + notificaciones fiscal-watch.
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
    return { sent: true, id: "email_test" };
  },
}));

vi.mock("@/lib/cms", () => ({
  getSettingValue: async (_key: string, fallback: string) => fallback,
}));

import { prisma } from "@/lib/db";
import { getFiscalYearSnapshot, runFiscalWatch } from "./service";

const hasDb = Boolean(process.env.DATABASE_URL);
const RUN = `fw${Date.now()}${Math.floor(Math.random() * 1e6)}`.toLowerCase();
const YEAR = new Date(Date.now() - 5 * 60 * 60 * 1000).getUTCFullYear(); // año en COT
const createdOrderIds: string[] = [];

const PAID_TOTAL = 55_000_00; // $55.000
const REFUNDED_TOTAL = 30_000_00; // $30.000 (reembolsada: suma igual — base bruta)
const CARD_AMOUNT = 40_000_00; // $40.000 con tarjeta
const PSE_AMOUNT = 25_000_00; // $25.000 por PSE (no cuenta para la regla de tarjeta)

async function makeOrder(tag: string, status: "PAID" | "REFUNDED", total: number): Promise<string> {
  const o = await prisma.order.create({
    data: {
      number: `${RUN}-${tag}`,
      email: `${RUN}@lucams.test`,
      phone: "3001112233",
      shippingAddress: { fullName: "T", city: "Bogotá", department: "Bogotá D.C." },
      subtotal: total - 10_000,
      shipping: 10_000,
      total,
      paymentMethod: "WOMPI",
      status,
    },
    select: { id: true },
  });
  createdOrderIds.push(o.id);
  return o.id;
}

async function makeApprovedTx(
  orderId: string,
  tag: string,
  amount: number,
  method: "CARD" | "PSE",
  sequence: number,
) {
  const attempt = await prisma.wompiPaymentAttempt.create({
    data: { orderId, sequence, reference: `${RUN}-${tag}`, amountInCents: amount },
    select: { id: true },
  });
  await prisma.wompiPaymentTransaction.create({
    data: {
      attemptId: attempt.id,
      externalId: `${RUN}-${tag}`,
      amountInCents: amount,
      status: "APPROVED",
      paymentMethodType: method,
    },
  });
}

describe.skipIf(!hasDb)("fiscal-watch — integración DB", () => {
  beforeAll(async () => {
    const paidOrder = await makeOrder("paid", "PAID", PAID_TOTAL);
    await makeOrder("refunded", "REFUNDED", REFUNDED_TOTAL);
    await makeApprovedTx(paidOrder, "card", CARD_AMOUNT, "CARD", 1);
    await makeApprovedTx(paidOrder, "pse", PSE_AMOUNT, "PSE", 2);
  });

  afterAll(async () => {
    await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } }).catch(() => {});
    await prisma.alertState
      .deleteMany({ where: { key: { startsWith: `fiscal-watch:` } } })
      .catch(() => {});
    await prisma.notification
      .deleteMany({ where: { dedupKey: { startsWith: `fiscal-watch:` } } })
      .catch(() => {});
  });

  it("el snapshot suma la base bruta (PAID + REFUNDED) y discrimina CARD de PSE", async () => {
    const s = await getFiscalYearSnapshot();
    expect(s.year).toBe(YEAR);
    // Lower bounds: puede haber más datos del seed/otros tests.
    expect(s.grossIncomeYtdCop).toBeGreaterThanOrEqual(PAID_TOTAL + REFUNDED_TOTAL);
    expect(s.cardIncomeYtdCop).toBeGreaterThanOrEqual(CARD_AMOUNT);
    // La línea electrónica suma CARD + PSE; la regla de tarjeta NO ve el PSE.
    expect(s.electronicIncomeYtdCop).toBeGreaterThanOrEqual(CARD_AMOUNT + PSE_AMOUNT);
  });

  it("runFiscalWatch sella el estado por regla-año sin lanzar", async () => {
    const { snapshot, evaluations } = await runFiscalWatch();
    expect(evaluations.map((e) => e.ruleId).sort()).toEqual([
      "invoicing-threshold",
      "iva-card-condition",
    ]);
    const rows = await prisma.alertState.findMany({
      where: {
        key: {
          in: [
            `fiscal-watch:invoicing-threshold:${YEAR}`,
            `fiscal-watch:iva-card-condition:${YEAR}`,
          ],
        },
      },
    });
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      const state = JSON.parse(row.lastDetail ?? "{}") as { level?: string };
      expect(state.level).toBeDefined();
    }
    expect(snapshot.grossIncomeYtdCop).toBeGreaterThanOrEqual(PAID_TOTAL + REFUNDED_TOTAL);
  });
});
