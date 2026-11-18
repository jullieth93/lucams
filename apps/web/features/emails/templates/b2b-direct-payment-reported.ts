/*
 * Template: Aviso INTERNO cuando un cliente B2B reporta un pago directo por Bre-B o transferencia (`ADR-210`).
 */

import { renderEmailLayout, escapeHtml, ctaButton, getSiteUrl } from "../layout";
import { formatCOP } from "@/lib/format";

export type B2bDirectPaymentReportedData = {
  orderNumber: string;
  proposalNumber: string;
  contactName: string;
  contactEmail: string;
  organizationName: string | null;
  methodLabel: string;
  reference: string;
  totalCents: number;
  notes: string | null;
};

export async function b2bDirectPaymentReportedEmail(data: B2bDirectPaymentReportedData) {
  const siteUrl = await getSiteUrl();
  const adminOrderUrl = `${siteUrl}/admin/pedidos/${encodeURIComponent(data.orderNumber)}`;

  const bodyHtml = `
<h1 style="margin:0 0 12px 0;font-size:20px;color:#3D2E5C;">🏦 Pago directo reportado: ${escapeHtml(data.orderNumber)}</h1>
<p>El cliente <strong>${escapeHtml(data.contactName)}</strong>${data.organizationName ? ` (${escapeHtml(data.organizationName)})` : ""} reportó una transferencia para la propuesta <strong>${escapeHtml(data.proposalNumber)}</strong>. Verifica el abono real en tu entidad bancaria antes de confirmar con MFA.</p>

<div style="background:#FFF8F0;padding:14px 16px;border-radius:10px;margin:16px 0;">
  <table cellpadding="0" cellspacing="0" border="0" style="font-size:14px;width:100%;border-collapse:collapse;">
    <tr><td style="color:#3D2E5C;opacity:0.65;padding:4px 0;width:140px;">Pedido:</td><td><strong>${escapeHtml(data.orderNumber)}</strong></td></tr>
    <tr><td style="color:#3D2E5C;opacity:0.65;padding:4px 0;">Medio reportado:</td><td>${escapeHtml(data.methodLabel)}</td></tr>
    <tr><td style="color:#3D2E5C;opacity:0.65;padding:4px 0;">Referencia / CUS:</td><td><code style="font-family:monospace;font-weight:700;">${escapeHtml(data.reference)}</code></td></tr>
    <tr><td style="color:#3D2E5C;opacity:0.65;padding:4px 0;">Total pedido:</td><td><strong>${formatCOP(data.totalCents)}</strong></td></tr>
  </table>
  ${
    data.notes
      ? `<p style="margin:10px 0 0 0;padding-top:10px;border-top:1px solid #eadfd6;font-size:13px;color:#3D2E5C;"><strong>Nota del cliente:</strong> ${escapeHtml(data.notes)}</p>`
      : ""
  }
</div>

${ctaButton(adminOrderUrl, "Verificar y confirmar en Admin →")}
`;

  const text = `Pago directo reportado: ${data.orderNumber}

Cliente: ${data.contactName}${data.organizationName ? ` (${data.organizationName})` : ""}
Propuesta: ${data.proposalNumber}
Medio reportado: ${data.methodLabel}
Referencia / CUS: ${data.reference}
Total pedido: ${formatCOP(data.totalCents)}
${data.notes ? `Nota: ${data.notes}\n` : ""}
Confirmar con MFA en el panel: ${adminOrderUrl}`;

  return {
    subject: `🏦 Pago directo por verificar: ${data.orderNumber} (${formatCOP(data.totalCents)})`,
    html: await renderEmailLayout({
      preview: `${data.contactName} reportó comprobante ${data.reference} (${data.methodLabel}) para ${data.orderNumber}.`,
      bodyHtml,
    }),
    text,
    replyTo: data.contactEmail,
  };
}
