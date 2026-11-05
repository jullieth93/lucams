/*
 * Template: Confirmación al cliente al enviar una solicitud consultiva en /empresas-y-eventos.
 *
 * Envía al correo ingresado en el formulario el radicado OP-XXXXXX, el resumen de su
 * requerimiento y el plazo de respuesta comercial (< 24 horas hábiles).
 */

import { renderEmailLayout, escapeHtml, ctaButton, getSiteUrl } from "../layout";
import { formatCityDept } from "@/lib/format";

export type B2bInquiryReceivedData = {
  opportunityNumber: string;
  contactName: string;
  organizationName: string | null;
  eventLabel: string;
  expectedUnits: number;
  city: string;
  department: string | null;
  eventDateLabel: string | null;
  notes: string;
};

export async function b2bInquiryReceivedEmail(data: B2bInquiryReceivedData) {
  const siteUrl = await getSiteUrl();
  const catalogUrl = `${siteUrl}/productos`;
  const location = data.department ? formatCityDept(data.city, data.department) : data.city;

  const orgLineHtml = data.organizationName
    ? `<tr><td style="color:#3D2E5C;opacity:0.65;padding:4px 0;width:130px;">Empresa / evento:</td><td style="padding:4px 0;"><strong>${escapeHtml(data.organizationName)}</strong></td></tr>`
    : "";
  const dateLineHtml = data.eventDateLabel
    ? `<tr><td style="color:#3D2E5C;opacity:0.65;padding:4px 0;">Fecha estimada:</td><td style="padding:4px 0;">${escapeHtml(data.eventDateLabel)}</td></tr>`
    : "";

  const bodyHtml = `
<h1 style="margin:0 0 12px 0;font-size:22px;color:#3D2E5C;">¡Recibimos tu solicitud ${escapeHtml(data.opportunityNumber)}! ✨</h1>
<p>Hola <strong>${escapeHtml(data.contactName)}</strong>,</p>
<p>Gracias por pensar en Lucams Shop para tu proyecto o evento. Registramos tu solicitud con el radicado <strong style="font-family:monospace;background:#FFF8F0;padding:2px 6px;border-radius:4px;">${escapeHtml(data.opportunityNumber)}</strong> y nuestro equipo comercial te responderá por WhatsApp o correo en menos de <strong>24 horas hábiles</strong> con una propuesta a medida.</p>

<div style="background:#FFF8F0;padding:14px 16px;border-radius:10px;margin:16px 0;">
  <table cellpadding="0" cellspacing="0" border="0" style="font-size:14px;width:100%;border-collapse:collapse;">
    ${orgLineHtml}
    <tr><td style="color:#3D2E5C;opacity:0.65;padding:4px 0;width:130px;">Tipo de proyecto:</td><td style="padding:4px 0;">${escapeHtml(data.eventLabel)}</td></tr>
    <tr><td style="color:#3D2E5C;opacity:0.65;padding:4px 0;">Cantidad estimada:</td><td style="padding:4px 0;"><strong>${data.expectedUnits} unidades</strong></td></tr>
    <tr><td style="color:#3D2E5C;opacity:0.65;padding:4px 0;">Ciudad de entrega:</td><td style="padding:4px 0;">${escapeHtml(location)}</td></tr>
    ${dateLineHtml}
  </table>
  <p style="margin:10px 0 0 0;padding-top:10px;border-top:1px solid #eadfd6;font-size:13px;color:#3D2E5C;">
    <strong>Detalle enviado:</strong><br>
    <span style="white-space:pre-wrap;opacity:0.85;">${escapeHtml(data.notes)}</span>
  </p>
</div>

${ctaButton(catalogUrl, "Ver ideas en el catálogo →")}

<p style="font-size:14px;">Si quieres compartirnos tu logo o referencias visuales antes de nuestra llamada, puedes responder directamente a este correo indicando el radicado <strong>${escapeHtml(data.opportunityNumber)}</strong>.</p>
<p>Un abrazo,<br>El equipo de Lucams Shop</p>
`;

  const text = `¡Recibimos tu solicitud ${data.opportunityNumber}!

Hola ${data.contactName},

Gracias por pensar en Lucams Shop para tu proyecto o evento. Registramos tu solicitud con el radicado ${data.opportunityNumber} y te responderemos por WhatsApp o correo en menos de 24 horas hábiles con una propuesta a medida.

Resumen de tu solicitud:
${data.organizationName ? `- Empresa / evento: ${data.organizationName}\n` : ""}- Tipo de proyecto: ${data.eventLabel}
- Cantidad estimada: ${data.expectedUnits} unidades
- Ciudad de entrega: ${location}${data.eventDateLabel ? `\n- Fecha estimada: ${data.eventDateLabel}` : ""}

Detalle enviado:
${data.notes}

Explorar catálogo: ${catalogUrl}

Un abrazo,
El equipo de Lucams Shop`;

  return {
    subject: `Recibimos tu solicitud ${data.opportunityNumber} — Empresas y Eventos`,
    html: await renderEmailLayout({
      preview: `Radicado ${data.opportunityNumber} (${data.expectedUnits} unidades). Te respondemos en menos de 24h hábiles.`,
      bodyHtml,
    }),
    text,
  };
}
