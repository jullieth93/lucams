/*
 * Template: pedido entregado (cuando webhook Aveonline reporta DELIVERED).
 * Pide reseña al cliente.
 *
 * CTA (E3, 2026-10-07): con `reviewUrl` (landing /resena/<token> HMAC
 * stateless, sin login — ver features/reviews/review-token.ts) el botón es
 * "Dejar una reseña ⭐" y apunta a la URL que REALMENTE reseña, para invitados
 * y registrados por igual. Sin `reviewUrl` (falló la emisión del token, p. ej.
 * CSRF_SECRET ausente) el CTA cae a "Ver mi pedido" con `fallbackUrl`
 * (registrado → /mi-cuenta/pedidos/<number>; invitado → /rastrear): nunca se
 * promete una reseña que el link no puede tomar (antes el fallback /rastrear
 * con copy "Dejar una reseña" era un callejón sin salida, F-11).
 */

import { renderEmailLayout, ctaButton } from "../layout";

export type OrderDeliveredData = {
  orderNumber: string;
  customerName: string;
  /** URL real de reseña (/resena/<token>); null si no se pudo emitir el token. */
  reviewUrl: string | null;
  /** Destino del CTA cuando NO hay reviewUrl (el pedido del cliente o /rastrear). */
  fallbackUrl: string;
  /** true = entrega propia "Envío Lucam's": la confirmación la hizo nuestro
   *  equipo (no una transportadora externa). */
  internalDelivery?: boolean;
};

export async function orderDeliveredEmail(data: OrderDeliveredData) {
  const deliveredBy = data.internalDelivery
    ? "nuestro equipo Lucam's entregó"
    : "según la transportadora, llegó";

  // El CTA solo promete reseña cuando la URL realmente reseña (E3).
  const cta = data.reviewUrl
    ? `
<p style="margin-top:18px;font-size:15px;"><strong>¿Nos cuentas cómo te fue?</strong></p>
<p>Una reseña nos ayuda muchísimo y te toma solo 30 segundos.</p>

${ctaButton(data.reviewUrl, "Dejar una reseña ⭐")}
`
    : `
<p style="margin-top:18px;font-size:15px;">Puedes ver el detalle de tu pedido cuando quieras:</p>

${ctaButton(data.fallbackUrl, "Ver mi pedido")}
`;

  const bodyHtml = `
<h1 style="margin:0 0 12px 0;font-size:22px;color:#3D2E5C;">¡Tu pedido llegó! 💜</h1>
<p>Hola ${escapeHtml(data.customerName)}, ${deliveredBy} tu pedido <strong>${escapeHtml(data.orderNumber)}</strong> y ya está en tus manos.</p>
<p>Esperamos que te enamore tanto como a nosotros nos enamora hacerlo.</p>
${cta}
<p style="font-size:13px;color:#3D2E5C;opacity:0.65;margin-top:18px;">¿Algún inconveniente con el pedido? Responde este correo o escríbenos por WhatsApp. Los productos sin personalizar tienen 5 días hábiles de retracto (Ley 1480); los personalizados con tu foto/texto están excluidos por ley.</p>
`;

  const text = `¡Tu pedido llegó!

Hola ${data.customerName},

Tu pedido ${data.orderNumber} ya está en tus manos (${data.internalDelivery ? "lo entregó nuestro equipo Lucam's" : "confirmado por la transportadora"}).
${
  data.reviewUrl
    ? `
¿Nos cuentas cómo te fue? Una reseña nos ayuda mucho:
${data.reviewUrl}
`
    : `
Puedes ver el detalle de tu pedido aquí:
${data.fallbackUrl}
`
}
¿Algún inconveniente? Responde este correo o escríbenos por WhatsApp.`;

  return {
    subject: `¡Tu pedido ${data.orderNumber} llegó! 💜`,
    html: await renderEmailLayout({
      preview: data.reviewUrl
        ? "¿Nos cuentas cómo te fue? Una reseña nos ayuda mucho."
        : "Tu pedido ya está en tus manos.",
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
