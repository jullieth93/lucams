/*
 * Template: confirmación de pago.
 *
 * Enviado cuando webhook Wompi confirma APPROVED → Order pasa a PAID
 * (antes de createShipment para no bloquear el flow si Aveonline falla).
 */

import { renderEmailLayout, ctaButton, getSiteUrl } from "../layout";
import { formatCOP } from "@/lib/format";

export type OrderConfirmationData = {
  orderNumber: string;
  customerName: string;
  total: number; // centavos COP
  subtotal: number;
  shipping: number;
  /** Descuento por cupón (centavos COP, positivo). 0/undefined ⇒ no se muestra la fila. */
  discount?: number;
  shippingCarrier: string | null;
  /**
   * `qty` es la cantidad de LÍNEAS (modelo multi-unidad 2026-09-09: un diseño
   * con N unidades es UNA línea con qty=1 y el pack va en unitPrice).
   * `units` = unidades físicas reales del diseño cuando existe; se muestra
   * ×(units ?? qty). El dinero no cambia: lineTotal = unitPrice × qty.
   */
  items: Array<{
    name: string;
    qty: number;
    units?: number;
    lineTotal: number;
    /**
     * Desglose de la variante (Paquete H, 2026-10-02 — describeVariantAttributes):
     * ["12 fotos", "6×8 cm", "Sin imán (adhesivo)"]. Se muestra como línea
     * secundaria bajo el nombre; []/ausente ⇒ solo el nombre.
     */
    breakdown?: string[];
  }>;
  shippingAddress: string; // ya formateada
  /** Token público para vista guest /pedido/<token> sin login. */
  publicTrackingToken: string | null;
  /**
   * Cliente REGISTRADO (Paquete H, 2026-10-02): URL de su pedido en la cuenta
   * (/mi-cuenta/pedidos/<number>). Manda sobre publicTrackingToken y sobre el
   * fallback /rastrear.
   */
  accountOrderUrl?: string | null;
  /** COD ⇒ el cliente paga en efectivo al recibir (no hubo pago online). */
  paymentMethod?: "WOMPI" | "COD";
  /** true = entrega propia "Envío Lucam's": no hay guía ni transportadora
   *  externa — el texto lo dice en esos términos. */
  internalDelivery?: boolean;
  /**
   * FLUJO REGALO — true: el pedido es un regalo ("compro yo, lo recibe otra
   * persona") y este correo NO muestra precios (items sin valor ni tabla de
   * totales), para que el comprador pueda mostrarlo/reenviarlo sin revelar
   * cuánto pagó. EXCEPCIÓN deliberada: en COD el aviso de contraentrega SÍ
   * conserva el monto — alguien (quien recibe) debe tener el efectivo exacto.
   */
  isGift?: boolean;
  /** Nombre de quien recibe (para el texto "llega a nombre de…"). */
  recipientName?: string | null;
};

export async function orderConfirmationEmail(data: OrderConfirmationData) {
  const siteUrl = await getSiteUrl();
  // FLUJO REGALO — con isGift el correo no muestra valores (ver el doc del
  // campo en OrderConfirmationData): las filas de items van sin precio y la
  // tabla de totales se omite completa.
  const hidePrices = data.isGift === true;
  const itemsRows = data.items
    .map(
      (it) => `
<tr>
  <td style="padding:8px 0;border-bottom:1px solid #f0e7e0;color:#3D2E5C;">
    ${escapeHtml(it.name)} <span style="opacity:0.55;">×${it.units ?? it.qty}</span>${
      it.breakdown && it.breakdown.length > 0
        ? `<div style="font-size:12px;color:#3D2E5C;opacity:0.6;">${escapeHtml(it.breakdown.join(" · "))}</div>`
        : ""
    }
  </td>${
    hidePrices
      ? ""
      : `
  <td style="padding:8px 0;border-bottom:1px solid #f0e7e0;text-align:right;color:#3D2E5C;font-weight:600;">${formatCOP(it.lineTotal)}</td>`
  }
</tr>`,
    )
    .join("");

  // Paquete H — destino del CTA "Ver mi pedido": cuenta del cliente registrado,
  // vista guest por token fresco, o /rastrear (invitado COD) en ese orden.
  const orderCtaUrl =
    data.accountOrderUrl ??
    (data.publicTrackingToken
      ? `${siteUrl}/pedido/${data.publicTrackingToken}`
      : `${siteUrl}/rastrear`);

  const discount = data.discount ?? 0;
  const discountRowHtml =
    discount > 0
      ? `
  <tr>
    <td style="padding:4px 0;color:#1a7a4f;font-size:13px;">Descuento</td>
    <td style="padding:4px 0;text-align:right;color:#1a7a4f;font-size:13px;">−${formatCOP(discount)}</td>
  </tr>`
      : "";

  const isCod = data.paymentMethod === "COD";
  const codCallout = isCod
    ? `
<div style="margin:14px 0;padding:12px 14px;border:1px solid #FFD93D;background:#FFFBEA;border-radius:10px;">
  <div style="font-weight:700;color:#3D2E5C;">💵 Pago contraentrega</div>
  <div style="font-size:14px;color:#3D2E5C;">Pagas <strong>${formatCOP(data.total)}</strong> en efectivo cuando el mensajero te entregue el pedido.</div>
</div>`
    : "";

  const giftCallout =
    hidePrices && data.recipientName
      ? `
<div style="margin:14px 0;padding:12px 14px;border:1px solid #E9D5FF;background:#F7F2FF;border-radius:10px;">
  <div style="font-weight:700;color:#3D2E5C;">🎁 Es un regalo</div>
  <div style="font-size:14px;color:#3D2E5C;">Llega a nombre de <strong>${escapeHtml(data.recipientName)}</strong>. Este correo no muestra precios, por si quieres compartirlo.</div>
</div>`
      : "";

  const totalsTable = hidePrices
    ? ""
    : `
  <tr>
    <td style="padding:12px 0 4px 0;color:#3D2E5C;opacity:0.7;font-size:13px;">Subtotal</td>
    <td style="padding:12px 0 4px 0;text-align:right;color:#3D2E5C;font-size:13px;">${formatCOP(data.subtotal)}</td>
  </tr>
  <tr>
    <td style="padding:4px 0;color:#3D2E5C;opacity:0.7;font-size:13px;">Envío${data.shippingCarrier ? ` (${escapeHtml(data.shippingCarrier)})` : ""}</td>
    <td style="padding:4px 0;text-align:right;color:#3D2E5C;font-size:13px;">${formatCOP(data.shipping)}</td>
  </tr>${discountRowHtml}
  <tr>
    <td style="padding:12px 0 4px 0;color:#3D2E5C;font-size:16px;font-weight:700;border-top:2px solid #3D2E5C;">Total</td>
    <td style="padding:12px 0 4px 0;text-align:right;color:#3D2E5C;font-size:16px;font-weight:700;border-top:2px solid #3D2E5C;">${formatCOP(data.total)}</td>
  </tr>`;

  const bodyHtml = `
<h1 style="margin:0 0 12px 0;font-size:22px;color:#3D2E5C;">¡Tu pedido está confirmado! 🎉</h1>
<p>Hola ${escapeHtml(data.customerName)}, ${
    isCod
      ? `recibimos tu pedido <strong>${escapeHtml(data.orderNumber)}</strong>.`
      : `recibimos tu pago para el pedido <strong>${escapeHtml(data.orderNumber)}</strong>.`
  }</p>
${codCallout}
${giftCallout}
${
  data.internalDelivery
    ? `<p>Ya empezamos a preparar tu pedido: lo despachamos en máximo <strong>2 días hábiles</strong> y te lo entregamos <strong>el mismo día del despacho</strong> con <strong>nuestro equipo Lucam's</strong> (entrega directa, sin transportadora externa). Te avisamos apenas salga.</p>`
    : `<p>Ya empezamos a preparar tu pedido: lo despachamos en máximo <strong>2 días hábiles</strong> y te avisamos con el número de guía apenas salga. De ahí en adelante el tiempo lo pone la transportadora y depende de tu ciudad.</p>`
}

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:20px 0;border-collapse:collapse;">
  ${itemsRows}${totalsTable}
</table>

<p style="font-size:14px;color:#3D2E5C;"><strong>Enviamos a:</strong><br>${escapeHtml(data.shippingAddress)}</p>

${ctaButton(orderCtaUrl, "Ver mi pedido →")}

<p style="font-size:12px;color:#3D2E5C;opacity:0.6;margin-top:16px;">${
    hidePrices
      ? `Conoce tu <a href="${siteUrl}/legal/devoluciones" style="color:#7C6AAD;">derecho de retracto</a> (5 días hábiles para el catálogo estándar; los productos personalizados no aplican) y la <a href="${siteUrl}/legal/garantias" style="color:#7C6AAD;">garantía de 3 meses</a>.`
      : `Los valores están en pesos colombianos (COP) y son el total que pagas. Conoce tu <a href="${siteUrl}/legal/devoluciones" style="color:#7C6AAD;">derecho de retracto</a> (5 días hábiles para el catálogo estándar; los productos personalizados no aplican) y la <a href="${siteUrl}/legal/garantias" style="color:#7C6AAD;">garantía de 3 meses</a>.`
  }</p>

<p style="font-size:13px;color:#3D2E5C;opacity:0.65;margin-top:14px;">¿Algún cambio? Escríbenos por WhatsApp o responde este correo.</p>
`;

  const itemsText = hidePrices
    ? data.items
        .map(
          (it) =>
            `  - ${it.name}${it.breakdown && it.breakdown.length > 0 ? ` (${it.breakdown.join(" · ")})` : ""} ×${it.units ?? it.qty}`,
        )
        .join("\n")
    : data.items
        .map(
          (it) =>
            `  - ${it.name}${it.breakdown && it.breakdown.length > 0 ? ` (${it.breakdown.join(" · ")})` : ""} ×${it.units ?? it.qty} → ${formatCOP(it.lineTotal)}`,
        )
        .join("\n");

  const text = `¡Tu pedido está confirmado!

Hola ${data.customerName},

${
  isCod
    ? `Recibimos tu pedido ${data.orderNumber}.
💵 Pago contraentrega: pagas ${formatCOP(data.total)} en efectivo al recibir.`
    : `Recibimos tu pago para el pedido ${data.orderNumber}.`
}
${hidePrices && data.recipientName ? `\n🎁 Es un regalo: llega a nombre de ${data.recipientName}. Este correo no muestra precios.\n` : ""}
Items:
${itemsText}
${
  hidePrices
    ? ""
    : `
Subtotal: ${formatCOP(data.subtotal)}
Envío${data.shippingCarrier ? ` (${data.shippingCarrier})` : ""}: ${formatCOP(data.shipping)}${discount > 0 ? `\nDescuento: −${formatCOP(discount)}` : ""}
Total: ${formatCOP(data.total)}
`
}
Enviamos a: ${data.shippingAddress}

Ver mi pedido: ${orderCtaUrl}
${
  hidePrices
    ? ""
    : `
Los valores están en pesos colombianos (COP) y son el total que pagas.`
}
Retracto (5 días hábiles, catálogo estándar): ${siteUrl}/legal/devoluciones
Garantía (3 meses desde la entrega): ${siteUrl}/legal/garantias`;

  return {
    subject: `Pedido ${data.orderNumber} confirmado 🎉`,
    html: await renderEmailLayout({
      preview: hidePrices
        ? "Ya estamos preparando tu pedido (regalo — sin precios en este correo)"
        : `Total ${formatCOP(data.total)} · ya estamos preparando tu pedido`,
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
