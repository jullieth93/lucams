/*
 * Máquina de estados de Order + tipo del snapshot de dirección.
 *
 * Los Zod schemas de creación de Order (ShippingAddressSchema, BillingSchema,
 * ShippingSelectionSchema, CreateOrderInputSchema) se retiraron en N-23
 * (2026-09-12): eran duplicados sin consumidores — los vivos, usados por las
 * Server Actions del checkout, están en features/checkout/schemas.ts.
 * La validación corre en los boundaries (Server Actions); service.ts asume
 * datos ya validados.
 */

/**
 * Snapshot plano de la dirección de envío persistido en Order.shippingAddress
 * (JSON inmutable). El checkout lo construye aplanando ContactSchema +
 * AddressSchema (composeAddressLine) — ver features/checkout/service.ts.
 */
export type ShippingAddressInput = {
  fullName: string;
  email: string;
  phone: string;
  documentType?: "CC" | "CE" | "NIT" | "PP" | "TI";
  documentNumber?: string;
  city: string;
  department: string;
  addressLine1: string;
  addressLine2?: string;
  zip?: string;
  notes?: string;
};

/**
 * Transiciones válidas. Cada key es estado origen, value es array de
 * estados destino legales. El service rechaza transiciones fuera de este map.
 *
 * DRAFT → PENDING_PAYMENT (al confirmar checkout)
 * PENDING_PAYMENT → PAID (webhook Wompi APPROVED)
 *                 → CANCELLED (webhook Wompi DECLINED/VOIDED/ERROR + manual)
 * PAID → FULFILLING (al crear guía Aveonline)
 *      → REFUNDED (manual admin, requiere refund Wompi previo)
 * FULFILLING → SHIPPED (al imprimir/despachar guía)
 *            → CANCELLED (manual, requiere cancelar guía + refund)
 * SHIPPED → DELIVERED (webhook Aveonline DELIVERED)
 *         → CANCELLED (devolución/incidencia)
 * DELIVERED → REFUNDED (post-venta, devolución)
 */
export const ORDER_TRANSITIONS: Record<string, readonly string[]> = {
  DRAFT: ["PENDING_PAYMENT", "CANCELLED"],
  PENDING_PAYMENT: ["PAID", "CANCELLED"],
  // PAID → CANCELLED es legal para COD (efectivo NO cobrado → solo revertir stock, sin
  // reembolso). Para Wompi (dinero capturado) el admin usa REFUNDED; el UI ofrece el
  // botón correcto según paymentMethod (revisión adversarial COD).
  PAID: ["FULFILLING", "REFUNDED", "CANCELLED"],
  FULFILLING: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED", "CANCELLED"],
  DELIVERED: ["REFUNDED"],
  CANCELLED: [],
  REFUNDED: [],
};

export function canTransition(from: string, to: string): boolean {
  return ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}
