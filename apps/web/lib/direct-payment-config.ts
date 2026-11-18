/*
 * Configuración privada server-only para el riel de Pago Directo B2B (`ADR-210`):
 * Bre-B (sistema de pagos inmediatos interoperables del Banco de la República) y
 * Transferencia Bancaria tradicional para montos corporativos mayores.
 *
 * Seguridad y cumplimiento (Ley 1480 + Ley 1581):
 *   - `import "server-only"`: jamás entra al bundle cliente general ni a `/api/cms/*`.
 *   - Solo se entrega en vistas autenticadas por token opaco (`/propuesta/[token]` o
 *     `/pedido/[token]`) cuando la propuesta habilitó `allowDirectTransfer = true`.
 *   - Fail-closed: si no hay llave Bre-B ni cuenta bancaria completa configurada,
 *     `enabled === false` y la tienda nunca ofrece un medio que no opera hoy.
 *   - Tope general de referencia Bre-B: 1.000 UVB = $12.110.000 COP (1_211_000_000 centavos;
 *     fuente: Banco de la República, banrep.gov.co, verificado 2026-11-18).
 */

import "server-only";

/** 1.000 UVB vigentes ($12.110.000 COP) expresados en centavos COP enteros. */
export const BREB_REGULATORY_MAX_CENTS = 1_211_000_000;

export interface DirectPaymentConfig {
  enabled: boolean;
  hasBreb: boolean;
  hasBankAccount: boolean;
  brebKey: string | null;
  brebHolder: string | null;
  bankName: string | null;
  accountType: string | null;
  accountNumber: string | null;
  holderDoc: string | null;
  instructions: string | null;
  maxBrebCopCents: number;
}

function cleanEnv(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getDirectPaymentConfig(env: NodeJS.ProcessEnv = process.env): DirectPaymentConfig {
  const brebKey = cleanEnv(env.DIRECT_PAYMENT_BREB_KEY);
  const brebHolder = cleanEnv(env.DIRECT_PAYMENT_BREB_HOLDER);
  const bankName = cleanEnv(env.DIRECT_PAYMENT_BANK_NAME);
  const accountType = cleanEnv(env.DIRECT_PAYMENT_ACCOUNT_TYPE);
  const accountNumber = cleanEnv(env.DIRECT_PAYMENT_ACCOUNT_NUMBER);
  const holderDoc = cleanEnv(env.DIRECT_PAYMENT_HOLDER_DOC);
  const instructions = cleanEnv(env.DIRECT_PAYMENT_INSTRUCTIONS);

  const hasBreb = brebKey !== null;
  const hasBankAccount = bankName !== null && accountNumber !== null;

  return {
    enabled: hasBreb || hasBankAccount,
    hasBreb,
    hasBankAccount,
    brebKey,
    brebHolder,
    bankName,
    accountType,
    accountNumber,
    holderDoc,
    instructions,
    maxBrebCopCents: BREB_REGULATORY_MAX_CENTS,
  };
}
