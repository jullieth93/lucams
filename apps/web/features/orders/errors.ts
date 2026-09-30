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
    /** Nombre de display del producto/variante, para el copy customer-safe. */
    public productName?: string,
  ) {
    super(
      `Stock insuficiente para variant ${variantId}: solicitado ${requested}` +
        (available !== undefined ? `, disponible ${available}` : ""),
    );
    this.name = "InsufficientStockError";
  }

  /**
   * Copy customer-safe (es-CO, tuteo) que nombra el producto agotado, para los
   * redirects a /carrito?error=... del checkout. `null` si no conocemos el
   * nombre — el caller usa su mensaje genérico de fallback. El `message`
   * técnico (variantId, cantidades) queda solo para logs.
   */
  customerMessage(): string | null {
    if (!this.productName) return null;
    return this.available !== undefined && this.available > 0
      ? `Solo quedan ${this.available} ${this.available === 1 ? "unidad" : "unidades"} de «${this.productName}». Ajusta la cantidad en tu carrito.`
      : `«${this.productName}» se agotó. Revisa tu carrito y confirma de nuevo.`;
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
  constructor(public items: Array<{ variantId: string; sku: string; name?: string }>) {
    // Copy customer-safe que NOMBRA el producto retirado (2026-09-29): "ya no está
    // disponible" sin nombre obligaba al cliente a adivinar qué item desapareció
    // del carrito. Si no hay nombres (caller legacy), fallback al genérico.
    const names = [...new Set(items.map((it) => it.name).filter((n): n is string => !!n))];
    super(
      names.length === 1
        ? `«${names[0]}» ya no está disponible. Revisa tu carrito y confirma de nuevo.`
        : names.length > 1
          ? `Estos productos ya no están disponibles: ${names.join(", ")}. Revisa tu carrito y confirma de nuevo.`
          : "Un producto de tu carrito ya no está disponible. Revisa tu carrito y confirma de nuevo.",
    );
    this.name = "OrderUnavailableItemsError";
  }
}

/**
 * Carrera TOCTOU de reconciliación (2026-09-29): entre la lectura de la Order
 * PENDING_PAYMENT existente (idempotencia por cartId) y la escritura de la
 * reconciliación/refresh, el webhook de Wompi commiteó PAID. El UPDATE gateado
 * por `status: "PENDING_PAYMENT"` devolvió count=0 → NO se pisa nada y NO se
 * reintenta: la orden ya fue cobrada/confirmada por el ganador de la carrera.
 *
 * `finalizeCheckout` lo traduce a CheckoutError ORDER_ALREADY_PAID y la action
 * redirige a la vista de confirmación (/checkout/gracias?id=<txId> verifica la
 * transacción contra Wompi y sana la orden) — nunca se crea otra orden ni se
 * cobra dos veces.
 */
export class OrderAlreadyPaidError extends Error {
  constructor(
    public orderId: string,
    public orderNumber: string,
  ) {
    // Mensaje técnico (va a logs); el cliente nunca lo ve — la action redirige.
    super(
      `Order ${orderNumber} (${orderId}) ya no está PENDING_PAYMENT — la confirmó otro proceso`,
    );
    this.name = "OrderAlreadyPaidError";
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
