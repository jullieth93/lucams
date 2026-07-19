/*
 * Template: diseño rechazado en moderación (ADR-062 P0-2). Se envía cuando Lucy rechaza el
 * contenido de un diseño personalizado antes de imprimirlo (ilegal, ofensivo o que infringe
 * derechos). Tono empático es-CO, con el motivo y una salida clara (ajustar o reembolso).
 */

import { renderEmailLayout } from "../layout";
import { getSettingValue } from "@/lib/cms";

export type DesignRejectedData = {
  orderNumber: string;
  customerName: string;
  productName: string;
  reason: string;
  /**
   * #10 — token de acceso público del pedido. Un pedido de INVITADO no tiene login → el link a
   * /mi-cuenta/pedidos moriría en el muro de autenticación. Con token, apuntamos a la vista pública
   * /pedido/<token>; sin token (cliente con cuenta), caemos al histórico de la cuenta.
   */
  publicTrackingToken: string | null;
};

export async function designRejectedEmail(data: DesignRejectedData) {
  const siteUrl = await getSettingValue("SITE_URL", "https://lucamsshop.co");
  const orderUrl = data.publicTrackingToken
    ? `${siteUrl}/pedido/${data.publicTrackingToken}`
    : `${siteUrl}/mi-cuenta/pedidos`;
  const bodyHtml = `
<h1 style="margin:0 0 12px 0;font-size:22px;color:#3D2E5C;">Necesitamos ajustar tu diseño</h1>
<p>Hola ${escapeHtml(data.customerName)}, revisamos el diseño de <strong>${escapeHtml(data.productName)}</strong> de tu pedido <strong>${escapeHtml(data.orderNumber)}</strong> y no podemos imprimirlo tal como está.</p>
<p style="font-size:14px;color:#3D2E5C;opacity:0.85;margin-top:12px;">Motivo: ${escapeHtml(data.reason)}</p>
<p style="margin-top:14px;">Escríbenos por WhatsApp o respóndenos este correo y te ayudamos a ajustarlo. Si prefieres, <strong>te devolvemos el dinero</strong> de ese producto sin problema. 💜</p>
<p><a href="${orderUrl}" style="color:#C42B76;font-weight:600;">Ver mi pedido →</a></p>
`;

  const text = `Necesitamos ajustar tu diseño

Hola ${data.customerName},

Revisamos el diseño de ${data.productName} de tu pedido ${data.orderNumber} y no podemos imprimirlo tal como está.

Motivo: ${data.reason}

Escríbenos por WhatsApp o respóndenos este correo y te ayudamos a ajustarlo. Si prefieres, te devolvemos el dinero de ese producto sin problema.

Ver mi pedido: ${orderUrl}`;

  return {
    subject: `Necesitamos ajustar tu diseño — pedido ${data.orderNumber}`,
    html: await renderEmailLayout({
      preview: `Revisamos el diseño de tu pedido ${data.orderNumber} y necesitamos ajustarlo.`,
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
