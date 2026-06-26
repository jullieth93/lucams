/*
 * Stock ledger — decremento/revert atómico con InventoryLog como audit trail.
 *
 * Decisiones arquitectónicas (P0-002, Lucy 2026-06-26 + design adversarial):
 *
 *  1. Decremento ocurre al transicionar Order → PAID (NO en PENDING_PAYMENT).
 *     Evita "secuestrar" stock por carritos abandonados (~30-40% en Wompi).
 *     El gap PENDING_PAYMENT → PAID es ≤ 15 min y lo absorbe el UPDATE atómico.
 *
 *  2. Revert ocurre al transicionar a CANCELLED / REFUNDED, SOLO si hubo
 *     decremento previo (existe InventoryLog reason=ORDER_PAID para la Order).
 *     Regla de oro: la verdad la marca el ledger, no el estado origen.
 *
 *  3. Concurrencia: optimistic atómico via Prisma updateMany con WHERE stock>=qty.
 *     Compila a UPDATE … WHERE id=$1 AND stock>=$2 — Postgres ejecuta con
 *     row-lock implícito. Funciona en pgBouncer transaction-mode sin SELECT
 *     FOR UPDATE ni isolation Serializable.
 *
 *  4. Idempotency: 3 capas. (a) WebhookEvent unique filtra retries Wompi.
 *     (b) processPaidOrder aborta si Order ya no es PENDING_PAYMENT. (c) acá:
 *     antes de cada operación, lookup InventoryLog por (orderId, reason) —
 *     si existe, no-op silencioso. Index parcial unique en DB garantiza
 *     consistencia incluso bajo race condition extrema.
 *
 *  5. StockReservation queda en schema sin consumidores (decisión diferida).
 *     ADR-014 anotada como pendiente. Si el volumen lo justifica, migrar
 *     a reserva con TTL + pg_cron cleanup en bloque futuro.
 */

import "server-only";
import { Prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { InsufficientStockError, StockAlreadyAppliedError } from "./errors";

/**
 * ¿Es un P2002 (unique violation) del índice parcial de InventoryLog?
 * Lo usamos para distinguir la carrera concurrente benigna (otro tx ya aplicó
 * el ledger) de un error técnico real.
 */
function isInventoryLogUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002" &&
    // target puede ser el nombre del índice o el array de columnas según el driver.
    JSON.stringify(err.meta ?? {}).includes("InventoryLog")
  );
}

/**
 * Razones canónicas para InventoryLog.
 * Usadas como discriminator en idempotency lookups + audit queries.
 */
export const INVENTORY_REASON = {
  ORDER_PAID: "ORDER_PAID",
  ORDER_CANCELLED: "ORDER_CANCELLED",
  ORDER_REFUNDED: "ORDER_REFUNDED",
  ADMIN_ADJUSTMENT: "ADMIN_ADJUSTMENT",
} as const;

export type InventoryReason = (typeof INVENTORY_REASON)[keyof typeof INVENTORY_REASON];

type StockItem = {
  variantId: string;
  qty: number;
};

/**
 * Verifica que cada item tiene stock suficiente — lectura, NO escritura.
 *
 * Llamado por:
 *  - createOrderFromCart antes de crear la Order (evita Order huérfana).
 *  - loadCheckoutContext / server action /checkout/datos para validar
 *    disponibilidad antes de avanzar al pago.
 *
 * Lanza InsufficientStockError en el primer item que no alcance — el caller
 * decide si redirigir a /carrito con mensaje claro.
 *
 * NOTA: esta validación NO previene la carrera entre dos clientes — solo
 * filtra el caso obvio. El UPDATE atómico en decrementStockForOrder es la
 * defensa real contra concurrencia.
 */
export async function assertStockAvailable(
  tx: Prisma.TransactionClient,
  items: StockItem[],
): Promise<void> {
  for (const it of items) {
    if (it.qty <= 0) continue;
    const v = await tx.productVariant.findUnique({
      where: { id: it.variantId },
      select: { id: true, stock: true },
    });
    if (!v) throw new InsufficientStockError(it.variantId, it.qty, 0);
    if (v.stock < it.qty) {
      throw new InsufficientStockError(it.variantId, it.qty, v.stock);
    }
  }
}

/**
 * Decrementa stock atómicamente para todos los OrderItems + crea InventoryLog.
 *
 * Idempotente: si ya existe un InventoryLog con (orderId, reason=ORDER_PAID),
 * no-op silencioso. Esto cubre el caso de webhook Wompi duplicado.
 *
 * Atomicidad por item: UPDATE … WHERE stock >= qty solo cambia la fila si
 * Postgres garantiza la precondición. Si el count !== 1, otro comprador
 * ganó la carrera entre la validación previa y el UPDATE → throw.
 *
 * Todo dentro del mismo `tx` que el caller (la transición a PAID).
 * Si algo falla, la transición se rollback y la Order queda en PENDING_PAYMENT.
 */
export async function decrementStockForOrder(
  tx: Prisma.TransactionClient,
  order: {
    id: string;
    number: string;
    items: Array<{ variantId: string; qty: number }>;
  },
): Promise<{ decrementedVariants: string[]; alreadyApplied: boolean }> {
  // Idempotency capa 3: ¿ya se decrementó para esta Order?
  const existingLog = await tx.inventoryLog.findFirst({
    where: { orderId: order.id, reason: INVENTORY_REASON.ORDER_PAID },
    select: { id: true },
  });
  if (existingLog) {
    logger.info({
      event: "stock.decrement.idempotent_skip",
      orderId: order.id,
      orderNumber: order.number,
    });
    return { decrementedVariants: [], alreadyApplied: true };
  }

  const decremented: string[] = [];
  for (const item of order.items) {
    if (item.qty <= 0) {
      logger.warn({
        event: "stock.decrement.invalid_qty",
        orderId: order.id,
        variantId: item.variantId,
        qty: item.qty,
      });
      continue;
    }
    // Optimistic atómico: UPDATE … WHERE id=$1 AND stock>=$2
    const res = await tx.productVariant.updateMany({
      where: { id: item.variantId, stock: { gte: item.qty } },
      data: { stock: { decrement: item.qty } },
    });
    if (res.count !== 1) {
      // Carrera perdida: stock se agotó entre validación y este UPDATE.
      // Throw → tx caller rollback → Order NO transiciona a PAID.
      throw new InsufficientStockError(item.variantId, item.qty);
    }
    try {
      await tx.inventoryLog.create({
        data: {
          variantId: item.variantId,
          delta: -item.qty,
          reason: INVENTORY_REASON.ORDER_PAID,
          orderId: order.id,
          createdBy: "system:order-saga",
        },
      });
    } catch (err) {
      // P2002 del índice parcial unique (orderId, reason, variantId): otra tx
      // concurrente (webhook + fallback /gracias) ya decrementó este variant
      // para esta orden. La precondición findFirst no lo vio porque el ganador
      // aún no había commiteado. Re-lanzamos como StockAlreadyAppliedError →
      // el caller hace rollback de ESTA tx (sin doble-decremento) y trata la
      // orden como ya procesada por el ganador. Backstop físico del ledger.
      if (isInventoryLogUniqueViolation(err)) {
        logger.info({
          event: "stock.decrement.concurrent_already_applied",
          orderId: order.id,
          orderNumber: order.number,
          variantId: item.variantId,
        });
        throw new StockAlreadyAppliedError(order.id, INVENTORY_REASON.ORDER_PAID);
      }
      throw err;
    }
    decremented.push(item.variantId);
  }

  logger.info({
    event: "stock.decrement.applied",
    orderId: order.id,
    orderNumber: order.number,
    variantsAffected: decremented.length,
  });
  return { decrementedVariants: decremented, alreadyApplied: false };
}

/**
 * Revierte stock de una Order que fue cancelada/reembolsada después de PAID.
 *
 * Regla de oro: SOLO opera si existe un InventoryLog previo con
 * reason=ORDER_PAID para esta Order. Si no hay (caso PENDING_PAYMENT →
 * CANCELLED por DECLINED), no-op silencioso correcto.
 *
 * Idempotente: si ya existe un log con la razón target (CANCELLED/REFUNDED),
 * no-op.
 *
 * NO valida que el stock no se desborde — el incremento siempre es válido.
 */
export async function revertStockForOrder(
  tx: Prisma.TransactionClient,
  order: {
    id: string;
    number: string;
    items: Array<{ variantId: string; qty: number }>;
  },
  reason: "ORDER_CANCELLED" | "ORDER_REFUNDED",
): Promise<{ revertedVariants: string[]; skipped: boolean }> {
  // 1. ¿Hubo decremento previo? Si no → no-op.
  const paidLog = await tx.inventoryLog.findFirst({
    where: { orderId: order.id, reason: INVENTORY_REASON.ORDER_PAID },
    select: { id: true },
  });
  if (!paidLog) {
    logger.info({
      event: "stock.revert.no_prior_decrement",
      orderId: order.id,
      orderNumber: order.number,
      reason,
    });
    return { revertedVariants: [], skipped: true };
  }

  // 2. ¿Ya se revirtió? — idempotency.
  const existingRevert = await tx.inventoryLog.findFirst({
    where: { orderId: order.id, reason },
    select: { id: true },
  });
  if (existingRevert) {
    logger.info({
      event: "stock.revert.idempotent_skip",
      orderId: order.id,
      orderNumber: order.number,
      reason,
    });
    return { revertedVariants: [], skipped: true };
  }

  // 3. Incrementar + log.
  const reverted: string[] = [];
  for (const item of order.items) {
    if (item.qty <= 0) continue;
    await tx.productVariant.update({
      where: { id: item.variantId },
      data: { stock: { increment: item.qty } },
    });
    try {
      await tx.inventoryLog.create({
        data: {
          variantId: item.variantId,
          delta: item.qty,
          reason,
          orderId: order.id,
          createdBy: "system:order-saga",
        },
      });
    } catch (err) {
      // Carrera concurrente de revert (ej. dos cancelaciones a la vez): el
      // índice parcial unique impide el doble-revert físicamente. Re-lanzamos
      // para rollback de esta tx — el ganador ya revirtió el stock correcto.
      if (isInventoryLogUniqueViolation(err)) {
        logger.info({
          event: "stock.revert.concurrent_already_applied",
          orderId: order.id,
          orderNumber: order.number,
          variantId: item.variantId,
          reason,
        });
        throw new StockAlreadyAppliedError(order.id, reason);
      }
      throw err;
    }
    reverted.push(item.variantId);
  }

  logger.info({
    event: "stock.revert.applied",
    orderId: order.id,
    orderNumber: order.number,
    reason,
    variantsAffected: reverted.length,
  });
  return { revertedVariants: reverted, skipped: false };
}
