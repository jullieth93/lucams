/*
 * Template: solicitud de reseña (palanca de ingreso, auditoría 2026-07-13). Follow-up DEMORADO
 * (~7 días tras la entrega) — distinto del order-delivered inmediato. Un empujón gentil para pedir
 * reseña de los productos comprados, con link directo a cada uno. es-CO tuteo.
 */

import { renderEmailLayout, ctaButton, getSiteUrl } from "../layout";

export type ReviewRequestData = {
  orderNumber: string;
  customerName: string;
  products: Array<{ name: string; slug: string }>;
  /**
   * #10 — token de acceso público del pedido. Un pedido de INVITADO no tiene login → el link a
   * /mi-cuenta/pedidos moriría en el muro de autenticación. Con token, apuntamos a la vista pública
   * /pedido/<token>; sin token (cliente con cuenta), caemos al histórico de la cuenta.
   */
  publicTrackingToken: string | null;
  /** Enlace de baja visible (correo comercial). */
  unsubscribeUrl?: string;
};

export async function reviewRequestEmail(data: ReviewRequestData) {
  const siteUrl = await getSiteUrl();
  const orderUrl = data.publicTrackingToken
    ? `${siteUrl}/pedido/${data.publicTrackingToken}`
    : `${siteUrl}/mi-cuenta/pedidos`;

  // Lista de productos con link directo a su ficha (donde está el formulario de reseña).
  const productList = data.products
    .map(
      (p) =>
        `<li style="margin-bottom:6px;"><a href="${siteUrl}/producto/${encodeURIComponent(p.slug)}" style="color:#C42B76;font-weight:600;">${escapeHtml(p.name)}</a></li>`,
    )
    .join("");
  const productListText = data.products
    .map((p) => `- ${p.name}: ${siteUrl}/producto/${encodeURIComponent(p.slug)}`)
    .join("\n");

  const bodyHtml = `
<h1 style="margin:0 0 12px 0;font-size:22px;color:#3D2E5C;">¿Ya probaste tus imanes? ⭐</h1>
<p>Hola ${escapeHtml(data.customerName)}, ya pasó una semanita desde que te llegó tu pedido <strong>${escapeHtml(data.orderNumber)}</strong>. ¡Esperamos que te encanten!</p>
<p style="margin-top:14px;"><strong>Tu opinión nos ayuda un montón</strong> — y a otras personas a decidir. Te toma menos de un minuto:</p>
<ul style="padding-left:18px;color:#3D2E5C;">${productList}</ul>
${ctaButton(orderUrl, "Dejar mi reseña ⭐")}
<p style="font-size:13px;color:#3D2E5C;opacity:0.65;margin-top:18px;">¿Algo no salió como esperabas? Responde este correo o escríbenos por WhatsApp y lo resolvemos. 💜</p>
`;

  const text = `¿Ya probaste tus imanes?

Hola ${data.customerName},

Ya pasó una semana desde que te llegó tu pedido ${data.orderNumber}. ¡Esperamos que te encanten!

Tu opinión nos ayuda un montón (y a otras personas a decidir). Déjanos tu reseña:
${productListText}

O desde tu pedido: ${orderUrl}

¿Algo no salió como esperabas? Responde este correo o escríbenos por WhatsApp.`;

  return {
    subject: `${data.customerName}, ¿nos dejas tu reseña? ⭐`,
    html: await renderEmailLayout({
      preview: "Tu opinión nos ayuda un montón — y te toma menos de un minuto.",
      unsubscribeUrl: data.unsubscribeUrl,
      bodyHtml,
    }),
    text,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
