/*
 * Template: Envío de propuesta formal B2B / Eventos al cliente (`/propuesta/[token]`, `ADR-210`).
 */

import { renderEmailLayout, escapeHtml, ctaButton, getSiteUrl } from "../layout";
import { formatCOP, formatCityDept } from "@/lib/format";

export type B2bProposalSentData = {
  proposalNumber: string;
  opportunityNumber: string;
  version: number;
  contactName: string;
  organizationName: string | null;
  totalCents: number;
  validUntilLabel: string;
  city: string;
  department: string | null;
  proposalToken: string;
  proofIncludedLabel: string;
  items: Array<{
    title: string;
    qty: number;
    unitPriceCents: number;
    lineTotalCents: number;
  }>;
  clientNotes: string | null;
};

export async function b2bProposalSentEmail(data: B2bProposalSentData) {
  const siteUrl = await getSiteUrl();
  const proposalUrl = `${siteUrl}/propuesta/${encodeURIComponent(data.proposalToken)}`;
  const location = data.department ? formatCityDept(data.city, data.department) : data.city;

  const itemRowsHtml = data.items
    .map(
      (it) => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #eadfd6;color:#3D2E5C;">
        <strong>${escapeHtml(it.title)}</strong> <span style="opacity:0.65;">×${it.qty}</span>
      </td>
      <td style="padding:8px 0;border-bottom:1px solid #eadfd6;text-align:right;color:#3D2E5C;font-weight:600;">
        ${formatCOP(it.lineTotalCents)}
      </td>
    </tr>`,
    )
    .join("");

  const notesHtml = data.clientNotes
    ? `<p style="margin:12px 0 0 0;padding-top:10px;border-top:1px solid #eadfd6;font-size:13px;color:#3D2E5C;"><strong>Notas de tu propuesta:</strong><br><span style="white-space:pre-wrap;opacity:0.85;">${escapeHtml(data.clientNotes)}</span></p>`
    : "";

  const bodyHtml = `
<h1 style="margin:0 0 12px 0;font-size:22px;color:#3D2E5C;">Tu propuesta ${escapeHtml(data.proposalNumber)} está lista ✨</h1>
<p>Hola <strong>${escapeHtml(data.contactName)}</strong>,</p>
<p>Preparamos la propuesta formal para tu proyecto${data.organizationName ? ` de <strong>${escapeHtml(data.organizationName)}</strong>` : ""} (radicado <strong>${escapeHtml(data.opportunityNumber)}</strong> · versión ${data.version}). Desde tu enlace privado puedes revisar el detalle completo, confirmar la dirección de entrega y completar el pago de forma segura.</p>

<div style="background:#FFF8F0;padding:16px;border-radius:12px;margin:16px 0;">
  <table cellpadding="0" cellspacing="0" border="0" style="font-size:14px;width:100%;border-collapse:collapse;">
    ${itemRowsHtml}
    <tr>
      <td style="padding:10px 0 4px 0;color:#3D2E5C;font-weight:700;font-size:15px;">Total propuesta</td>
      <td style="padding:10px 0 4px 0;text-align:right;color:#3D2E5C;font-weight:700;font-size:16px;">${formatCOP(data.totalCents)}</td>
    </tr>
  </table>
  <table cellpadding="0" cellspacing="0" border="0" style="font-size:13px;width:100%;margin-top:10px;border-collapse:collapse;">
    <tr><td style="color:#3D2E5C;opacity:0.65;padding:3px 0;width:140px;">Destino cotizado:</td><td>${escapeHtml(location)}</td></tr>
    <tr><td style="color:#3D2E5C;opacity:0.65;padding:3px 0;">Muestra digital:</td><td>${escapeHtml(data.proofIncludedLabel)}</td></tr>
    <tr><td style="color:#3D2E5C;opacity:0.65;padding:3px 0;">Vigencia hasta:</td><td><strong>${escapeHtml(data.validUntilLabel)}</strong></td></tr>
  </table>
  ${notesHtml}
</div>

${ctaButton(proposalUrl, "Revisar y aprobar propuesta →")}

<p style="font-size:13px;color:#3D2E5C;opacity:0.75;">Este enlace es privado para tu organización o evento. Si deseas ajustar cantidades o acabados, responde a este correo y emitiremos una nueva versión actualizada.</p>
<p>Un abrazo,<br>El equipo de Lucams Shop</p>
`;

  const itemsText = data.items
    .map((it) => `  - ${it.title} ×${it.qty}: ${formatCOP(it.lineTotalCents)}`)
    .join("\n");

  const text = `Tu propuesta ${data.proposalNumber} está lista

Hola ${data.contactName},

Preparamos la propuesta formal para tu proyecto (${data.opportunityNumber} · v${data.version}):
${itemsText}

Total propuesta: ${formatCOP(data.totalCents)}
Destino cotizado: ${location}
Muestra digital: ${data.proofIncludedLabel}
Vigencia hasta: ${data.validUntilLabel}
${data.clientNotes ? `\nNotas:\n${data.clientNotes}\n` : ""}
Revisar y aprobar propuesta: ${proposalUrl}

El equipo de Lucams Shop`;

  return {
    subject: `Propuesta ${data.proposalNumber} lista para aprobar — Lucams Shop`,
    html: await renderEmailLayout({
      preview: `Propuesta ${data.proposalNumber} por ${formatCOP(data.totalCents)} · Vigente hasta ${data.validUntilLabel}.`,
      bodyHtml,
    }),
    text,
  };
}
