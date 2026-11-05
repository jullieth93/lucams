import type { OrderStatus } from "@lucams/db";

/**
 * Estados de pedido que habilitan dejar una reseña (el pedido se compró DE VERDAD
 * y el cliente YA lo tiene en la mano). Compartido entre el server action
 * (submitReviewAction), el gate del token de invitado y el gate visible del PDP
 * (product-reviews.tsx, #19) para que no se desincronicen: si la UI muestra el
 * formulario pero el action lo rechaza (o al revés), el cliente pierde su reseña
 * escrita o ve un formulario que nunca podrá enviar.
 *
 * Endurecido a DELIVERED únicamente (2026-11-05, decisión de la operadora): en
 * Lucams los estados logísticos intermedios se marcan manualmente (Envía/Envío
 * Lucams no garantizan tracking automático de punta a punta), así que DELIVERED
 * es la única señal confiable de entrega real — nadie opina de un producto que
 * aún no recibió (evita reseñas de pedidos pagados pero cancelados o con novedad).
 */
export const REVIEWABLE_ORDER_STATUSES: OrderStatus[] = ["DELIVERED"];
