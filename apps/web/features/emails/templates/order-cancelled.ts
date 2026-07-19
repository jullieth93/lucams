/*
 * Template: pedido cancelado (auditoría 2026-07-13). Se envía cuando el admin cancela
 * manualmente un pedido (incidencia, cliente desistió, dirección errada, etc.) — NO para
 * cancelaciones por pago rechazado (esas usan order-payment-failed). Tono empático es-CO.
 */

import { renderEmailLayout } from "../layout";
import { getSettingValue } from "@/lib/cms";

export type OrderCancelledData = {
  orderNumber: string;
  customerName: string;
  reason?: string | null;
};

export async function orderCancelledEmail(data: OrderCancelledData) {
  const siteUrl = await getSettingValue("SITE_URL", "https://lucamsshop.co");
  const reasonHtml = data.reason
    ? `<p style="font-size:14px;color:#3D2E5C;opacity:0.8;">Motivo: ${escapeHtml(data.reason)}</p>`
    : "";
  const reasonText = data.reason ? `\nMotivo: ${data.reason}\n` : "";

  const bodyHtml = `
<h1 style="margin:0 0 12px 0;font-size:22px;color:#3D2E5C;">Cancelamos tu pedido</h1>
<p>Hola ${escapeHtml(data.customerName)}, tu pedido <strong>${escapeHtml(data.orderNumber)}</strong> fue cancelado.</p>
${reasonHtml}
<p style="margin-top:14px;">Si ya habías pagado, <strong>te devolvemos el dinero</strong>: puede tardar unos días hábiles en reflejarse según tu medio de pago. Si era contraentrega, no te cobramos nada.</p>
<p style="margin-top:14px;">¿Fue un error o quieres retomar tu compra? Escríbenos por WhatsApp o respóndenos este correo y te ayudamos. 💜</p>
<p><a href="${siteUrl}/productos" style="color:#C42B76;font-weight:600;">Ver el catálogo →</a></p>
`;

  const text = `Cancelamos tu pedido

Hola ${data.customerName},

Tu pedido ${data.orderNumber} fue cancelado.
${reasonText}
Si ya habías pagado, te devolvemos el dinero (puede tardar unos días hábiles según tu medio de pago). Si era contraentrega, no te cobramos nada.

¿Fue un error o quieres retomar tu compra? Escríbenos por WhatsApp o respóndenos este correo.

Ver el catálogo: ${siteUrl}/productos`;

  return {
    subject: `Tu pedido ${data.orderNumber} fue cancelado`,
    html: await renderEmailLayout({
      preview: `Cancelamos tu pedido ${data.orderNumber}. Si pagaste, te reembolsamos.`,
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
