import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import type { WompiTransaction } from "@/lib/wompi";

const { listTransactionsByReference } = vi.hoisted(() => ({
  listTransactionsByReference: vi.fn(),
}));

vi.mock("@/lib/wompi", () => ({ listTransactionsByReference }));

import { findOrderIdByWompiReference, resolveWompiPaymentReference } from "./payment-reference";

const RUN = `wompi${Date.now()}${Math.floor(Math.random() * 1e6)}`;
let sequence = 0;

function tx(
  reference: string,
  status: WompiTransaction["status"],
  createdAt: string,
  amount = 10_000,
  id = `tx-${status.toLowerCase()}-${Math.random().toString(36).slice(2)}`,
): WompiTransaction {
  return {
    id,
    reference,
    status,
    amount_in_cents: amount,
    currency: "COP",
    customer_email: null,
    payment_method_type: "CARD",
    created_at: createdAt,
    finalized_at: status === "PENDING" ? null : createdAt,
    status_message: null,
  };
}

async function makeOrder(overrides: {
  total?: number;
  createdAt?: Date;
  paymentAttempt?: number;
  wompiReference?: string | null;
  wompiTransactionId?: string | null;
}) {
  sequence += 1;
  const total = overrides.total ?? 10_000;
  return prisma.order.create({
    data: {
      number: `LCM-2026-${RUN}-${sequence}`,
      email: `${RUN}-${sequence}@example.com`,
      phone: "3000000000",
      shippingAddress: {},
      subtotal: total,
      shipping: 0,
      total,
      status: "PENDING_PAYMENT",
      paymentMethod: "WOMPI",
      createdAt: overrides.createdAt ?? new Date(),
      paymentAttempt: overrides.paymentAttempt ?? 0,
      wompiReference: overrides.wompiReference ?? null,
      wompiTransactionId: overrides.wompiTransactionId ?? null,
    },
    select: {
      id: true,
      number: true,
      total: true,
      createdAt: true,
    },
  });
}

function minutesAfterOrder(order: { createdAt: Date }, minutes: number): string {
  return new Date(order.createdAt.getTime() + minutes * 60_000).toISOString();
}

beforeEach(() => {
  vi.clearAllMocks();
  listTransactionsByReference.mockResolvedValue([]);
});

afterEach(async () => {
  await prisma.order.deleteMany({ where: { number: { startsWith: `LCM-2026-${RUN}-` } } });
});

describe("resolveWompiPaymentReference — ledger real", () => {
  it("crea un intento único con monto congelado y lo reutiliza solo si no hay transacciones", async () => {
    const order = await makeOrder({});

    const first = await resolveWompiPaymentReference(order.id);
    const second = await resolveWompiPaymentReference(order.id);

    expect(first.kind).toBe("ready");
    expect(second.kind).toBe("ready");
    if (first.kind !== "ready" || second.kind !== "ready") return;
    expect(first.reference).toBe(second.reference);
    expect(first.reference).toMatch(new RegExp(`^${order.number}-[0-9a-f-]{36}$`));
    expect(first.amountInCents).toBe(order.total);
    expect(second.amountInCents).toBe(order.total);
    expect(listTransactionsByReference).toHaveBeenCalledTimes(1);
  });

  it("rota a otra referencia UUID tras un DECLINED y conserva el intento anterior", async () => {
    const order = await makeOrder({});
    const first = await resolveWompiPaymentReference(order.id);
    if (first.kind !== "ready") throw new Error("No se creó el primer intento");
    listTransactionsByReference.mockResolvedValue([
      tx(first.reference, "DECLINED", minutesAfterOrder(order, 5)),
    ]);

    const second = await resolveWompiPaymentReference(order.id);

    expect(second.kind).toBe("ready");
    if (second.kind !== "ready") return;
    expect(second.reference).not.toBe(first.reference);
    const attempts = await prisma.wompiPaymentAttempt.findMany({
      where: { orderId: order.id },
      orderBy: { sequence: "asc" },
    });
    expect(attempts).toHaveLength(2);
    expect(attempts[0].status).toBe("SUPERSEDED");
    expect(attempts[1].status).toBe("OPEN");
  });

  it("una aprobación histórica anterior a la orden no la paga ni bloquea un intento nuevo", async () => {
    const order = await makeOrder({
      paymentAttempt: 1,
      wompiTransactionId: "tx-historical",
    });
    await prisma.order.update({
      where: { id: order.id },
      data: { wompiReference: order.number },
    });
    listTransactionsByReference.mockResolvedValue([
      tx(order.number, "APPROVED", "2026-08-12T00:43:29.420Z", 5_387_000, "tx-historical"),
    ]);

    const result = await resolveWompiPaymentReference(order.id);

    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.reference).not.toBe(order.number);
    const persisted = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { status: true, wompiTransactionId: true, needsReconciliation: true },
    });
    expect(persisted.status).toBe("PENDING_PAYMENT");
    expect(persisted.wompiTransactionId).toBeNull();
    expect(persisted.needsReconciliation).toBe(false);
  });

  it("una aprobación vigente se concilia y queda asociada al intento", async () => {
    const order = await makeOrder({ paymentAttempt: 1 });
    await prisma.order.update({ where: { id: order.id }, data: { wompiReference: order.number } });
    listTransactionsByReference.mockResolvedValue([
      tx(order.number, "APPROVED", minutesAfterOrder(order, 5), order.total, "tx-current"),
    ]);

    const result = await resolveWompiPaymentReference(order.id);

    expect(result).toEqual({ kind: "approved", txId: "tx-current" });
    const attempt = await prisma.wompiPaymentAttempt.findUniqueOrThrow({
      where: { reference: order.number },
      include: { transactions: true },
    });
    expect(attempt.status).toBe("APPROVED");
    expect(attempt.transactions[0].externalId).toBe("tx-current");
  });

  it("un monto aprobado distinto exige reconciliación y no dispara otro cobro", async () => {
    const order = await makeOrder({ paymentAttempt: 1 });
    await prisma.order.update({ where: { id: order.id }, data: { wompiReference: order.number } });
    listTransactionsByReference.mockResolvedValue([
      tx(order.number, "APPROVED", minutesAfterOrder(order, 5), order.total + 1, "tx-mismatch"),
    ]);

    const result = await resolveWompiPaymentReference(order.id);

    expect(result).toEqual({ kind: "lookup_failed" });
    const persisted = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { needsReconciliation: true, status: true },
    });
    expect(persisted.needsReconciliation).toBe(true);
    expect(persisted.status).toBe("PENDING_PAYMENT");
  });

  it("PENDING bloquea otro checkout", async () => {
    const order = await makeOrder({ paymentAttempt: 1 });
    await prisma.order.update({ where: { id: order.id }, data: { wompiReference: order.number } });
    listTransactionsByReference.mockResolvedValue([
      tx(order.number, "PENDING", minutesAfterOrder(order, 5), order.total, "tx-pending"),
    ]);

    const result = await resolveWompiPaymentReference(order.id);

    expect(result).toEqual({ kind: "in_flight", txId: "tx-pending" });
  });

  it("una colección vacía que contradice el ledger local no permite rotar", async () => {
    const order = await makeOrder({ paymentAttempt: 1, wompiTransactionId: "tx-local" });
    await prisma.order.update({ where: { id: order.id }, data: { wompiReference: order.number } });

    const result = await resolveWompiPaymentReference(order.id);

    expect(result).toEqual({ kind: "lookup_failed" });
    expect(await prisma.wompiPaymentAttempt.count({ where: { orderId: order.id } })).toBe(1);
  });

  it("un cambio de total crea otro intento con el nuevo monto congelado", async () => {
    const order = await makeOrder({});
    const first = await resolveWompiPaymentReference(order.id);
    if (first.kind !== "ready") throw new Error("No se creó el primer intento");
    await prisma.order.update({ where: { id: order.id }, data: { total: 20_000 } });

    const second = await resolveWompiPaymentReference(order.id);

    expect(second.kind).toBe("ready");
    if (second.kind !== "ready") return;
    expect(second.reference).not.toBe(first.reference);
    expect(second.amountInCents).toBe(20_000);
  });

  it("dos aprobaciones se registran y marcan posible doble cobro sin ocultarlo", async () => {
    const order = await makeOrder({ paymentAttempt: 1 });
    await prisma.order.update({ where: { id: order.id }, data: { wompiReference: order.number } });
    listTransactionsByReference.mockResolvedValue([
      tx(order.number, "APPROVED", minutesAfterOrder(order, 5), order.total, "tx-a"),
      tx(order.number, "APPROVED", minutesAfterOrder(order, 6), order.total, "tx-b"),
    ]);

    const result = await resolveWompiPaymentReference(order.id);

    expect(result).toEqual({ kind: "approved", txId: "tx-a" });
    const persisted = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { needsReconciliation: true, wompiTransactionId: true },
    });
    expect(persisted.needsReconciliation).toBe(true);
    expect(persisted.wompiTransactionId).toBe("tx-a");
    expect(
      await prisma.wompiPaymentTransaction.count({ where: { attempt: { orderId: order.id } } }),
    ).toBe(2);
  });

  it("resuelve una orden por la referencia UUID exacta", async () => {
    const order = await makeOrder({});
    const result = await resolveWompiPaymentReference(order.id);
    if (result.kind !== "ready") throw new Error("No se creó el intento");

    await expect(findOrderIdByWompiReference(result.reference)).resolves.toBe(order.id);
  });
});
