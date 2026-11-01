/*
 * Regla ÚNICA de la estimación de entrega "Envío Lucams" (mensajería interna):
 *
 *   deliveryDays = maxProductionDays + (bogotaHour(now) >= cutoffHour ? 1 : 0)
 *
 *   - maxProductionDays: días hábiles de fabricación a mano del carrito
 *     (máx. `Product.productionDays` de los items; si falta el dato,
 *     fallback LUCAMS_DEFAULT_PRODUCTION_DAYS).
 *   - La hora de corte decide DESDE QUÉ DÍA corre la producción: si el
 *     pedido entra a la hora de corte o después (hora Colombia), arranca
 *     el siguiente día hábil → suma 1.
 *   - La entrega es el MISMO DÍA del despacho (mensajero propio), así que
 *     no hay tránsito adicional que sumar.
 *
 * Ejemplos (cutoff 12): producto listo (0 días), pedido 10:00 → estimado para
 * hoy (0); el mismo producto a las 15:00 → alrededor de 1 día. Producto con
 * 2 días de producción, pedido 10:00 → alrededor de 2 días hábiles; a las
 * 15:00 → alrededor de 3.
 *
 * Client-safe a propósito (sin "server-only" ni DB): la usan por igual
 * buildLucamsOffer (checkout), el badge del admin, la guía imprimible y
 * cualquier UI que necesite la hora de Colombia — una sola fuente de verdad
 * para que las estimaciones no diverjan.
 */

/** Hora actual en Colombia (America/Bogota, 0-23) — rige el cutoff operativo. */
export function bogotaHour(now: Date = new Date()): number {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Bogota",
    hour: "numeric",
    hourCycle: "h23",
  }).format(now);
  const hour = Number.parseInt(formatted, 10);
  return Number.isFinite(hour) ? hour : 0;
}

/**
 * Fallback de días de producción cuando falta el dato (2 = máximo típico del
 * catálogo; el default histórico del schema Prisma es 3, pero la regla de
 * negocio aprobada fija 2 como piso defensivo). Fail-safe hacia estimar un
 * plazo mayor, nunca menor.
 */
export const LUCAMS_DEFAULT_PRODUCTION_DAYS = 2;

/**
 * Máximo de días de producción de una lista de items (null/undefined/NaN
 * cuentan como "dato faltante"). Sin ningún dato válido → default fail-safe.
 */
export function maxProductionDaysOf(
  productionDaysList: ReadonlyArray<number | null | undefined>,
): number {
  const valid = productionDaysList.filter(
    (d): d is number => typeof d === "number" && Number.isFinite(d) && d >= 0,
  );
  if (valid.length === 0) return LUCAMS_DEFAULT_PRODUCTION_DAYS;
  return Math.max(...valid);
}

/**
 * Días hábiles estimados para "Envío Lucams" (ver regla del docblock del
 * módulo). `maxProductionDays` inválido/ausente → default fail-safe. El
 * resultado 0 significa que operativamente se estima para hoy.
 */
export function lucamsDeliveryDays(input: {
  maxProductionDays: number;
  cutoffHour: number;
  now?: Date;
}): number {
  const production =
    Number.isFinite(input.maxProductionDays) && input.maxProductionDays >= 0
      ? Math.floor(input.maxProductionDays)
      : LUCAMS_DEFAULT_PRODUCTION_DAYS;
  const startsNextDay = bogotaHour(input.now ?? new Date()) >= input.cutoffHour;
  return production + (startsNextDay ? 1 : 0);
}

/** Copy no contractual para Admin y guía: el cálculo es una estimación operativa. */
export function formatLucamsDeliveryEstimate(deliveryDays: number): string {
  if (deliveryDays <= 0) return "Entrega estimada hoy · sujeta a disponibilidad de ruta";
  return `Entrega estimada en alrededor de ${deliveryDays} ${deliveryDays === 1 ? "día hábil" : "días hábiles"}`;
}
