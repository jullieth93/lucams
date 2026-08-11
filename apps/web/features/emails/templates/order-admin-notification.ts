/*
 * Template: notificación INTERNA al admin cuando se PAGA un pedido.
 *
 * Gap que cubre (reportado por Lucy 2026-08-11: "como admin, ¿cómo me entero
 * de un nuevo pedido?"): una orden que entra y se paga bien NO generaba aviso
 * de ningún tipo — solo era visible entrando a /admin/pedidos o en el resumen
 * diario. Este correo sale en processPaidOrder (webhook Wompi APPROVED,
 * confirmación COD o fallback /gracias), best-effort total: nunca interrumpe
 * ni retrasa la saga.
 *
 * Mismo destinatario que las alertas operativas (setting ALERT_EMAIL) y Reply-To
 * = email del cliente, para responderle directo (criterio support-ticket-internal).
 * Lleva el wa.me del cliente pre-armado para escribirle sin abrir el admin.
 */

import { renderEmailLayout, escapeHtml, ctaButton, getSiteUrl } from "../layout";
import { formatCOP, formatCityDept } from "@/lib/format";

export type OrderAdminNotificationData = {
  orderId: string;
  orderNumber: string;
  customerName: string;
  /** Teléfono del checkout tal cual (se sanitiza a dígitos para wa.me). */
  customerPhone: string;
  customerEmail: string;
  city: string;
  department: string;
  paymentMethod: "WOMPI" | "COD";
  total: number; // centavos COP
  items: Array<{
    name: string;
    qty: number;
    lineTotal: number; // centavos COP
  }>;
};

export async function orderAdminNotificationEmail(data: OrderAdminNotificationData) {
  const siteUrl = await getSiteUrl();
  const adminUrl = `${siteUrl}/admin/pedidos/${data.orderNumber}`;
  const waDigits = data.customerPhone.replace(/\D/g, "");
  const waText = encodeURIComponent(
    `Hola ${data.customerName}, te escribo de Lucams por tu pedido ${data.orderNumber}. `,
  );
  const customerWaUrl = waDigits ? `https://wa.me/${waDigits}?text=${waText}` : null;
  const location = formatCityDept(data.city, data.department);
  const paymentLabel = data.paymentMethod === "COD" ? "Contraentrega" : "Wompi (online)";

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
<h1 style="margin:0 0 12px 0;font-size:20px;">📦 Nuevo pedido ${escapeHtml(data.orderNumber)}</h1>
<table cellpadding="6" cellspacing="0" border="0" style="font-size:14px;width:100%;border-collapse:collapse;">
  <tr><td style="color:#3D2E5C;opacity:0.6;width:110px;">Cliente:</td><td><strong>${escapeHtml(data.customerName)}</strong></td></tr>
  <tr><td style="color:#3D2E5C;opacity:0.6;">Teléfono:</td><td><a href="tel:+${waDigits}" style="color:#3D2E5C;">${escapeHtml(data.customerPhone)}</a></td></tr>
  ${
    customerWaUrl
      ? `<tr><td style="color:#3D2E5C;opacity:0.6;">WhatsApp:</td><td><a href="${customerWaUrl}" style="display:inline-block;background:#25D366;color:#ffffff;text-decoration:none;font-weight:700;font-size:12px;padding:4px 10px;border-radius:6px;">✆ Abrir chat</a></td></tr>`
      : ""
  }
  <tr><td style="color:#3D2E5C;opacity:0.6;">Email:</td><td><a href="mailto:${escapeHtml(data.customerEmail)}" style="color:#7C6AAD;">${escapeHtml(data.customerEmail)}</a></td></tr>
  <tr><td style="color:#3D2E5C;opacity:0.6;">Ciudad:</td><td>${escapeHtml(location)}</td></tr>
  <tr><td style="color:#3D2E5C;opacity:0.6;">Pago:</td><td>${paymentLabel}</td></tr>
</table>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:16px 0 0 0;border-collapse:collapse;">
  ${itemsRows}
  <tr>
    <td style="padding:12px 0 4px 0;color:#3D2E5C;font-size:16px;font-weight:700;border-top:2px solid #3D2E5C;">Total</td>
    <td style="padding:12px 0 4px 0;text-align:right;color:#3D2E5C;font-size:16px;font-weight:700;border-top:2px solid #3D2E5C;">${formatCOP(data.total)}</td>
  </tr>
</table>
${ctaButton(adminUrl, "Ver pedido en el admin →")}

<p style="font-size:13px;color:#3D2E5C;opacity:0.75;margin-top:14px;">Este aviso sale cuando el pago queda confirmado (o se confirma una contraentrega).${
    customerWaUrl
      ? ` Si necesitas algo del cliente, <a href="${customerWaUrl}" style="color:#7C6AAD;">escríbele por WhatsApp</a>.`
      : ""
  }</p>
`;

  const text = `Nuevo pedido ${data.orderNumber}

Cliente: ${data.customerName}
Teléfono: ${data.customerPhone}
Email: ${data.customerEmail}
Ciudad: ${location}
Pago: ${paymentLabel}

Items:
${data.items.map((it) => `  - ${it.name} ×${it.qty} → ${formatCOP(it.lineTotal)}`).join("\n")}

Total: ${formatCOP(data.total)}

Ver en el admin: ${adminUrl}${customerWaUrl ? `\nEscribirle por WhatsApp: ${customerWaUrl}` : ""}`;

  return {
    subject: `Nuevo pedido ${data.orderNumber} — ${data.customerName} (${formatCOP(data.total)})`,
    html: await renderEmailLayout({
      preview: `${data.customerName} · ${formatCOP(data.total)} · ${location}`,
      bodyHtml,
    }),
    text,
    replyTo: data.customerEmail,
  };
}
