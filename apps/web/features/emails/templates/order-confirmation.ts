/*
 * Template: confirmación de pago.
 *
 * Enviado cuando webhook Wompi confirma APPROVED → Order pasa a PAID
 * (antes de createShipment para no bloquear el flow si Aveonline falla).
 */

import { renderEmailLayout, ctaButton } from "../layout";
import { getSettingValue } from "@/lib/cms";
import { formatCOP } from "@/lib/format";

export type OrderConfirmationData = {
  orderNumber: string;
  customerName: string;
  total: number; // centavos COP
  subtotal: number;
  shipping: number;
  shippingCarrier: string | null;
  items: Array<{ name: string; qty: number; lineTotal: number }>;
  shippingAddress: string; // ya formateada
};

export async function orderConfirmationEmail(data: OrderConfirmationData) {
  const siteUrl = await getSettingValue("SITE_URL", "https://lucamsshop.co");
  const itemsRows = data.items
    .map(
      (it) => `
<tr>
  <td style="padding:8px 0;border-bottom:1px solid #f0e7e0;color:#3D2E5C;">
    ${escapeHtml(it.name)} <span style="opacity:0.55;">×${it.qty}</span>
  </td>
  <td style="padding:8px 0;border-bottom:1px solid #f0e7e0;text-align:right;color:#3D2E5C;font-weight:600;">${formatCOP(it.lineTotal)}</td>
</tr>`,
    )
    .join("");

  const bodyHtml = `
<h1 style="margin:0 0 12px 0;font-size:22px;color:#3D2E5C;">¡Tu pedido está confirmado! 🎉</h1>
<p>Hola ${escapeHtml(data.customerName)}, recibimos tu pago para el pedido <strong>${escapeHtml(data.orderNumber)}</strong>.</p>
<p>Ya empezamos a preparar tu pedido. Te avisamos en cuanto salga para entrega.</p>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:20px 0;border-collapse:collapse;">
  ${itemsRows}
  <tr>
    <td style="padding:12px 0 4px 0;color:#3D2E5C;opacity:0.7;font-size:13px;">Subtotal</td>
    <td style="padding:12px 0 4px 0;text-align:right;color:#3D2E5C;font-size:13px;">${formatCOP(data.subtotal)}</td>
  </tr>
  <tr>
    <td style="padding:4px 0;color:#3D2E5C;opacity:0.7;font-size:13px;">Envío${data.shippingCarrier ? ` (${escapeHtml(data.shippingCarrier)})` : ""}</td>
    <td style="padding:4px 0;text-align:right;color:#3D2E5C;font-size:13px;">${formatCOP(data.shipping)}</td>
  </tr>
  <tr>
    <td style="padding:12px 0 4px 0;color:#3D2E5C;font-size:16px;font-weight:700;border-top:2px solid #3D2E5C;">Total</td>
    <td style="padding:12px 0 4px 0;text-align:right;color:#3D2E5C;font-size:16px;font-weight:700;border-top:2px solid #3D2E5C;">${formatCOP(data.total)}</td>
  </tr>
</table>

<p style="font-size:14px;color:#3D2E5C;"><strong>Enviamos a:</strong><br>${escapeHtml(data.shippingAddress)}</p>

${ctaButton(`${siteUrl}/mi-cuenta/pedidos`, "Ver mi pedido →")}

<p style="font-size:13px;color:#3D2E5C;opacity:0.65;margin-top:18px;">¿Algún cambio? Escríbenos por WhatsApp o respondé este email.</p>
`;

  const text = `¡Tu pedido está confirmado!

Hola ${data.customerName},

Recibimos tu pago para el pedido ${data.orderNumber}.

Items:
${data.items.map((it) => `  - ${it.name} ×${it.qty} → ${formatCOP(it.lineTotal)}`).join("\n")}

Subtotal: ${formatCOP(data.subtotal)}
Envío${data.shippingCarrier ? ` (${data.shippingCarrier})` : ""}: ${formatCOP(data.shipping)}
Total: ${formatCOP(data.total)}

Enviamos a: ${data.shippingAddress}

Ver mi pedido: ${siteUrl}/mi-cuenta/pedidos`;

  return {
    subject: `Pedido ${data.orderNumber} confirmado 🎉`,
    html: await renderEmailLayout({
      preview: `Total ${formatCOP(data.total)} · ya estamos preparando tu pedido`,
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
