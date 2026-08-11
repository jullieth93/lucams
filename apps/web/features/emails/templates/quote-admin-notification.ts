/*
 * Template: notificación INTERNA al admin cuando nace una cotización.
 *
 * Problema que cubre (Etapa 1, modo catálogo): la venta se cierra cuando el
 * cliente pulsa "Enviar por WhatsApp" en la página de confirmación, pero si
 * crea la cotización y NO pulsa el botón, el negocio nunca se enteraba — la
 * Quote solo era visible entrando a /admin/cotizaciones. Este correo avisa
 * apenas se crea la cotización, haya o no mensaje de WhatsApp de por medio.
 *
 * Se dispara fire-and-forget DESPUÉS de crear la Quote (features/quotes/
 * actions.ts vía after() de next/server → sendQuoteAdminNotification en
 * features/quotes/emails.ts): un fallo de Resend NUNCA rompe ni retrasa la
 * creación, porque la cotización es el único embudo de la Etapa 1 y este
 * email es solo un aviso, no parte del flujo.
 *
 * Lleva TODO el contexto para responder sin abrir el admin (ítems, total,
 * notas, link wa.me del cliente) y Reply-To = email del cliente cuando lo
 * dejó — mismo criterio que support-ticket-internal.
 */

import { renderEmailLayout, escapeHtml, ctaButton, getSiteUrl } from "../layout";
import { formatCOP, formatCityDept } from "@/lib/format";

export type QuoteAdminNotificationData = {
  quoteId: string;
  quoteNumber: string;
  customerName: string;
  /** Normalizado a 10 dígitos CO por el schema (wa.me exige prefijo 57). */
  customerWhatsapp: string;
  customerEmail: string | null;
  city: string;
  department: string;
  notes: string | null;
  total: number; // centavos COP
  items: Array<{
    productName: string;
    variantName: string | null;
    quantity: number;
    unitPrice: number; // centavos COP
  }>;
};

export async function quoteAdminNotificationEmail(data: QuoteAdminNotificationData) {
  const siteUrl = await getSiteUrl();
  const adminUrl = `${siteUrl}/admin/cotizaciones/${data.quoteId}`;
  const customerWaUrl = `https://wa.me/57${data.customerWhatsapp}`;
  const location = formatCityDept(data.city, data.department);

  const itemLabel = (it: QuoteAdminNotificationData["items"][number]) => {
    // La variante "Default" es interna (productos sin opciones) — la UI del
    // storefront y el mensaje de WhatsApp tampoco la muestran.
    const variant = it.variantName && it.variantName !== "Default" ? ` (${it.variantName})` : "";
    return `${it.productName}${variant}`;
  };

  const itemsRows = data.items
    .map(
      (it) => `
<tr>
  <td style="padding:8px 0;border-bottom:1px solid #f0e7e0;color:#3D2E5C;">
    ${escapeHtml(itemLabel(it))} <span style="opacity:0.55;">×${it.quantity}</span>
  </td>
  <td style="padding:8px 0;border-bottom:1px solid #f0e7e0;text-align:right;color:#3D2E5C;font-weight:600;">${formatCOP(it.unitPrice * it.quantity)}</td>
</tr>`,
    )
    .join("");

  const notesBlock = data.notes
    ? `
<p style="margin:14px 0 0 0;font-size:14px;color:#3D2E5C;"><strong>Notas del cliente:</strong></p>
<p style="background:#FFF8F0;padding:12px 14px;border-radius:8px;font-size:14px;white-space:pre-wrap;line-height:1.6;margin:6px 0 0 0;">${escapeHtml(data.notes)}</p>`
    : "";

  const bodyHtml = `
<h1 style="margin:0 0 12px 0;font-size:20px;">🧾 Nueva cotización ${escapeHtml(data.quoteNumber)}</h1>
<table cellpadding="6" cellspacing="0" border="0" style="font-size:14px;width:100%;border-collapse:collapse;">
  <tr><td style="color:#3D2E5C;opacity:0.6;width:110px;">Cliente:</td><td><strong>${escapeHtml(data.customerName)}</strong></td></tr>
  <tr><td style="color:#3D2E5C;opacity:0.6;">WhatsApp:</td><td><a href="${customerWaUrl}" style="color:#7C6AAD;">${escapeHtml(data.customerWhatsapp)}</a></td></tr>
  <tr><td style="color:#3D2E5C;opacity:0.6;">Email:</td><td>${
    data.customerEmail
      ? `<a href="mailto:${escapeHtml(data.customerEmail)}" style="color:#7C6AAD;">${escapeHtml(data.customerEmail)}</a>`
      : "—"
  }</td></tr>
  <tr><td style="color:#3D2E5C;opacity:0.6;">Ciudad:</td><td>${escapeHtml(location)}</td></tr>
</table>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:16px 0 0 0;border-collapse:collapse;">
  ${itemsRows}
  <tr>
    <td style="padding:12px 0 4px 0;color:#3D2E5C;font-size:16px;font-weight:700;border-top:2px solid #3D2E5C;">Total</td>
    <td style="padding:12px 0 4px 0;text-align:right;color:#3D2E5C;font-size:16px;font-weight:700;border-top:2px solid #3D2E5C;">${formatCOP(data.total)}</td>
  </tr>
</table>
${notesBlock}
${ctaButton(adminUrl, "Ver en el admin →")}

<p style="font-size:13px;color:#3D2E5C;opacity:0.75;margin-top:14px;">Este aviso sale apenas se crea la cotización — si el cliente no te escribe por WhatsApp, escríbele tú primero: <a href="${customerWaUrl}" style="color:#7C6AAD;">abrir chat</a>.</p>
`;

  const text = `Nueva cotización ${data.quoteNumber}

Cliente: ${data.customerName}
WhatsApp: ${data.customerWhatsapp} (${customerWaUrl})
Email: ${data.customerEmail ?? "—"}
Ciudad: ${location}

Items:
${data.items.map((it) => `  - ${itemLabel(it)} ×${it.quantity} → ${formatCOP(it.unitPrice * it.quantity)}`).join("\n")}

Total: ${formatCOP(data.total)}
${data.notes ? `\nNotas del cliente:\n${data.notes}\n` : ""}
Ver en el admin: ${adminUrl}
Escribirle por WhatsApp: ${customerWaUrl}`;

  return {
    subject: `Nueva cotización ${data.quoteNumber} — ${data.customerName} (${data.city})`,
    html: await renderEmailLayout({
      preview: `${data.customerName} · ${formatCOP(data.total)} · ${location}`,
      bodyHtml,
    }),
    text,
    replyTo: data.customerEmail ?? undefined,
  };
}
