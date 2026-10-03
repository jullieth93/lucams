/*
 * Template: solicitud de reseña (palanca de ingreso, auditoría 2026-07-13). Follow-up DEMORADO
 * (~7 días tras la entrega) — distinto del order-delivered inmediato. Un empujón gentil para pedir
 * reseña de los productos comprados, con link directo a cada uno. es-CO tuteo.
 *
 * CTA (2026-10): el link principal va a /resena/<token> — landing de reseña SIN
 * login verificada por token firmado HMAC (features/reviews/review-token.ts) —
 * porque el publicTrackingToken ya no se persiste en claro (F-11) y el form de
 * la PDP exige sesión: los invitados no tenían cómo reseñar. Cada producto
 * enlaza a /resena/<token>?p=<productId> (preselección). Si la emisión del
 * token falla (p. ej. CSRF_SECRET ausente), el service pasa reviewToken=null y
 * el correo cae al flujo anterior: CTA a /rastrear + links a la ficha del
 * producto (mejor un email útil que un email roto).
 */

import { renderEmailLayout, ctaButton, getSiteUrl } from "../layout";

export type ReviewRequestData = {
  orderNumber: string;
  customerName: string;
  products: Array<{ id: string; name: string; slug: string }>;
  /**
   * Token firmado de reseña (un solo uso por producto, expira a los 30 días).
   * Con token el CTA apunta a /resena/<token> (sin login); null → fallback a
   * /rastrear + fichas de producto.
   */
  reviewToken: string | null;
  /** Enlace de baja visible (correo comercial). */
  unsubscribeUrl?: string;
};

export async function reviewRequestEmail(data: ReviewRequestData) {
  const siteUrl = await getSiteUrl();
  const reviewUrl = data.reviewToken
    ? `${siteUrl}/resena/${data.reviewToken}`
    : `${siteUrl}/rastrear`;

  // Con token cada producto enlaza a la landing con ese producto preseleccionado;
  // sin token, a su ficha (donde está el formulario de reseña con login).
  const productHref = (p: { id: string; slug: string }) =>
    data.reviewToken
      ? `${siteUrl}/resena/${data.reviewToken}?p=${encodeURIComponent(p.id)}`
      : `${siteUrl}/producto/${encodeURIComponent(p.slug)}`;

  const productList = data.products
    .map(
      (p) =>
        `<li style="margin-bottom:6px;"><a href="${productHref(p)}" style="color:#C42B76;font-weight:600;">${escapeHtml(p.name)}</a></li>`,
    )
    .join("");
  const productListText = data.products.map((p) => `- ${p.name}: ${productHref(p)}`).join("\n");

  // /rastrear queda como info secundaria del estado del pedido (con token; sin
  // token ya ES el destino del CTA).
  const trackingNoteHtml = data.reviewToken
    ? `<p style="font-size:13px;color:#3D2E5C;opacity:0.65;margin-top:14px;">¿Quieres ver el estado de tu pedido? <a href="${siteUrl}/rastrear" style="color:#3D2E5C;font-weight:600;">Rastréalo aquí</a>.</p>`
    : "";
  const trackingNoteText = data.reviewToken
    ? `\n¿Quieres ver el estado de tu pedido? ${siteUrl}/rastrear\n`
    : "";

  const bodyHtml = `
<h1 style="margin:0 0 12px 0;font-size:22px;color:#3D2E5C;">¿Ya probaste tus imanes? ⭐</h1>
<p>Hola ${escapeHtml(data.customerName)}, ya pasó una semanita desde que te llegó tu pedido <strong>${escapeHtml(data.orderNumber)}</strong>. ¡Esperamos que te encanten!</p>
<p style="margin-top:14px;"><strong>Tu opinión nos ayuda un montón</strong> — y a otras personas a decidir. Te toma menos de un minuto:</p>
<ul style="padding-left:18px;color:#3D2E5C;">${productList}</ul>
${ctaButton(reviewUrl, "Dejar mi reseña ⭐")}
${trackingNoteHtml}
<p style="font-size:13px;color:#3D2E5C;opacity:0.65;margin-top:18px;">¿Algo no salió como esperabas? Responde este correo o escríbenos por WhatsApp y lo resolvemos. 💜</p>
`;

  const text = `¿Ya probaste tus imanes?

Hola ${data.customerName},

Ya pasó una semana desde que te llegó tu pedido ${data.orderNumber}. ¡Esperamos que te encanten!

Tu opinión nos ayuda un montón (y a otras personas a decidir). Déjanos tu reseña:
${productListText}

O desde aquí: ${reviewUrl}
${trackingNoteText}
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
