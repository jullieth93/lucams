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
