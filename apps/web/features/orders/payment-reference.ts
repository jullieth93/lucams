import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@lucams/db";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { listTransactionsByReference, type WompiTransaction } from "@/lib/wompi";

export const WOMPI_REFERENCE_RETRY_WINDOW_MS = 3 * 60 * 1000;
const HISTORICAL_TX_TOLERANCE_MS = 60_000;

const TRANSACTION_SELECT = {
  id: true,
  externalId: true,
  status: true,
  amountInCents: true,
  currency: true,
  providerCreatedAt: true,
  providerFinalizedAt: true,
} as const;

const ATTEMPT_SELECT = {
  id: true,
  sequence: true,
  reference: true,
  amountInCents: true,
  currency: true,
  status: true,
  backfilled: true,
  presentedAt: true,
  transactions: { select: TRANSACTION_SELECT },
} as const;

const ORDER_SELECT = {
  id: true,
  number: true,
  status: true,
  total: true,
  currency: true,
  createdAt: true,
  paymentAttempt: true,
  wompiReference: true,
  wompiReferenceAt: true,
  wompiTransactionId: true,
  wompiAttempts: {
    orderBy: { sequence: "desc" as const },
    select: ATTEMPT_SELECT,
  },
} as const;

type LedgerOrder = Prisma.OrderGetPayload<{ select: typeof ORDER_SELECT }>;
type LedgerAttempt = LedgerOrder["wompiAttempts"][number];

export type WompiPaymentReferenceResolution =
  | { kind: "ready"; reference: string; attempt: number; amountInCents: number }
  | { kind: "approved"; txId: string }
  | { kind: "in_flight"; txId: string }
  | { kind: "lookup_failed" };

type SyncResolution =
  | { kind: "approved"; txId: string }
  | { kind: "in_flight"; txId: string }
  | { kind: "empty" }
  | { kind: "terminal" }
  | { kind: "lookup_failed" };

/** Formato legacy, conservado para lectores antiguos; los intentos nuevos usan UUID. */
export function buildWompiReference(orderNumber: string, attempt: number): string {
  return attempt <= 1 ? orderNumber : `${orderNumber}-${attempt}`;
}

export function buildUniqueWompiReference(orderNumber: string): string {
  return `${orderNumber}-${randomUUID()}`;
}

export function extractOrderNumberFromWompiReference(reference: string): string {
  return /^((?:LCM)-\d{4}-\d+?)(?:-|$)/.exec(reference)?.[1] ?? reference;
}

export function isWompiTransactionOlderThanOrder(
  order: { createdAt: Date },
  transaction: { created_at: string },
): boolean {
  const providerCreatedAt = Date.parse(transaction.created_at);
  return (
    Number.isFinite(providerCreatedAt) &&
    providerCreatedAt < order.createdAt.getTime() - HISTORICAL_TX_TOLERANCE_MS
  );
}

function providerDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error("Wompi devolvió una fecha inválida");
  return new Date(parsed);
}

async function loadOrder(orderId: string): Promise<LedgerOrder | null> {
  return prisma.order.findFirst({ where: { id: orderId, deletedAt: null }, select: ORDER_SELECT });
}

async function ensureLegacyAttempt(order: LedgerOrder): Promise<LedgerAttempt | null> {
  const current = order.wompiAttempts[0];
  if (current) {
    if (
      order.wompiTransactionId &&
      !current.transactions.some((tx) => tx.externalId === order.wompiTransactionId)
    ) {
      await prisma.wompiPaymentTransaction.create({
        data: {
          attemptId: current.id,
          externalId: order.wompiTransactionId,
          amountInCents: order.total,
          currency: order.currency,
          status: null,
        },
      });
      return prisma.wompiPaymentAttempt.findUniqueOrThrow({
        where: { id: current.id },
        select: ATTEMPT_SELECT,
      });
    }
    return current;
  }

  const reference =
    order.wompiReference ??
    (order.paymentAttempt > 0 || order.wompiTransactionId ? order.number : null);
  if (!reference) return null;

  return prisma.wompiPaymentAttempt.create({
    data: {
      orderId: order.id,
      sequence: Math.max(1, order.paymentAttempt),
      reference,
      amountInCents: order.total,
      currency: order.currency,
      backfilled: true,
      presentedAt: order.wompiReferenceAt,
      transactions: order.wompiTransactionId
        ? {
            create: {
              externalId: order.wompiTransactionId,
              amountInCents: order.total,
              currency: order.currency,
              status: null,
            },
          }
        : undefined,
    },
    select: ATTEMPT_SELECT,
  });
}

async function markReview(
  order: LedgerOrder,
  attempt: LedgerAttempt,
  reason: string,
  now: Date,
): Promise<void> {
  await prisma.$transaction([
    prisma.wompiPaymentAttempt.update({
      where: { id: attempt.id },
      data: { status: "REVIEW", lastSyncedAt: now },
    }),
    prisma.order.update({
      where: { id: order.id },
      data: { needsReconciliation: true, reconciliationReason: reason },
    }),
  ]);
}

async function syncAttempt(
  order: LedgerOrder,
  attempt: LedgerAttempt,
  now: Date,
): Promise<SyncResolution> {
  let transactions: WompiTransaction[];
  try {
    transactions = await listTransactionsByReference(attempt.reference);
    if (transactions.length === 0 && attempt.transactions.length > 0) {
      logger.warn({
        event: "order.payment_reference.provider_empty_contradiction",
        orderId: order.id,
        attemptId: attempt.id,
      });
      return { kind: "lookup_failed" };
    }

    for (const tx of transactions) {
      const existing = await prisma.wompiPaymentTransaction.findUnique({
        where: { externalId: tx.id },
        select: { attemptId: true },
      });
      if (existing && existing.attemptId !== attempt.id) {
        await markReview(
          order,
          attempt,
          `La transacción ${tx.id} ya estaba asociada a otro intento de pago. Revisar referencia ${attempt.reference}.`,
          now,
        );
        return { kind: "lookup_failed" };
      }
      const approvedAt =
        tx.status === "APPROVED" ? providerDate(tx.finalized_at ?? tx.created_at) : null;
      await prisma.wompiPaymentTransaction.upsert({
        where: { externalId: tx.id },
        update: {
          status: tx.status,
          amountInCents: tx.amount_in_cents,
          currency: tx.currency,
          paymentMethodType: tx.payment_method_type,
          statusMessage: tx.status_message,
          providerCreatedAt: providerDate(tx.created_at),
          providerFinalizedAt: providerDate(tx.finalized_at),
          firstApprovedAt: approvedAt ?? undefined,
          lastSeenAt: now,
        },
        create: {
          attemptId: attempt.id,
          externalId: tx.id,
          status: tx.status,
          amountInCents: tx.amount_in_cents,
          currency: tx.currency,
          paymentMethodType: tx.payment_method_type,
          statusMessage: tx.status_message,
          providerCreatedAt: providerDate(tx.created_at),
          providerFinalizedAt: providerDate(tx.finalized_at),
          firstApprovedAt: approvedAt,
          lastSeenAt: now,
        },
      });
    }
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      await markReview(
        order,
        attempt,
        `Conflicto de unicidad al sincronizar la referencia ${attempt.reference}. Revisar antes de reintentar el cobro.`,
        now,
      );
    } else {
      logger.warn({
        event: "order.payment_reference.lookup_failed",
        orderId: order.id,
        attemptId: attempt.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
    return { kind: "lookup_failed" };
  }

  const relevant = transactions.filter((tx) => !isWompiTransactionOlderThanOrder(order, tx));
  const approved = relevant
    .filter((tx) => tx.status === "APPROVED")
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const pending = relevant.filter((tx) => tx.status === "PENDING");
  const voided = relevant.filter((tx) => tx.status === "VOIDED");
  const moneyInFlight = [...approved, ...pending];

  if (
    moneyInFlight.some(
      (tx) => tx.amount_in_cents !== attempt.amountInCents || tx.currency !== attempt.currency,
    )
  ) {
    await markReview(
      order,
      attempt,
      `El monto o la moneda de Wompi no coincide con el intento ${attempt.reference}. Revisar antes de cobrar o despachar.`,
      now,
    );
    return { kind: "lookup_failed" };
  }
  if (voided.length > 0) {
    await markReview(
      order,
      attempt,
      `Wompi reportó una transacción VOIDED para ${attempt.reference}. Revisar el estado del dinero antes de otro intento.`,
      now,
    );
    return { kind: "lookup_failed" };
  }

  if (approved.length > 0) {
    const paid = approved[0]!;
    const hasDuplicateCapture =
      approved.length > 1 ||
      (order.wompiTransactionId !== null && order.wompiTransactionId !== paid.id);
    await prisma.$transaction([
      prisma.wompiPaymentAttempt.update({
        where: { id: attempt.id },
        data: { status: "APPROVED", lastSyncedAt: now },
      }),
      prisma.order.update({
        where: { id: order.id },
        data: {
          wompiTransactionId: paid.id,
          ...(hasDuplicateCapture
            ? {
                needsReconciliation: true,
                reconciliationReason: `Wompi reportó más de una captura para ${attempt.reference}. Revisar posible doble cobro.`,
              }
            : {}),
        },
      }),
    ]);
    return { kind: "approved", txId: paid.id };
  }

  if (pending.length > 0) {
    const current = pending.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0]!;
    await prisma.$transaction([
      prisma.wompiPaymentAttempt.update({
        where: { id: attempt.id },
        data: { status: "IN_FLIGHT", lastSyncedAt: now },
      }),
      prisma.order.update({
        where: { id: order.id },
        data: { wompiTransactionId: current.id },
      }),
    ]);
    return { kind: "in_flight", txId: current.id };
  }

  if (relevant.length === 0) {
    await prisma.wompiPaymentAttempt.update({
      where: { id: attempt.id },
      data: { status: "OPEN", lastSyncedAt: now },
    });
    return { kind: "empty" };
  }

  await prisma.wompiPaymentAttempt.update({
    where: { id: attempt.id },
    data: { status: "FAILED", lastSyncedAt: now },
  });
  return { kind: "terminal" };
}

async function createAttempt(
  order: LedgerOrder,
  previous: LedgerAttempt | null,
  now: Date,
): Promise<WompiPaymentReferenceResolution> {
  const sequence =
    Math.max(
      order.paymentAttempt,
      previous?.sequence ?? 0,
      ...order.wompiAttempts.map((attempt) => attempt.sequence),
    ) + 1;
  const reference = buildUniqueWompiReference(order.number);

  const created = await prisma.$transaction(async (tx) => {
    const attempt = await tx.wompiPaymentAttempt.create({
      data: {
        orderId: order.id,
        sequence,
        reference,
        amountInCents: order.total,
        currency: order.currency,
        presentedAt: now,
      },
      select: ATTEMPT_SELECT,
    });
    if (previous) {
      await tx.wompiPaymentAttempt.updateMany({
        where: {
          id: previous.id,
          status: { notIn: ["APPROVED", "IN_FLIGHT", "REVIEW"] },
        },
        data: { status: "SUPERSEDED", supersededAt: now },
      });
    }
    await tx.order.updateMany({
      where: { id: order.id, status: "PENDING_PAYMENT" },
      data: {
        paymentAttempt: sequence,
        wompiReference: reference,
        wompiReferenceAt: now,
        wompiTransactionId: null,
      },
    });
    return attempt;
  });

  logger.info({
    event: "order.payment_reference.claimed",
    orderId: order.id,
    orderNumber: order.number,
    attempt: sequence,
    rotated: previous !== null,
  });
  return {
    kind: "ready",
    reference: created.reference,
    attempt: created.sequence,
    amountInCents: created.amountInCents,
  };
}

export async function resolveWompiPaymentReference(
  orderId: string,
  now: Date = new Date(),
): Promise<WompiPaymentReferenceResolution> {
  for (let round = 0; round < 3; round += 1) {
    const order = await loadOrder(orderId);
    if (!order) return { kind: "lookup_failed" };
    if (order.status !== "PENDING_PAYMENT") {
      return order.wompiTransactionId
        ? { kind: "approved", txId: order.wompiTransactionId }
        : { kind: "lookup_failed" };
    }

    try {
      const current = (await ensureLegacyAttempt(order)) ?? null;
      if (!current) return await createAttempt(order, null, now);

      const synced = await syncAttempt(order, current, now);
      if (synced.kind !== "empty" && synced.kind !== "terminal") return synced;

      const sameAmount =
        current.amountInCents === order.total && current.currency === order.currency;
      if (synced.kind === "empty" && !current.backfilled && sameAmount) {
        return {
          kind: "ready",
          reference: current.reference,
          attempt: current.sequence,
          amountInCents: current.amountInCents,
        };
      }
      return await createAttempt(order, current, now);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        continue;
      }
      logger.warn({
        event: "order.payment_reference.resolution_failed",
        orderId,
        err: err instanceof Error ? err.message : String(err),
      });
      return { kind: "lookup_failed" };
    }
  }
  return { kind: "lookup_failed" };
}

export async function findOrderIdByWompiReference(reference: string): Promise<string | null> {
  const attempt = await prisma.wompiPaymentAttempt.findUnique({
    where: { reference },
    select: { orderId: true },
  });
  if (attempt) return attempt.orderId;

  const base = extractOrderNumberFromWompiReference(reference);
  const order = await prisma.order.findFirst({
    where: {
      deletedAt: null,
      OR: [{ wompiReference: reference }, { number: reference }, { number: base }],
    },
    select: { id: true },
  });
  return order?.id ?? null;
}
