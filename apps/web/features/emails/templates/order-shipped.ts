/*
 * Template: pedido enviado (cuando webhook Aveonline reporta IN_TRANSIT).
 */

import { renderEmailLayout, ctaButton, getSiteUrl } from "../layout";
import { carrierTrackingPageUrl } from "@/features/shipping/tracking-urls";

export type OrderShippedData = {
  orderNumber: string;
  customerName: string;
  carrier: string;
  trackingNumber: string;
  /** PDF del documento de guía (rutaguia de Aveonline) — ya NO es el botón
   *  principal de rastreo: se enlaza aparte como "Documento de guía". */
  trackingUrl: string | null;
  estimatedDays: number | null;
  publicTrackingToken: string | null;
};

export async function orderShippedEmail(data: OrderShippedData) {
  const siteUrl = await getSiteUrl();
  const etaText = data.estimatedDays
    ? `<p>Estimado de la transportadora: <strong>${data.estimatedDays} día${data.estimatedDays === 1 ? "" : "s"} hábil${data.estimatedDays === 1 ? "" : "es"}</strong> desde el despacho. Es un estimado del courier, no una fecha garantizada.</p>`
    : "";

  // Rastreo (feedback Lucy 2026-08-11): el botón principal va a NUESTRA vista
  // /pedido/<token> (guía + estados en vivo vía webhook). Antes apuntaba al
  // PDF de la guía y el cliente "rastreaba" descargando una etiqueta.
  const orderPageUrl = data.publicTrackingToken
    ? `${siteUrl}/pedido/${data.publicTrackingToken}`
    : null;
  const carrierPage = carrierTrackingPageUrl(data.carrier);

  const trackingBlock = `
${orderPageUrl ? ctaButton(orderPageUrl, "Rastrear mi pedido →") : `<p>Número de guía: <code style="background:#f5f0eb;padding:2px 6px;border-radius:4px;">${escapeHtml(data.trackingNumber)}</code></p>`}
<p style="margin-top:10px;font-size:13px;color:#3D2E5C;opacity:0.75;">${
    carrierPage
      ? `También la puedes rastrear en la web de la transportadora: <a href="${carrierPage}" style="color:#7C6AAD;">${escapeHtml(carrierPage.replace(/^https:\/\//, "").replace(/\/$/, ""))}</a> (digita la guía ${escapeHtml(data.trackingNumber)}).`
      : ""
  }${data.trackingUrl ? ` · <a href="${escapeHtml(data.trackingUrl)}" style="color:#7C6AAD;">Documento de guía (PDF)</a>` : ""}</p>`;

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
${data.estimatedDays ? `Estimado de la transportadora: ${data.estimatedDays} día(s) hábil(es) desde el despacho\n` : ""}${orderPageUrl ? `Rastrear mi pedido: ${orderPageUrl}\n` : ""}${carrierPage ? `Rastreo en la transportadora: ${carrierPage}\n` : ""}Cualquier duda, escríbenos al ${siteUrl}/contacto`;

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
