/*
 * Utilidades de dinero. Todos los montos del sistema son ENTEROS en centavos COP (mandato del repo:
 * nunca floats). Las columnas de dinero en Postgres son INT4 (`Int` de Prisma), cuyo máximo es
 * 2_147_483_647 centavos (≈ $21.474.836,47 COP). Un total que lo supere hace que el INSERT reviente
 * con un error crudo de Postgres ("integer out of range") → hay que validarlo ANTES, con un mensaje
 * claro para el cliente.
 */

/** Máximo valor almacenable en una columna de dinero INT4 (centavos COP). */
export const MAX_MONEY_CENTS = 2_147_483_647;

/** true si `cents` cabe en una columna de dinero INT4 (0..MAX_MONEY_CENTS, entero finito). */
export function fitsMoneyInt4(cents: number): boolean {
  return (
    Number.isFinite(cents) && Number.isInteger(cents) && cents >= 0 && cents <= MAX_MONEY_CENTS
  );
}
