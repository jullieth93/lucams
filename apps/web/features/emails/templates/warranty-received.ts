/*
 * Template: confirmación al cliente de que recibimos su reclamo de garantía (Ley 1480).
 */

import { renderEmailLayout, escapeHtml } from "../layout";

export type WarrantyReceivedData = {
  customerName: string;
  claimId: string;
  orderNumber: string;
  productName: string;
  description: string;
};

export async function warrantyReceivedEmail(data: WarrantyReceivedData) {
  const short = data.claimId.slice(0, 8).toUpperCase();
  const bodyHtml = `
<h1 style="margin:0 0 12px 0;font-size:22px;color:#3D2E5C;">Recibimos tu reclamo de garantía 🛡️</h1>
<p>Hola <strong>${escapeHtml(data.customerName)}</strong>,</p>
<p>Registramos tu reclamo de garantía para <strong>${escapeHtml(data.productName)}</strong> del pedido <strong>${escapeHtml(data.orderNumber)}</strong>. Referencia <strong style="font-family:monospace;background:#FFF8F0;padding:2px 6px;border-radius:4px;">#${short}</strong>.</p>
<p style="background:#FFF8F0;padding:14px 16px;border-radius:8px;font-size:14px;">
  <strong>Lo que nos contaste:</strong><br>
  <span style="white-space:pre-wrap;color:#3D2E5C;opacity:0.85;">${escapeHtml(data.description)}</span>
</p>
<p>Vamos a revisarlo y te escribimos con la solución que corresponda (reparación, cambio o devolución del dinero).</p>
<p>Un abrazo,<br>El equipo de Lucams_shop</p>
`;
  const text = `Recibimos tu reclamo de garantía

Hola ${data.customerName},

Registramos tu reclamo de garantía para ${data.productName} (pedido ${data.orderNumber}). Referencia #${short}.

Lo que nos contaste:
${data.description}

Lo revisamos y te escribimos con la solución.

Un abrazo,
El equipo de Lucams_shop`;

  return {
    subject: `Recibimos tu garantía — #${short}`,
    html: await renderEmailLayout({
      preview: `Reclamo de garantía #${short} registrado.`,
      bodyHtml,
    }),
    text,
  };
}
