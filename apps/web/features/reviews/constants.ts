import type { OrderStatus } from "@lucams/db";

/**
 * Estados de pedido que habilitan dejar una reseña (el pedido se compró de
 * verdad). Compartido entre el server action (submitReviewAction) y el gate
 * visible del PDP (product-reviews.tsx, #19) para que no se desincronicen: si
 * la UI muestra el formulario pero el action lo rechaza (o al revés), el
 * cliente pierde su reseña escrita o ve un formulario que nunca podrá enviar.
 */
export const REVIEWABLE_ORDER_STATUSES: OrderStatus[] = [
  "PAID",
  "FULFILLING",
  "SHIPPED",
  "DELIVERED",
];
