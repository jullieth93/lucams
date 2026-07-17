/*
 * Stock manual admin — operaciones del admin sobre ProductVariant.stock
 * con audit completo en InventoryLog.
 *
 * Separado de features/orders/stock.ts (que maneja decremento/revert
 * automático en saga POST-PAID) porque tienen razones distintas:
 *  - features/orders/stock.ts → reason: ORDER_PAID / ORDER_CANCELLED / ORDER_REFUNDED
 *  - features/products/stock-admin.ts → reason: ADMIN_ADJUSTMENT
 *
 * Decisión Lucy 2026-06-26: TODO ajuste admin de stock queda en InventoryLog
 * (cumple deuda histórica donde admin set absoluto no se loggeaba).
 *
 * Idempotencia: si newStock === currentStock, no-op silencioso (no crea
 * InventoryLog vacío, no spam de logs). El caller distingue por el flag
 * `logged` del resultado.
 */

import "server-only";
import { Prisma, prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { INVENTORY_REASON } from "@/features/orders/stock";
import { MAX_STOCK_VALUE } from "./stock-constants";

export class VariantStockError extends Error {
  constructor(
    public code: "not_found" | "out_of_range" | "deleted",
    message: string,
  ) {
    super(message);
    this.name = "VariantStockError";
  }
}

export type SetVariantStockResult = {
  variantId: string;
  productId: string;
  previousStock: number;
  newStock: number;
  delta: number;
  /** false si fue no-op (newStock === currentStock). */
  logged: boolean;
};

/**
 * Establece el stock de una variant a un valor absoluto, con audit completo.
 *
 * Flujo (todo en una $transaction):
 *  1. Lookup variant (verifica que existe y no está soft-deleted).
 *  2. Validar newStock ∈ [0, MAX_STOCK_VALUE].
 *  3. Si delta === 0 → no-op (return logged=false).
 *  4. UPDATE variant.stock + InventoryLog.create (delta, reason, createdBy).
 *
 * Atomic: si InventoryLog falla, rollback del update — la verdad del ledger
 * SIEMPRE coincide con stock actual.
 *
 * NO valida que el producto esté activo ni que la variant tenga isActive —
 * admin debe poder ajustar stock de productos archivados/inactivos también
 * (caso "recibí lote para producto que dejé de vender — descontar de stock").
 *
 * @param adminId — `null` solo en seeds/migrations. Producción siempre tiene admin autenticado.
 */
export async function setVariantStockAdmin(input: {
  variantId: string;
  newStock: number;
  adminId: string | null;
}): Promise<SetVariantStockResult> {
  // Validación de rango ANTES de tx (evita pegar a DB con valores inválidos).
  if (!Number.isInteger(input.newStock)) {
    throw new VariantStockError("out_of_range", "Stock debe ser un número entero (sin decimales)");
  }
  if (input.newStock < 0) {
    throw new VariantStockError("out_of_range", "Stock no puede ser negativo");
  }
  if (input.newStock > MAX_STOCK_VALUE) {
    throw new VariantStockError(
      "out_of_range",
      `Stock no puede ser mayor a ${MAX_STOCK_VALUE.toLocaleString("es-CO")}`,
    );
  }

  return prisma.$transaction(async (tx) => {
    const current = await tx.productVariant.findUnique({
      where: { id: input.variantId },
      select: { id: true, productId: true, stock: true, deletedAt: true },
    });
    if (!current) {
      throw new VariantStockError("not_found", "Variante no encontrada");
    }
    if (current.deletedAt) {
      throw new VariantStockError(
        "deleted",
        "Esta variante está archivada — restaurala antes de ajustar el stock",
      );
    }

    const previousStock = current.stock;
    const delta = input.newStock - previousStock;

    // No-op: misma cantidad, no creamos log fantasma.
    if (delta === 0) {
      logger.info({
        event: "stock.admin.noop",
        variantId: current.id,
        productId: current.productId,
        stock: previousStock,
      });
      return {
        variantId: current.id,
        productId: current.productId,
        previousStock,
        newStock: input.newStock,
        delta: 0,
        logged: false,
      };
    }

    await tx.productVariant.update({
      where: { id: current.id },
      data: { stock: input.newStock },
    });

    await tx.inventoryLog.create({
      data: {
        variantId: current.id,
        delta,
        reason: INVENTORY_REASON.ADMIN_ADJUSTMENT,
        // NO orderId — este es ajuste manual, no atado a Order.
        createdBy: input.adminId ?? "system:seed",
      },
    });

    logger.info({
      event: "stock.admin.adjusted",
      variantId: current.id,
      productId: current.productId,
      previousStock,
      newStock: input.newStock,
      delta,
      adminId: input.adminId,
    });

    return {
      variantId: current.id,
      productId: current.productId,
      previousStock,
      newStock: input.newStock,
      delta,
      logged: true,
    };
  });
}

/**
 * Helper para listar el historial de cambios de stock de una variant.
 * Usado en la UI admin "Ver historial" (futuro — no en P0-004).
 *
 * Mantenemos la firma exportada para que cuando se implemente el panel
 * de historial no haga falta cambiar callers.
 */
export async function listVariantStockHistory(
  variantId: string,
  opts: { take?: number } = {},
): Promise<
  Array<{
    id: string;
    delta: number;
    reason: string;
    orderId: string | null;
    createdBy: string | null;
    createdAt: Date;
  }>
> {
  return prisma.inventoryLog.findMany({
    where: { variantId },
    orderBy: { createdAt: "desc" },
    take: opts.take ?? 50,
    select: {
      id: true,
      delta: true,
      reason: true,
      orderId: true,
      createdBy: true,
      createdAt: true,
    },
  });
}

// Re-export para que callers solo importen de este file.
export { Prisma };
