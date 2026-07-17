/*
 * Errores tipados del dominio Orders.
 *
 * Distintos de los genéricos de Prisma para que los callers (server actions
 * de /checkout/pago, webhook Wompi, /carrito) puedan mapearlos a UX clara
 * sin acoplarse al SDK de Prisma.
 */

/**
 * Stock insuficiente al intentar reservar/decrementar inventario.
 *
 * Lanzado por:
 *  - `assertStockAvailable` durante `createOrderFromCart` o `loadCheckoutContext`
 *  - `decrementStockForOrder` en la saga POST-PAID si el stock se agotó entre
 *    PENDING_PAYMENT y PAID (caso patológico — implica condición de carrera
 *    ganada por otro comprador).
 */
export class InsufficientStockError extends Error {
  constructor(
    public variantId: string,
    public requested: number,
    public available?: number,
  ) {
    super(
      `Stock insuficiente para variant ${variantId}: solicitado ${requested}` +
        (available !== undefined ? `, disponible ${available}` : ""),
    );
    this.name = "InsufficientStockError";
  }
}

/**
 * El ledger de stock ya fue aplicado para este (orderId, reason, variantId).
 *
 * Lanzado por `decrementStockForOrder` / `revertStockForOrder` cuando el
 * UNIQUE INDEX parcial de InventoryLog dispara P2002 — significa que otra
 * transacción concurrente (típico: webhook Wompi + fallback /checkout/gracias
 * corriendo a la vez) ya hizo el trabajo y commiteó primero.
 *
 * El caller (processPaidOrder) lo trata como idempotente: la orden ya fue
 * procesada por el ganador de la carrera, NO se re-procesa ni se duplica guía.
 */
export class StockAlreadyAppliedError extends Error {
  constructor(
    public orderId: string,
    public reason: string,
  ) {
    super(`Stock ya aplicado para order ${orderId} (${reason}) — carrera concurrente`);
    this.name = "StockAlreadyAppliedError";
  }
}

/**
 * El total (o subtotal) del pedido supera el máximo almacenable en una columna de dinero INT4
 * (`MAX_MONEY_CENTS`). Sin este guard, `order.create` reventaría con un "integer out of range"
 * crudo de Postgres. Se lanza ANTES del INSERT en `createOrderFromCart` para dar un mensaje claro
 * (el checkout lo mapea a UX). Caso realista: producto premium caro × cantidad alta.
 */
export class OrderAmountTooLargeError extends Error {
  constructor(public amountCents: number) {
    super(
      "El pedido es demasiado grande para procesarlo en línea. Escríbenos por WhatsApp y te lo cotizamos.",
    );
    this.name = "OrderAmountTooLargeError";
  }
}
