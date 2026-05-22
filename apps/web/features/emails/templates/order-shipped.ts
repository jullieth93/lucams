/*
 * Template: pedido enviado (cuando webhook Aveonline reporta IN_TRANSIT).
 */

import { renderEmailLayout, ctaButton } from "../layout";
import { getSettingValue } from "@/lib/cms";

export type OrderShippedData = {
  orderNumber: string;
  customerName: string;
  carrier: string;
  trackingNumber: string;
  trackingUrl: string | null;
  estimatedDays: number | null;
};

export async function orderShippedEmail(data: OrderShippedData) {
  const siteUrl = await getSettingValue("SITE_URL", "https://lucamsshop.co");
  const etaText = data.estimatedDays
    ? `<p>Estimado de entrega: <strong>${data.estimatedDays} día${data.estimatedDays === 1 ? "" : "s"} hábil${data.estimatedDays === 1 ? "" : "es"}</strong>.</p>`
    : "";

  const trackingBlock = data.trackingUrl
    ? ctaButton(data.trackingUrl, "Rastrear mi paquete →")
    : `<p>Número de guía: <code style="background:#f5f0eb;padding:2px 6px;border-radius:4px;">${escapeHtml(data.trackingNumber)}</code></p>`;

  const bodyHtml = `
<h1 style="margin:0 0 12px 0;font-size:22px;color:#3D2E5C;">¡Tu pedido va en camino! 🚚</h1>
<p>Hola ${escapeHtml(data.customerName)}, despachamos tu pedido <strong>${escapeHtml(data.orderNumber)}</strong>.</p>
<p>Transportadora: <strong>${escapeHtml(data.carrier)}</strong></p>
<p>Número de guía: <code style="background:#f5f0eb;padding:2px 6px;border-radius:4px;">${escapeHtml(data.trackingNumber)}</code></p>
${etaText}

${trackingBlock}

<p style="font-size:13px;color:#3D2E5C;opacity:0.65;margin-top:18px;">Si nadie atiende cuando lleguen, la transportadora intentará entregar 2 veces más antes de devolver el paquete.</p>
`;

  const text = `¡Tu pedido va en camino!

Hola ${data.customerName},

Despachamos tu pedido ${data.orderNumber}.

Transportadora: ${data.carrier}
Número de guía: ${data.trackingNumber}
${data.estimatedDays ? `Estimado: ${data.estimatedDays} día(s) hábil(es)\n` : ""}
${data.trackingUrl ? `Rastrear: ${data.trackingUrl}\n` : ""}
Cualquier duda, escríbenos al ${siteUrl}/contacto`;

  return {
    subject: `Tu pedido ${data.orderNumber} va en camino 🚚`,
    html: await renderEmailLayout({
      preview: `Guía ${data.trackingNumber} · ${data.carrier}`,
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
