/*
 * Template: retracto aprobado (Bloque F3). Se envía cuando el admin aprueba la
 * solicitud → instrucciones de devolución. Ley 1480/2439: reembolso en máx. 15
 * días calendario desde la solicitud.
 */

import { renderEmailLayout } from "../layout";
import { getSettingValue } from "@/lib/cms";

export type RetractApprovedData = {
  orderNumber: string;
  customerName: string;
  productName: string;
};

export async function retractApprovedEmail(data: RetractApprovedData) {
  const waNumber = await getSettingValue("WA_NUMBER", "573208873826");
  const waLink = `https://wa.me/${waNumber.replace(/\D/g, "")}`;

  const bodyHtml = `
<h1 style="margin:0 0 12px 0;font-size:22px;color:#3D2E5C;">Aprobamos tu retracto ✅</h1>
<p>Hola ${escapeHtml(data.customerName)}, aprobamos tu solicitud de retracto del producto
<strong>${escapeHtml(data.productName)}</strong> (pedido ${escapeHtml(data.orderNumber)}).</p>
<p style="margin-top:14px;"><strong>¿Cómo sigue?</strong></p>
<ol style="padding-left:18px;color:#3D2E5C;">
  <li>Coordinamos contigo la <strong>recogida o envío de devolución</strong> — nosotros cubrimos el costo.</li>
  <li>Cuando recibamos el producto en buen estado, procesamos tu reembolso.</li>
  <li>El reembolso se hace en <strong>máximo 15 días calendario</strong> desde tu solicitud (Ley 2439/2024).</li>
</ol>
<p style="margin-top:14px;">Escríbenos por WhatsApp para coordinar la devolución:</p>
<p><a href="${waLink}" style="color:#C42B76;font-weight:600;">Coordinar por WhatsApp →</a></p>
<p style="font-size:13px;color:#3D2E5C;opacity:0.65;margin-top:18px;">Recuerda que los productos personalizados (con tu foto o texto) no tienen derecho de retracto por ley.</p>
`;

  const text = `Aprobamos tu retracto

Hola ${data.customerName},

Aprobamos tu solicitud de retracto de "${data.productName}" (pedido ${data.orderNumber}).

Cómo sigue:
1. Coordinamos la recogida/envío de devolución (nosotros cubrimos el costo).
2. Al recibir el producto en buen estado, procesamos tu reembolso.
3. Reembolso en máximo 15 días calendario desde tu solicitud (Ley 2439/2024).

Escríbenos por WhatsApp para coordinar: ${waLink}`;

  return {
    subject: `Retracto aprobado — pedido ${data.orderNumber} ✅`,
    html: await renderEmailLayout({
      preview: `Aprobamos tu retracto de "${data.productName}". Coordinemos la devolución.`,
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
