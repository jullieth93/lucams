/*
 * Template: retracto RECHAZADO (auditoría v3 · #2). Se envía cuando el admin rechaza la solicitud
 * de retracto (p. ej. producto personalizado sin derecho de retracto por ley, fuera de plazo, o
 * producto usado/dañado). Antes de este fix el cliente NO recibía aviso: la solicitud pasaba a
 * REJECTED en silencio y solo se enteraba entrando a mi-cuenta. Email TRANSACCIONAL (respuesta a una
 * gestión que el cliente inició) → sin link de baja. Tono empático es-CO tuteo, con el motivo y una
 * salida por WhatsApp para dudas.
 */

import { renderEmailLayout } from "../layout";
import { getSettingValue } from "@/lib/cms";

export type RetractRejectedData = {
  orderNumber: string;
  customerName: string;
  productName: string;
  /** Motivo escrito por el admin (viene del panel → se escapa antes de incrustarlo en el HTML). */
  rejectionNote: string;
};

export async function retractRejectedEmail(data: RetractRejectedData) {
  const waNumber = await getSettingValue("WA_NUMBER", "573208873826");
  const waLink = `https://wa.me/${waNumber.replace(/\D/g, "")}`;

  const bodyHtml = `
<h1 style="margin:0 0 12px 0;font-size:22px;color:#3D2E5C;">Sobre tu solicitud de retracto</h1>
<p>Hola ${escapeHtml(data.customerName)}, revisamos con cuidado tu solicitud de retracto del producto
<strong>${escapeHtml(data.productName)}</strong> (pedido ${escapeHtml(data.orderNumber)}) y en esta
ocasión <strong>no podemos aprobarla</strong>.</p>
<div style="margin:14px 0;padding:12px 14px;background:#FFF3F7;border-left:4px solid #E85B9F;border-radius:8px;">
  <p style="margin:0;font-size:14px;color:#3D2E5C;"><strong>Motivo:</strong> ${escapeHtml(data.rejectionNote)}</p>
</div>
<p style="margin-top:14px;">Tu pedido sigue siendo tuyo — no cambia nada en tu compra. Si algo llegó
defectuoso o tienes cualquier duda sobre esta decisión, escríbenos y lo revisamos juntos. 💜</p>
<p><a href="${waLink}" style="color:#C42B76;font-weight:600;">Escríbenos por WhatsApp →</a></p>
<p style="font-size:13px;color:#3D2E5C;opacity:0.65;margin-top:18px;">Recuerda que los productos personalizados (con tu foto o texto) no tienen derecho de retracto por ley, y el plazo para ejercerlo es de 5 días hábiles desde la entrega.</p>
`;

  const text = `Sobre tu solicitud de retracto

Hola ${data.customerName},

Revisamos con cuidado tu solicitud de retracto de "${data.productName}" (pedido ${data.orderNumber}) y en esta ocasión no podemos aprobarla.

Motivo: ${data.rejectionNote}

Tu pedido sigue siendo tuyo — no cambia nada en tu compra. Si algo llegó defectuoso o tienes cualquier duda sobre esta decisión, escríbenos y lo revisamos juntos.

Escríbenos por WhatsApp: ${waLink}

Recuerda que los productos personalizados (con tu foto o texto) no tienen derecho de retracto por ley, y el plazo para ejercerlo es de 5 días hábiles desde la entrega.`;

  return {
    subject: `Sobre tu solicitud de retracto — pedido ${data.orderNumber}`,
    html: await renderEmailLayout({
      preview: `Revisamos tu solicitud de retracto del pedido ${data.orderNumber}.`,
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
