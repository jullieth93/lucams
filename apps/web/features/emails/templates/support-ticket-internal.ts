/*
 * Template: Notificación INTERNA de ticket nuevo a hola@lucamsshop.co.
 *
 * Diferente del template "received" (que va al cliente). Este lleva
 * todo el contexto: nombre, email, asunto, mensaje, IP, ticket id.
 * Reply-To = email del cliente para que Lucy le responda directo.
 */

import { renderEmailLayout, escapeHtml } from "../layout";
import { SUBJECT_LABELS } from "@/features/support/schemas";

export type SupportTicketInternalData = {
  ticketId: string;
  customerName: string;
  customerEmail: string;
  subject: keyof typeof SUBJECT_LABELS;
  message: string;
  ip?: string | null;
};

export async function supportTicketInternalEmail(data: SupportTicketInternalData) {
  const ticketShort = data.ticketId.slice(0, 8).toUpperCase();
  const bodyHtml = `
<h1 style="margin:0 0 12px 0;font-size:20px;">🎫 Nuevo ticket #${ticketShort}</h1>
<table cellpadding="6" cellspacing="0" border="0" style="font-size:14px;width:100%;border-collapse:collapse;">
  <tr><td style="color:#3D2E5C;opacity:0.6;width:120px;">De:</td><td><strong>${escapeHtml(data.customerName)}</strong> &lt;<a href="mailto:${escapeHtml(data.customerEmail)}" style="color:#7C6AAD;">${escapeHtml(data.customerEmail)}</a>&gt;</td></tr>
  <tr><td style="color:#3D2E5C;opacity:0.6;">Asunto:</td><td>${escapeHtml(SUBJECT_LABELS[data.subject])}</td></tr>
  <tr><td style="color:#3D2E5C;opacity:0.6;">IP:</td><td style="font-family:monospace;font-size:12px;">${escapeHtml(data.ip ?? "—")}</td></tr>
  <tr><td style="color:#3D2E5C;opacity:0.6;">Ticket ID:</td><td style="font-family:monospace;font-size:12px;">${escapeHtml(data.ticketId)}</td></tr>
</table>
<hr style="border:none;border-top:1px solid #F0EAF7;margin:18px 0;">
<p style="background:#FFF8F0;padding:14px 16px;border-radius:8px;font-size:14px;white-space:pre-wrap;line-height:1.6;">${escapeHtml(data.message)}</p>
<p style="margin-top:18px;font-size:13px;color:#3D2E5C;opacity:0.75;">Respondé directo (Reply-To está configurado al email del cliente).</p>
`;

  const text = `Nuevo ticket #${ticketShort}

De: ${data.customerName} <${data.customerEmail}>
Asunto: ${SUBJECT_LABELS[data.subject]}
IP: ${data.ip ?? "—"}
Ticket ID: ${data.ticketId}

Mensaje:
${data.message}`;

  return {
    subject: `[Soporte] ${SUBJECT_LABELS[data.subject]} — ${data.customerName} (#${ticketShort})`,
    html: await renderEmailLayout({ preview: `Nuevo ticket de ${data.customerName}`, bodyHtml }),
    text,
    replyTo: data.customerEmail,
  };
}
