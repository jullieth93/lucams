/*
 * Template: reembolso procesado (Bloque F2). Se envía cuando un admin marca la
 * orden como REFUNDED. El movimiento de dinero en Wompi es manual; este correo
 * confirma al cliente que su reembolso fue emitido.
 */

import { renderEmailLayout } from "../layout";
import { formatCOP } from "@/lib/format";

export type RefundIssuedData = {
  orderNumber: string;
  customerName: string;
  amount: number; // COP centavos
  reason?: string | null;
};

export async function refundIssuedEmail(data: RefundIssuedData) {
  const amount = formatCOP(data.amount);
  const reasonHtml = data.reason
    ? `<p style="font-size:14px;color:#3D2E5C;opacity:0.8;">Motivo: ${escapeHtml(data.reason)}</p>`
    : "";
  const reasonText = data.reason ? `\nMotivo: ${data.reason}\n` : "";

  const bodyHtml = `
<h1 style="margin:0 0 12px 0;font-size:22px;color:#3D2E5C;">Procesamos tu reembolso 💜</h1>
<p>Hola ${escapeHtml(data.customerName)}, ya emitimos el reembolso de tu pedido <strong>${escapeHtml(data.orderNumber)}</strong>.</p>
<p style="font-size:18px;color:#3D2E5C;"><strong>Monto reembolsado: ${amount}</strong></p>
${reasonHtml}
<p style="margin-top:14px;">El dinero puede tardar <strong>unos días hábiles</strong> en reflejarse en tu medio de pago, según tu banco. Si pagaste contraentrega, nos pondremos en contacto para coordinar la devolución.</p>
<p style="font-size:13px;color:#3D2E5C;opacity:0.65;margin-top:18px;">¿Alguna duda? Respóndenos este correo o escríbenos por WhatsApp. Estamos para ayudarte.</p>
`;

  const text = `Procesamos tu reembolso

Hola ${data.customerName},

Ya emitimos el reembolso de tu pedido ${data.orderNumber}.

Monto reembolsado: ${amount}
${reasonText}
El dinero puede tardar unos días hábiles en reflejarse en tu medio de pago, según tu banco. Si pagaste contraentrega, te contactaremos para coordinar la devolución.

¿Alguna duda? Respóndenos este correo o escríbenos por WhatsApp.`;

  return {
    subject: `Reembolso procesado — pedido ${data.orderNumber} 💜`,
    html: await renderEmailLayout({
      preview: `Reembolsamos ${amount} de tu pedido ${data.orderNumber}.`,
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
