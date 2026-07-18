/*
 * Template: retracto RECIBIDO (auditoría v3 · H7). Se envía al CREAR la solicitud (antes de que el
 * admin la apruebe) → acuse de recibo. Es la evidencia escrita de que el cliente ejerció el retracto
 * DENTRO de la ventana legal (Ley 1480 art. 47: 5 días hábiles desde la entrega). Ley 2439/2024: el
 * reembolso se hace en máx. 15 días calendario desde que el cliente ejerce el retracto.
 */

import { renderEmailLayout } from "../layout";
import { getSettingValue } from "@/lib/cms";

export type RetractReceivedData = {
  orderNumber: string;
  customerName: string;
  productName: string;
};

export async function retractReceivedEmail(data: RetractReceivedData) {
  const waNumber = await getSettingValue("WA_NUMBER", "573208873826");
  const waLink = `https://wa.me/${waNumber.replace(/\D/g, "")}`;

  const bodyHtml = `
<h1 style="margin:0 0 12px 0;font-size:22px;color:#3D2E5C;">Recibimos tu solicitud de retracto 📝</h1>
<p>Hola ${escapeHtml(data.customerName)}, registramos tu solicitud de retracto del producto
<strong>${escapeHtml(data.productName)}</strong> (pedido ${escapeHtml(data.orderNumber)}).</p>
<p style="margin-top:14px;">Este correo es tu <strong>comprobante</strong> de que ejerciste el retracto dentro del plazo legal.</p>
<p style="margin-top:14px;"><strong>¿Qué sigue?</strong></p>
<ol style="padding-left:18px;color:#3D2E5C;">
  <li>Revisamos tu solicitud y te confirmamos la <strong>aprobación</strong> muy pronto.</li>
  <li>Coordinamos contigo la devolución del producto — nosotros cubrimos el costo del envío.</li>
  <li>El reembolso se hace en <strong>máximo 15 días calendario</strong> desde hoy (Ley 2439/2024).</li>
</ol>
<p style="margin-top:14px;">¿Dudas? Escríbenos por WhatsApp:</p>
<p><a href="${waLink}" style="color:#C42B76;font-weight:600;">Hablar con nosotros →</a></p>
<p style="font-size:13px;color:#3D2E5C;opacity:0.65;margin-top:18px;">Recuerda que los productos personalizados (con tu foto o texto) no tienen derecho de retracto por ley.</p>
`;

  const text = `Recibimos tu solicitud de retracto

Hola ${data.customerName},

Registramos tu solicitud de retracto de "${data.productName}" (pedido ${data.orderNumber}). Este correo es tu comprobante de que ejerciste el retracto dentro del plazo legal.

Qué sigue:
1. Revisamos tu solicitud y te confirmamos la aprobación pronto.
2. Coordinamos la devolución del producto (nosotros cubrimos el envío).
3. Reembolso en máximo 15 días calendario desde hoy (Ley 2439/2024).

¿Dudas? Escríbenos por WhatsApp: ${waLink}`;

  return {
    subject: `Recibimos tu solicitud de retracto — pedido ${data.orderNumber} 📝`,
    html: await renderEmailLayout({
      preview: `Registramos tu retracto de "${data.productName}". Este correo es tu comprobante.`,
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
