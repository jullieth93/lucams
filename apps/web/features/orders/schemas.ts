/*
 * Zod schemas para Order creation + state machine.
 *
 * Validación en boundaries (Server Actions) — service.ts asume datos
 * ya validados.
 */

import { z } from "zod";

/**
 * Dirección de envío (snapshot inmutable en Order.shippingAddress JSON).
 * Validamos campos mínimos para que Aveonline pueda cotizar + generar guía.
 */
export const ShippingAddressSchema = z.object({
  fullName: z.string().min(2, "El nombre es obligatorio").max(120),
  email: z.email("Email inválido").max(160),
  phone: z.string().min(7, "Teléfono inválido").max(30),
  documentType: z.enum(["CC", "CE", "NIT", "PP", "TI"]).optional(),
  documentNumber: z.string().max(30).optional(),
  city: z.string().min(2, "La ciudad es obligatoria").max(80),
  department: z.string().min(2, "El departamento es obligatorio").max(80),
  addressLine1: z.string().min(5, "Dirección requerida").max(200),
  addressLine2: z.string().max(200).optional(),
  zip: z.string().max(10).optional(),
  notes: z.string().max(500).optional(),
});
export type ShippingAddressInput = z.infer<typeof ShippingAddressSchema>;

/**
 * Datos de facturación electrónica DIAN (opcional, captura en checkout).
 * Si el cliente NO quiere factura, queda dianStatus="NOT_REQUIRED".
 */
export const BillingSchema = z.object({
  wantsInvoice: z.boolean(),
  documentType: z.enum(["CC", "CE", "NIT", "PP"]).optional(),
  documentNumber: z.string().max(30).optional(),
  name: z.string().max(200).optional(),
});
export type BillingInput = z.infer<typeof BillingSchema>;

/**
 * Selección de envío realizada por el cliente (output de cotización
 * Aveonline → input al crear Order).
 */
export const ShippingSelectionSchema = z.object({
  carrier: z.string().min(1).max(60), // "envia" | "tcc" | "coordinadora" | etc.
  carrierName: z.string().min(1).max(120),
  fleteCop: z.number().int().min(0), // costo en centavos
  deliveryDays: z.number().int().min(0).max(30),
  contraentrega: z.boolean(),
  quoteId: z.string().max(120),
});
export type ShippingSelectionInput = z.infer<typeof ShippingSelectionSchema>;

/**
 * Input completo para crear una Order desde un Cart. La Server Action
 * en /checkout/pago debe construir este objeto y pasarlo a createOrderFromCart.
 */
export const CreateOrderInputSchema = z.object({
  cartId: z.string().min(1),
  customerId: z.string().nullable(),
  shipping: ShippingAddressSchema,
  shippingSelection: ShippingSelectionSchema,
  billing: BillingSchema,
  paymentMethod: z.enum(["WOMPI", "COD"]),
  couponCode: z.string().optional(),
  notes: z.string().max(500).optional(),
});
export type CreateOrderInput = z.infer<typeof CreateOrderInputSchema>;

/** Estados terminales — no permiten transición. */
export const TERMINAL_ORDER_STATUSES = ["CANCELLED", "REFUNDED", "DELIVERED"] as const;

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
