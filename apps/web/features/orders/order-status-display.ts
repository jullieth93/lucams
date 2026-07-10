/*
 * Presentación compartida de OrderStatus (label + badge) para el cliente y el
 * admin. Antes estaba triplicado en mi-cuenta/pedidos (lista y detalle) y en el
 * detalle admin, con divergencias. Fuente única acá.
 */

export const ORDER_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Borrador",
  PENDING_PAYMENT: "Esperando pago",
  PAID: "Pagado",
  FULFILLING: "En preparación",
  SHIPPED: "Enviado",
  DELIVERED: "Entregado",
  CANCELLED: "Cancelado",
  REFUNDED: "Reembolsado",
};

export const ORDER_STATUS_BADGE_CLASS: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  PENDING_PAYMENT: "bg-amber-100 text-amber-900",
  PAID: "bg-brand-purple/15 text-brand-purple-dark",
  FULFILLING: "bg-brand-purple/15 text-brand-purple-dark",
  SHIPPED: "bg-brand-purple/15 text-brand-purple-dark",
  DELIVERED: "bg-emerald-100 text-emerald-900",
  CANCELLED: "bg-rose-100 text-rose-900",
  REFUNDED: "bg-rose-100 text-rose-900",
};

export function orderStatusLabel(status: string): string {
  return ORDER_STATUS_LABEL[status] ?? status;
}

export function orderStatusBadgeClass(status: string): string {
  return ORDER_STATUS_BADGE_CLASS[status] ?? "bg-slate-100 text-slate-700";
}
