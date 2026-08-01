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
  /** Descuento por cupón (centavos COP, positivo). 0/undefined ⇒ no se muestra la fila. */
  discount?: number;
  shippingCarrier: string | null;
  items: Array<{ name: string; qty: number; lineTotal: number }>;
  shippingAddress: string; // ya formateada
  /** Token público para vista guest /pedido/<token> sin login. */
  publicTrackingToken: string | null;
  /** COD ⇒ el cliente paga en efectivo al recibir (no hubo pago online). */
  paymentMethod?: "WOMPI" | "COD";
};

export async function orderConfirmationEmail(data: OrderConfirmationData) {
  const siteUrl = await getSettingValue("SITE_URL", "https://lucamsshop.com");
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

  const discount = data.discount ?? 0;
  const discountRowHtml =
    discount > 0
      ? `
  <tr>
    <td style="padding:4px 0;color:#1a7a4f;font-size:13px;">Descuento</td>
    <td style="padding:4px 0;text-align:right;color:#1a7a4f;font-size:13px;">−${formatCOP(discount)}</td>
  </tr>`
      : "";

  const isCod = data.paymentMethod === "COD";
  const codCallout = isCod
    ? `
<div style="margin:14px 0;padding:12px 14px;border:1px solid #FFD93D;background:#FFFBEA;border-radius:10px;">
  <div style="font-weight:700;color:#3D2E5C;">💵 Pago contraentrega</div>
  <div style="font-size:14px;color:#3D2E5C;">Pagas <strong>${formatCOP(data.total)}</strong> en efectivo cuando el mensajero te entregue el pedido.</div>
</div>`
    : "";

  const bodyHtml = `
<h1 style="margin:0 0 12px 0;font-size:22px;color:#3D2E5C;">¡Tu pedido está confirmado! 🎉</h1>
<p>Hola ${escapeHtml(data.customerName)}, ${
    isCod
      ? `recibimos tu pedido <strong>${escapeHtml(data.orderNumber)}</strong>.`
      : `recibimos tu pago para el pedido <strong>${escapeHtml(data.orderNumber)}</strong>.`
  }</p>
${codCallout}
<p>Ya empezamos a preparar tu pedido: lo despachamos en máximo <strong>2 días hábiles</strong> y te avisamos con el número de guía apenas salga. De ahí en adelante el tiempo lo pone la transportadora y depende de tu ciudad.</p>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:20px 0;border-collapse:collapse;">
  ${itemsRows}
  <tr>
    <td style="padding:12px 0 4px 0;color:#3D2E5C;opacity:0.7;font-size:13px;">Subtotal</td>
    <td style="padding:12px 0 4px 0;text-align:right;color:#3D2E5C;font-size:13px;">${formatCOP(data.subtotal)}</td>
  </tr>
  <tr>
    <td style="padding:4px 0;color:#3D2E5C;opacity:0.7;font-size:13px;">Envío${data.shippingCarrier ? ` (${escapeHtml(data.shippingCarrier)})` : ""}</td>
    <td style="padding:4px 0;text-align:right;color:#3D2E5C;font-size:13px;">${formatCOP(data.shipping)}</td>
  </tr>${discountRowHtml}
  <tr>
    <td style="padding:12px 0 4px 0;color:#3D2E5C;font-size:16px;font-weight:700;border-top:2px solid #3D2E5C;">Total</td>
    <td style="padding:12px 0 4px 0;text-align:right;color:#3D2E5C;font-size:16px;font-weight:700;border-top:2px solid #3D2E5C;">${formatCOP(data.total)}</td>
  </tr>
</table>

<p style="font-size:14px;color:#3D2E5C;"><strong>Enviamos a:</strong><br>${escapeHtml(data.shippingAddress)}</p>

${ctaButton(
  data.publicTrackingToken
    ? `${siteUrl}/pedido/${data.publicTrackingToken}`
    : `${siteUrl}/mi-cuenta/pedidos`,
  "Ver mi pedido →",
)}

<p style="font-size:12px;color:#3D2E5C;opacity:0.6;margin-top:16px;">Los valores están en pesos colombianos (COP) y son el total que pagas. Conoce tu <a href="${siteUrl}/legal/devoluciones" style="color:#7C6AAD;">derecho de retracto</a> (5 días hábiles para el catálogo estándar; los productos personalizados no aplican) y la <a href="${siteUrl}/legal/garantias" style="color:#7C6AAD;">garantía legal de 1 año</a>.</p>

<p style="font-size:13px;color:#3D2E5C;opacity:0.65;margin-top:14px;">¿Algún cambio? Escríbenos por WhatsApp o responde este correo.</p>
`;

  const text = `¡Tu pedido está confirmado!

Hola ${data.customerName},

${
  isCod
    ? `Recibimos tu pedido ${data.orderNumber}.
💵 Pago contraentrega: pagas ${formatCOP(data.total)} en efectivo al recibir.`
    : `Recibimos tu pago para el pedido ${data.orderNumber}.`
}

Items:
${data.items.map((it) => `  - ${it.name} ×${it.qty} → ${formatCOP(it.lineTotal)}`).join("\n")}

Subtotal: ${formatCOP(data.subtotal)}
Envío${data.shippingCarrier ? ` (${data.shippingCarrier})` : ""}: ${formatCOP(data.shipping)}${discount > 0 ? `\nDescuento: −${formatCOP(discount)}` : ""}
Total: ${formatCOP(data.total)}

Enviamos a: ${data.shippingAddress}

Ver mi pedido: ${data.publicTrackingToken ? `${siteUrl}/pedido/${data.publicTrackingToken}` : `${siteUrl}/mi-cuenta/pedidos`}

Los valores están en pesos colombianos (COP) y son el total que pagas.
Retracto (5 días hábiles, catálogo estándar): ${siteUrl}/legal/devoluciones
Garantía legal (1 año): ${siteUrl}/legal/garantias`;

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
