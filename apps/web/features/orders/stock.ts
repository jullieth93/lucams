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
 *  5. Sin reservas de stock (StockReservation se retiró del schema en N-10a,
 *     2026-09-12 — nunca tuvo consumidores). La protección real contra oversold
 *     es el UPDATE atómico del punto 3: quien llega segundo NO confirma el pago
 *     y su orden queda PENDING_PAYMENT marcada needsReconciliation (visible en
 *     /admin/pedidos), con el stock JAMÁS en negativo. ADR-014 (reserva con TTL)
 *     quedó descartada para el volumen actual.
 */

import "server-only";
import { Prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { netAvailableStock } from "@/features/products/fulfillment";
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
 * Suma las cantidades por `variantId`. Dos OrderItems del MISMO variant (caso cotidiano: dos
 * diseños distintos del Estudio del mismo producto/tamaño → cada diseño es un CartItem propio con
 * el mismo variantId) deben tratarse como UN solo decremento/revert/validación. Sin esto:
 *  - el ledger tiene UNIQUE(orderId, reason, variantId) → el 2º InventoryLog.create de ese variant
 *    lanza P2002 → la saga lo trata como "ya aplicado" y la orden queda atascada en PENDING_PAYMENT
 *    con el dinero ya cobrado (blocker de auditoría v3 · B3);
 *  - assertStockAvailable validaría por-item (2×qty3 con stock 4 pasan ambos) en vez de por el
 *    total real (6 > 4).
 */
export function aggregateByVariant(items: ReadonlyArray<StockItem>): StockItem[] {
  const totals = new Map<string, number>();
  for (const it of items) {
    if (it.qty <= 0) continue;
    totals.set(it.variantId, (totals.get(it.variantId) ?? 0) + it.qty);
  }
  // Orden determinístico por variantId: evita bloqueos de fila en orden inverso (deadlock 40P01)
  // cuando dos transacciones multi-ítem concurrentes tocan el mismo par de variantes.
  return [...totals]
    .map(([variantId, qty]) => ({ variantId, qty }))
    .sort((a, b) => (a.variantId < b.variantId ? -1 : a.variantId > b.variantId ? 1 : 0));
}

async function physicalStockItems(
  tx: Prisma.TransactionClient,
  items: ReadonlyArray<StockItem>,
): Promise<StockItem[]> {
  const aggregated = aggregateByVariant(items);
  if (aggregated.length === 0) return [];
  const variants = await tx.productVariant.findMany({
    where: { id: { in: aggregated.map((item) => item.variantId) } },
    select: { id: true, product: { select: { fulfillmentMode: true } } },
  });
  const modes = new Map(
    variants.map((variant) => [variant.id, variant.product.fulfillmentMode] as const),
  );
  return aggregated.filter((item) => modes.get(item.variantId) !== "MADE_TO_ORDER");
}

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
  // Agregado por variant: valida contra el total pedido de cada variant, no item-a-item (dos
  // líneas del mismo variant deben sumar antes de comparar con el stock disponible).
  for (const it of aggregateByVariant(items)) {
    const v = await tx.productVariant.findUnique({
      where: { id: it.variantId },
      // name/sku + product.name: el error los propaga para que el checkout nombre el
      // producto agotado en el aviso al cliente (no solo el variantId interno).
      select: {
        id: true,
        stock: true,
        safetyStock: true,
        name: true,
        sku: true,
        product: { select: { name: true, fulfillmentMode: true } },
      },
    });
    if (!v) throw new InsufficientStockError(it.variantId, it.qty, 0);
    if (v.product.fulfillmentMode === "MADE_TO_ORDER") continue;
    const available = netAvailableStock(v.stock, v.safetyStock);
    if (available < it.qty) {
      throw new InsufficientStockError(it.variantId, it.qty, available, variantDisplayName(v));
    }
  }
}

/** Nombre de display de una variante: producto solo si es la variante default; si no, "Producto (Variante)". */
export function variantDisplayName(v: {
  name: string;
  sku: string;
  product: { name: string };
}): string {
  return v.sku.endsWith("-DEFAULT") ? v.product.name : `${v.product.name} (${v.name})`;
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
    channel?: "STOREFRONT" | "B2B";
    items: Array<{ variantId: string; qty: number }>;
  },
): Promise<{ decrementedVariants: string[]; alreadyApplied: boolean }> {
  const items = await physicalStockItems(tx, order.items);
  if (items.length === 0) return { decrementedVariants: [], alreadyApplied: false };

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
  // Agregado por variant: un solo UPDATE + un solo InventoryLog por variant, aunque la orden tenga
  // varias líneas del mismo variant (ver aggregateByVariant — evita el P2002 del índice único).
  for (const item of items) {
    // Optimistic atómico en Postgres: respeta safetyStock (stock - GREATEST(safetyStock, 0) >= qty)
    // con row-lock implícito y evita carreras de sobreventa sobre la reserva de seguridad.
    const updatedAt = new Date();
    const updatedCount = await tx.$executeRaw`
      UPDATE "ProductVariant"
      SET "stock" = "stock" - ${item.qty},
          "updatedAt" = ${updatedAt}
      WHERE "id" = ${item.variantId}
        AND ("stock" - GREATEST("safetyStock", 0)) >= ${item.qty}
    `;
    if (updatedCount !== 1) {
      // Carrera perdida: disponible neto (stock - safetyStock) insuficiente entre validación y este UPDATE.
      // Throw → tx caller rollback → Order NO transiciona a PAID.
      // Lookup del nombre para que el aviso al cliente nombre el producto
      // agotado (la saga lo re-lee vía err.productName); ruta rara, una
      // lectura extra es inocua.
      const v = await tx.productVariant.findUnique({
        where: { id: item.variantId },
        select: {
          stock: true,
          safetyStock: true,
          name: true,
          sku: true,
          product: { select: { name: true } },
        },
      });
      throw new InsufficientStockError(
        item.variantId,
        item.qty,
        v ? netAvailableStock(v.stock, v.safetyStock) : undefined,
        v ? variantDisplayName(v) : undefined,
      );
    }
    try {
      await tx.inventoryLog.create({
        data: {
          variantId: item.variantId,
          delta: -item.qty,
          reason: INVENTORY_REASON.ORDER_PAID,
          channel: order.channel ?? "STOREFRONT",
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
  const items = await physicalStockItems(tx, order.items);
  if (items.length === 0) return { revertedVariants: [], skipped: true };

  // 1. ¿Hubo decremento previo? Si no → no-op.
  const paidLog = await tx.inventoryLog.findFirst({
    where: { orderId: order.id, reason: INVENTORY_REASON.ORDER_PAID },
    select: { id: true, channel: true },
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

  // 3. Incrementar + log (agregado por variant, simétrico al decremento).
  const reverted: string[] = [];
  for (const item of items) {
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
          channel: paidLog.channel,
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
