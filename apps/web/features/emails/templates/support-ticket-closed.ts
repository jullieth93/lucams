/*
 * Template: aviso de CIERRE de ticket de soporte al cliente (N-14, 2026-09-11).
 *
 * Se envía cuando el admin marca el ticket como CLOSED en /admin/soporte (la
 * emisión vive en features/support/admin-service.setSupportTicketStatus, solo
 * en la transición real → CLOSED: no en reopen, no si ya estaba CLOSED).
 *
 * Cierra el ciclo que abre support-ticket-received ("te respondemos por correo"):
 * el cliente no tiene bandeja en /mi-cuenta, así que este correo es la señal de
 * que su solicitud quedó atendida. Copy honesto: NO afirma que ya leyó la
 * respuesta humana (esa sale por mailto desde el correo de la tienda), solo que
 * el ticket fue atendido y cerrado.
 *
 * Transaccional: SIN link de baja ni List-Unsubscribe. Reply-To = CONTACT_EMAIL
 * (buzón de soporte) para que "responde a este correo" aterrice donde el equipo
 * sí lee — mismo criterio que los demás correos del flujo de soporte.
 */

import { renderEmailLayout, escapeHtml } from "../layout";
import { getSettingValue } from "@/lib/cms";
import { SUBJECT_LABELS } from "@/features/support/schemas";

export type SupportTicketClosedData = {
  customerName: string;
  ticketId: string;
  subject: keyof typeof SUBJECT_LABELS;
};

export async function supportTicketClosedEmail(data: SupportTicketClosedData) {
  const ticketShort = data.ticketId.slice(0, 8).toUpperCase();
  const replyTo = await getSettingValue("CONTACT_EMAIL", "hola@lucamsshop.com");
  const bodyHtml = `
<h1 style="margin:0 0 12px 0;font-size:22px;color:#3D2E5C;">Atendimos tu solicitud ✅</h1>
<p>Hola <strong>${escapeHtml(data.customerName)}</strong>,</p>
<p>Tu ticket <strong style="font-family:monospace;background:#FFF8F0;padding:2px 6px;border-radius:4px;">#${ticketShort}</strong> (<strong>${escapeHtml(SUBJECT_LABELS[data.subject])}</strong>) fue atendido y quedó cerrado.</p>
<p>Si necesitas algo más sobre este tema, <strong>responde a este correo</strong> y te seguimos ayudando — no hace falta abrir otro ticket.</p>
<p>Gracias por escribirnos.</p>
<p>Un abrazo,<br>El equipo de Lucams_shop</p>
`;

  const text = `Atendimos tu solicitud

Hola ${data.customerName},

Tu ticket #${ticketShort} (${SUBJECT_LABELS[data.subject]}) fue atendido y quedó cerrado.

Si necesitas algo más sobre este tema, responde a este correo y te seguimos ayudando — no hace falta abrir otro ticket.

Gracias por escribirnos.

Un abrazo,
El equipo de Lucams_shop`;

  return {
    subject: `Atendimos tu solicitud — Ticket #${ticketShort}`,
    html: await renderEmailLayout({
      preview: `Ticket #${ticketShort} atendido y cerrado. Si necesitas algo más, responde a este correo.`,
      bodyHtml,
    }),
    text,
    replyTo,
  };
}
