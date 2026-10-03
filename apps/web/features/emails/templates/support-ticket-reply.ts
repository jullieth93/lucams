/*
 * Template: RESPUESTA del equipo a un ticket de soporte (hilo SupportTicketMessage).
 *
 * Se envía cuando el admin escribe una respuesta pública desde /admin/soporte/[id]
 * (la emisión vive en features/support/admin-service.addTicketMessage, solo para
 * mensajes NO internos). Cierra el hueco operativo de la respuesta "por fuera"
 * (mailto): la respuesta queda en el hilo, llega al correo del cliente y queda
 * visible en /mi-cuenta/soporte.
 *
 * Idempotencia: idempotencyKey `support:reply:<messageId>` en el sender — un
 * doble submit o un retry no duplica el correo (el mensaje ya existe en DB).
 *
 * Transaccional: SIN link de baja ni List-Unsubscribe. Reply-To = CONTACT_EMAIL
 * (buzón de soporte) para que "responder a este correo" aterrice donde el equipo
 * sí lee — mismo criterio que los demás correos del flujo de soporte.
 */

import { renderEmailLayout, escapeHtml } from "../layout";
import { getSettingValue } from "@/lib/cms";
import { SUBJECT_LABELS } from "@/features/support/schemas";

export type SupportTicketReplyData = {
  customerName: string;
  ticketId: string;
  subject: keyof typeof SUBJECT_LABELS;
  /** Texto de la respuesta del equipo (se escapa; saltos de línea → <br>). */
  replyBody: string;
};

export async function supportTicketReplyEmail(data: SupportTicketReplyData) {
  const ticketShort = data.ticketId.slice(0, 8).toUpperCase();
  const replyTo = await getSettingValue("CONTACT_EMAIL", "hola@lucamsshop.com");
  const replyHtml = escapeHtml(data.replyBody).replace(/\n/g, "<br>");
  const bodyHtml = `
<h1 style="margin:0 0 12px 0;font-size:22px;color:#3D2E5C;">Tenemos respuesta para ti 💌</h1>
<p>Hola <strong>${escapeHtml(data.customerName)}</strong>,</p>
<p>Sobre tu ticket <strong style="font-family:monospace;background:#FFF8F0;padding:2px 6px;border-radius:4px;">#${ticketShort}</strong> (<strong>${escapeHtml(SUBJECT_LABELS[data.subject])}</strong>):</p>
<div style="margin:12px 0;padding:14px 16px;background:#FFF8F0;border-left:4px solid #7C6AAD;border-radius:8px;">${replyHtml}</div>
<p>Si necesitas contarnos algo más sobre este tema, <strong>responde a este correo</strong> — no hace falta abrir otro ticket.</p>
<p>Un abrazo,<br>El equipo de Lucams_shop</p>
`;

  const text = `Tenemos respuesta para ti

Hola ${data.customerName},

Sobre tu ticket #${ticketShort} (${SUBJECT_LABELS[data.subject]}):

${data.replyBody}

Si necesitas contarnos algo más sobre este tema, responde a este correo — no hace falta abrir otro ticket.

Un abrazo,
El equipo de Lucams_shop`;

  return {
    subject: `Respuesta a tu solicitud — Ticket #${ticketShort}`,
    html: await renderEmailLayout({
      preview: `Respuesta del equipo a tu ticket #${ticketShort}.`,
      bodyHtml,
    }),
    text,
    replyTo,
  };
}
