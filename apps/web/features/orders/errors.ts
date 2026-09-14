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
 * N-01 — Uno o más items del carrito dejaron de ser vendibles entre "ver el
 * carrito" y "confirmar el pago" (admin archivó/despublicó el producto o la
 * variante en esa ventana). El filtro de disponibilidad vivía solo en el DTO
 * del carrito (features/cart/service.ts) → createOrderFromCart cargaba los
 * items CRUDOS y podía cobrar un total que incluía un producto ya retirado.
 *
 * Decisión: RECHAZAR (no excluir-y-recalcular). Excluir en silencio cobraría un
 * total distinto al exhibido sin re-confirmación explícita del cliente — la
 * regla de oro del checkout es que eso jamás ocurre (mismo criterio que
 * CouponInvalidatedError, auditoría v3 · #8). El checkout lo traduce a un aviso
 * y manda al cliente a /carrito, donde el item retirado ya no aparece y
 * re-confirma con el contenido real.
 *
 * Lanzado por `createOrderFromCartTx` ANTES de calcular totales/cupón.
 */
export class OrderUnavailableItemsError extends Error {
  constructor(public items: Array<{ variantId: string; sku: string }>) {
    super(
      "Un producto de tu carrito ya no está disponible. Revisa tu carrito y confirma de nuevo.",
    );
    this.name = "OrderUnavailableItemsError";
  }
}

/**
 * N-17 — Intento de marcar una orden como REFUNDED sin la confirmación
 * explícita de que el dinero YA fue devuelto al cliente. El movimiento de
 * dinero en Wompi es manual; el sistema exige esa confirmación (checkbox
 * bloqueante en el form admin) ANTES de transicionar y de enviar el email
 * `refund-issued`, y persiste quién la hizo (refundMoneyConfirmedBy/At).
 *
 * La Server Action valida el checkbox primero; este throw es la defensa en
 * profundidad a nivel servicio (las actions son endpoints POST invocables
 * directo con cualquier payload).
 */
export class RefundMoneyNotConfirmedError extends Error {
  constructor() {
    super(
      "Confirma primero que el dinero ya fue devuelto al cliente (checkbox del formulario de reembolso).",
    );
    this.name = "RefundMoneyNotConfirmedError";
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
