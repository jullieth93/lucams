/*
 * Normalización de fechas de vigencia de cupones a hora Colombia (auditoría flujo de cupones · #1).
 *
 * Los inputs `type="date"` mandan "YYYY-MM-DD" sin hora. `new Date("2026-07-18")` los interpreta
 * como MEDIANOCHE UTC = 7pm COT del día ANTERIOR → un cupón "válido hasta el 18" moría a las 7pm del
 * 17 y estaba muerto todo el 18 (~29 h antes), justo el día que debía funcionar. Anclamos la
 * vigencia al día COMPLETO en hora Colombia (COT es UTC-05:00 FIJO — Colombia no tiene horario de
 * verano): validFrom al inicio del día, validTo al final. Se construye el ISO con offset para que
 * `new Date()` / `z.coerce.date()` resuelvan el instante correcto (si dejáramos el string date-only,
 * volvería a caer en medianoche UTC). Si el valor ya trae hora/offset, se devuelve tal cual.
 */

const COT_OFFSET = "-05:00";
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-07-18" → "2026-07-18T00:00:00.000-05:00" (inicio del día en Colombia). */
export function cotStartOfDay(dateStr: string): string {
  return DATE_ONLY_RE.test(dateStr) ? `${dateStr}T00:00:00.000${COT_OFFSET}` : dateStr;
}

/** "2026-07-18" → "2026-07-18T23:59:59.999-05:00" (fin del día en Colombia). */
export function cotEndOfDay(dateStr: string): string {
  return DATE_ONLY_RE.test(dateStr) ? `${dateStr}T23:59:59.999${COT_OFFSET}` : dateStr;
}
