/*
 * Template: aviso al cliente de que su reclamo de garantía quedó resuelto (Ley 1480).
 */

import { renderEmailLayout, escapeHtml } from "../layout";

const REMEDY_LABEL: Record<string, string> = {
  REPAIR: "reparación",
  REPLACE: "cambio del producto",
  REFUND: "devolución del dinero",
};

export type WarrantyResolvedData = {
  customerName: string;
  claimId: string;
  productName: string;
  resolutionType: string; // REPAIR | REPLACE | REFUND
  note?: string | null;
};

export async function warrantyResolvedEmail(data: WarrantyResolvedData) {
  const short = data.claimId.slice(0, 8).toUpperCase();
  const remedy = REMEDY_LABEL[data.resolutionType] ?? "una solución";
  const noteHtml = data.note
    ? `<p style="background:#FFF8F0;padding:14px 16px;border-radius:8px;font-size:14px;white-space:pre-wrap;color:#3D2E5C;opacity:0.85;">${escapeHtml(data.note)}</p>`
    : "";
  const bodyHtml = `
<h1 style="margin:0 0 12px 0;font-size:22px;color:#3D2E5C;">Tu garantía quedó resuelta ✅</h1>
<p>Hola <strong>${escapeHtml(data.customerName)}</strong>,</p>
<p>Resolvimos tu reclamo de garantía <strong style="font-family:monospace;background:#FFF8F0;padding:2px 6px;border-radius:4px;">#${short}</strong> de <strong>${escapeHtml(data.productName)}</strong> con: <strong>${remedy}</strong>.</p>
${noteHtml}
<p>Gracias por tu paciencia. Si algo no quedó bien, respóndenos este correo.</p>
<p>Un abrazo,<br>El equipo de Lucams_shop</p>
`;
  const text = `Tu garantía quedó resuelta

Hola ${data.customerName},

Resolvimos tu reclamo de garantía #${short} de ${data.productName} con: ${remedy}.
${data.note ? `\n${data.note}\n` : ""}
Gracias por tu paciencia. Si algo no quedó bien, respóndenos este correo.

Un abrazo,
El equipo de Lucams_shop`;

  return {
    subject: `Tu garantía quedó resuelta — #${short}`,
    html: await renderEmailLayout({ preview: `Garantía #${short}: ${remedy}.`, bodyHtml }),
    text,
  };
}
