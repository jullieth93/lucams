/*
 * Constantes de dominio de Orders compartidas entre capas (service, crons,
 * emails, alertas de observabilidad). Mismo patrón que
 * features/reviews/constants.ts: una sola fuente de verdad para que los
 * consumidores no se desincronicen.
 */

/**
 * Ventana (en horas) tras la cual una orden WOMPI que sigue en PENDING_PAYMENT
 * se considera expirada y se AUTO-CANCELA (cron /api/cron/expire-pending-orders,
 * servicio expireStalePendingOrders — remediación N-12).
 *
 * Mientras la ventana no vence, la orden queda reutilizable: Wompi habilita el
 * reintento con la misma reference y createOrderFromCart reusa la orden PENDING
 * por cartId. Como ni el stock ni el cupón se consumen antes de PAID (el
 * decremento y el CouponUsage nacen en la saga post-PAID), expirar no revierte
 * nada — la transición PENDING_PAYMENT → CANCELLED es un needsRevert no-op.
 *
 * OJO (contrato compartido): la alerta `pending_payment_wompi_stale` de
 * features/observability/alerts.ts usa este MISMO valor como umbral para dejar
 * de alertar como "pago posiblemente cobrado sin confirmar" una vez que el
 * cron ya pudo expirar la orden. Si se ajusta acá, ajustarla allá (la ajusta
 * el agente de observability).
 */
export const PENDING_PAYMENT_EXPIRY_HOURS = 24;
