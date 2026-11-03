/*
 * Fuente única de plazos legales y reglas base al consumidor en Colombia.
 *
 * Módulo puro (sin `server-only` ni acceso a BD) para que la lógica de negocio
 * (`features/retract`, `features/warranty`), el motor de interpolación CMS
 * (`lib/cms-tokens.ts`), los diccionarios tipados de interfaz (`checkout-texts`,
 * `account-texts`), la ficha de producto y las plantillas de correo lean SIEMPRE
 * el mismo número legal y nunca diverjan entre capas.
 *
 * Referencias normativas:
 * - Ley 1480 de 2011 (Estatuto del Consumidor), arts. 7–11, 16, 47, 50 y 58.
 * - Ley 2439 de 2024 (modifica arts. 47 y 50 de la Ley 1480: reembolso en máx. 15 días calendario).
 * - Ley 1581 de 2012 (Protección de Datos Personales), arts. 14 y 15.
 */

/** Ventana legal para ejercer el derecho de retracto desde la entrega (Ley 1480, art. 47). */
export const RETRACT_WINDOW_BUSINESS_DAYS = 5;

/** Plazo máximo calendario para reembolsar el dinero tras ejercer el retracto (Ley 2439 de 2024). */
export const RETRACT_REFUND_MAX_CALENDAR_DAYS = 15;

/** Plazo máximo legal de entrega cuando no se pacta otro menor (Ley 1480, art. 50). */
export const MAX_LEGAL_DELIVERY_CALENDAR_DAYS = 30;

/** Plazo máximo en días hábiles para responder reclamaciones directas / garantía (Ley 1480, art. 58). */
export const WARRANTY_CLAIM_RESPONSE_BUSINESS_DAYS = 15;

/**
 * Plazo base predeterminado de garantía anunciada en catálogo (ADR-106 / Ley 1480, art. 8).
 * Cada producto gobierna su término real en `Product.warrantyMonths` (sellado en `OrderItem.warrantyMonths`).
 */
export const DEFAULT_CATALOG_WARRANTY_MONTHS = 1;

/** Plazo máximo en días hábiles para atender consultas de Hábeas Data / PQR (Ley 1581, art. 14). */
export const HABEAS_DATA_CONSULTATION_BUSINESS_DAYS = 10;

/** Plazo máximo en días hábiles para resolver reclamos de Hábeas Data / PQR (Ley 1581, art. 15). */
export const HABEAS_DATA_CLAIM_BUSINESS_DAYS = 15;

/** Formatea un plazo de garantía en meses al español (`1` → `"1 mes"`, `n` → `"n meses"`). */
export function formatWarrantyTerm(months: number): string {
  return `${months} ${months === 1 ? "mes" : "meses"}`;
}
