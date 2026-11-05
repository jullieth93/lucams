/*
 * Template: Aviso INTERNO al equipo comercial cuando nace una oportunidad en /empresas-y-eventos.
 *
 * Incluye enlace directo al detalle en /admin/oportunidades/[id], link wa.me al cliente
 * y Reply-To al correo del solicitante para responder en 1 clic.
 */

import { renderEmailLayout, escapeHtml, ctaButton, getSiteUrl } from "../layout";
import { formatCityDept } from "@/lib/format";
import { customerWaLink } from "@/lib/wa";

export type B2bInquiryAdminNotificationData = {
  opportunityId: string;
  opportunityNumber: string;
  contactName: string;
  contactEmail: string;
  contactWhatsapp: string;
  organizationName: string | null;
  nit: string | null;
  eventLabel: string;
  expectedUnits: number;
  city: string;
  department: string | null;
  eventDateLabel: string | null;
  notes: string;
};

export async function b2bInquiryAdminNotificationEmail(data: B2bInquiryAdminNotificationData) {
  const siteUrl = await getSiteUrl();
  const adminUrl = `${siteUrl}/admin/oportunidades/${data.opportunityId}`;
  const location = data.department ? formatCityDept(data.city, data.department) : data.city;
  const customerWaUrl = customerWaLink(
    data.contactWhatsapp,
    `Hola ${data.contactName}, te escribo de Lucams Shop sobre tu solicitud ${data.opportunityNumber}. `,
  );

  const orgRow = data.organizationName
    ? `<tr><td style="color:#3D2E5C;opacity:0.6;padding:5px 0;">Empresa:</td><td style="padding:5px 0;"><strong>${escapeHtml(data.organizationName)}</strong>${data.nit ? ` · NIT ${escapeHtml(data.nit)}` : ""}</td></tr>`
    : "";
  const dateRow = data.eventDateLabel
    ? `<tr><td style="color:#3D2E5C;opacity:0.6;padding:5px 0;">Fecha ideal:</td><td style="padding:5px 0;">${escapeHtml(data.eventDateLabel)}</td></tr>`
    : "";

  const bodyHtml = `
<h1 style="margin:0 0 12px 0;font-size:20px;color:#3D2E5C;">🏢 Nueva oportunidad ${escapeHtml(data.opportunityNumber)}</h1>
<table cellpadding="0" cellspacing="0" border="0" style="font-size:14px;width:100%;border-collapse:collapse;">
  <tr><td style="color:#3D2E5C;opacity:0.6;padding:5px 0;width:120px;">Contacto:</td><td style="padding:5px 0;"><strong>${escapeHtml(data.contactName)}</strong></td></tr>
  ${orgRow}
  <tr><td style="color:#3D2E5C;opacity:0.6;padding:5px 0;">WhatsApp:</td><td style="padding:5px 0;">${
    customerWaUrl
      ? `<a href="${customerWaUrl}" style="color:#7C6AAD;font-weight:600;">${escapeHtml(data.contactWhatsapp)}</a>`
      : escapeHtml(data.contactWhatsapp)
  }</td></tr>
  <tr><td style="color:#3D2E5C;opacity:0.6;padding:5px 0;">Correo:</td><td style="padding:5px 0;"><a href="mailto:${escapeHtml(data.contactEmail)}" style="color:#7C6AAD;">${escapeHtml(data.contactEmail)}</a></td></tr>
  <tr><td style="color:#3D2E5C;opacity:0.6;padding:5px 0;">Proyecto:</td><td style="padding:5px 0;">${escapeHtml(data.eventLabel)} · <strong>${data.expectedUnits} uds.</strong></td></tr>
  <tr><td style="color:#3D2E5C;opacity:0.6;padding:5px 0;">Ciudad:</td><td style="padding:5px 0;">${escapeHtml(location)}</td></tr>
  ${dateRow}
</table>

<p style="margin:14px 0 0 0;font-size:14px;color:#3D2E5C;"><strong>Requerimiento del cliente:</strong></p>
<p style="background:#FFF8F0;padding:12px 14px;border-radius:8px;font-size:14px;white-space:pre-wrap;line-height:1.6;margin:6px 0 0 0;">${escapeHtml(data.notes)}</p>

${ctaButton(adminUrl, "Gestionar oportunidad en el admin →")}

<p style="font-size:13px;color:#3D2E5C;opacity:0.75;margin-top:14px;">También quedó agendada una tarea en <strong>/admin/hoy</strong>${
    customerWaUrl
      ? ` y puedes <a href="${customerWaUrl}" style="color:#7C6AAD;">abrir el chat de WhatsApp del cliente aquí</a>`
      : ""
  }.</p>
`;

  const text = `Nueva oportunidad ${data.opportunityNumber}

Contacto: ${data.contactName}
${data.organizationName ? `Empresa: ${data.organizationName}${data.nit ? ` · NIT ${data.nit}` : ""}\n` : ""}WhatsApp: ${data.contactWhatsapp}${customerWaUrl ? ` (${customerWaUrl})` : ""}
Correo: ${data.contactEmail}
Proyecto: ${data.eventLabel} · ${data.expectedUnits} unidades
Ciudad: ${location}${data.eventDateLabel ? `\nFecha ideal: ${data.eventDateLabel}` : ""}

Requerimiento del cliente:
${data.notes}

Gestionar en el admin: ${adminUrl}`;

  const titleWho = data.organizationName || data.contactName;
  return {
    subject: `Nueva oportunidad ${data.opportunityNumber} — ${titleWho} (${data.expectedUnits} uds.)`,
    html: await renderEmailLayout({
      preview: `${titleWho} · ${data.eventLabel} · ${data.expectedUnits} unidades · ${location}`,
      bodyHtml,
    }),
    text,
    replyTo: data.contactEmail,
  };
}
