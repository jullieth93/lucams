/*
 * Template: pedido entregado (cuando webhook Aveonline reporta DELIVERED).
 * Pide reseña al cliente.
 */

import { renderEmailLayout, ctaButton } from "../layout";
import { getSettingValue } from "@/lib/cms";

export type OrderDeliveredData = {
  orderNumber: string;
  customerName: string;
  publicTrackingToken: string | null;
};

export async function orderDeliveredEmail(data: OrderDeliveredData) {
  const siteUrl = await getSettingValue("SITE_URL", "https://lucamsshop.co");

  const bodyHtml = `
<h1 style="margin:0 0 12px 0;font-size:22px;color:#3D2E5C;">¡Tu pedido llegó! 💜</h1>
<p>Hola ${escapeHtml(data.customerName)}, según la transportadora tu pedido <strong>${escapeHtml(data.orderNumber)}</strong> ya está en tus manos.</p>
<p>Esperamos que te enamore tanto como a nosotros nos enamora hacerlo.</p>

<p style="margin-top:18px;font-size:15px;"><strong>¿Nos cuentas cómo te fue?</strong></p>
<p>Una reseña nos ayuda muchísimo y nos toma a vos solo 30 segundos.</p>

${ctaButton(
  data.publicTrackingToken
    ? `${siteUrl}/pedido/${data.publicTrackingToken}`
    : `${siteUrl}/mi-cuenta/pedidos`,
  "Dejar una reseña ⭐",
)}

<p style="font-size:13px;color:#3D2E5C;opacity:0.65;margin-top:18px;">¿Algún inconveniente con el pedido? Respondé este email o escríbenos por WhatsApp. Tenemos 5 días hábiles de retracto Ley 1480.</p>
`;

  const text = `¡Tu pedido llegó!

Hola ${data.customerName},

Tu pedido ${data.orderNumber} ya está en tus manos según la transportadora.

¿Nos cuentas cómo te fue? Una reseña nos ayuda mucho:
${siteUrl}/mi-cuenta/pedidos

¿Algún inconveniente? Respondé este email o escríbenos por WhatsApp.`;

  return {
    subject: `¡Tu pedido ${data.orderNumber} llegó! 💜`,
    html: await renderEmailLayout({
      preview: "¿Nos cuentas cómo te fue? Una reseña nos ayuda mucho.",
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
