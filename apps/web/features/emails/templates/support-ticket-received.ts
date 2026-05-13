/*
 * Template: Confirmación de recepción de ticket de soporte.
 *
 * Se envía al cliente cuando llena el form /contacto. NO va a
 * hola@lucamsshop.co (eso es otro template aparte).
 */

import { renderEmailLayout, escapeHtml } from "../layout";
import { SUBJECT_LABELS } from "@/features/support/schemas";

export type SupportTicketReceivedData = {
  customerName: string;
  ticketId: string;
  subject: keyof typeof SUBJECT_LABELS;
  message: string;
};

export async function supportTicketReceivedEmail(data: SupportTicketReceivedData) {
  const ticketShort = data.ticketId.slice(0, 8).toUpperCase();
  const bodyHtml = `
<h1 style="margin:0 0 12px 0;font-size:22px;color:#3D2E5C;">¡Recibimos tu mensaje! ✨</h1>
<p>Hola <strong>${escapeHtml(data.customerName)}</strong>,</p>
<p>Gracias por escribirnos. Tu ticket es <strong style="font-family:monospace;background:#FFF8F0;padding:2px 6px;border-radius:4px;">#${ticketShort}</strong> y lo vamos a responder en menos de <strong>24 horas hábiles</strong>.</p>
<p style="background:#FFF8F0;padding:14px 16px;border-radius:8px;font-size:14px;">
  <strong>Asunto:</strong> ${escapeHtml(SUBJECT_LABELS[data.subject])}<br>
  <strong>Tu mensaje:</strong><br>
  <span style="white-space:pre-wrap;color:#3D2E5C;opacity:0.85;">${escapeHtml(data.message)}</span>
</p>
<p>Si es urgente, también nos podés escribir por WhatsApp.</p>
<p>Un abrazo,<br>El equipo de Lucams_shop</p>
`;

  const text = `¡Recibimos tu mensaje!

Hola ${data.customerName},

Gracias por escribirnos. Tu ticket es #${ticketShort} y lo respondemos en menos de 24 horas hábiles.

Asunto: ${SUBJECT_LABELS[data.subject]}
Tu mensaje:
${data.message}

Si es urgente, también nos podés escribir por WhatsApp.

Un abrazo,
El equipo de Lucams_shop`;

  return {
    subject: `Recibimos tu mensaje — Ticket #${ticketShort}`,
    html: await renderEmailLayout({
      preview: `Ticket #${ticketShort} registrado. Te respondemos en menos de 24h.`,
      bodyHtml,
    }),
    text,
  };
}
