/*
 * Template: pago rechazado.
 *
 * Enviado cuando webhook Wompi reporta DECLINED/VOIDED/ERROR → Order
 * pasa a CANCELLED. El cliente puede reintentar haciendo otro checkout.
 */

import { renderEmailLayout, ctaButton } from "../layout";
import { getSettingValue } from "@/lib/cms";
import { formatCOP } from "@/lib/format";

export type OrderPaymentFailedData = {
  orderNumber: string;
  customerName: string;
  total: number; // centavos
  reason: string; // mensaje sanitizado de Wompi
  publicTrackingToken: string | null;
};

export async function orderPaymentFailedEmail(data: OrderPaymentFailedData) {
  const siteUrl = await getSettingValue("SITE_URL", "https://lucamsshop.com");

  // Razones técnicas → mensaje amigable
  const friendlyReason = (() => {
    const r = data.reason.toLowerCase();
    if (r.includes("insufficient") || r.includes("fondos"))
      return "tu tarjeta no tiene fondos suficientes";
    if (r.includes("declined") || r.includes("rechaz")) return "tu banco rechazó la transacción";
    if (r.includes("expired") || r.includes("vencid"))
      return "los datos de tu tarjeta están vencidos";
    if (r.includes("invalid") || r.includes("inválido")) return "los datos de pago no son válidos";
    if (r.includes("3ds") || r.includes("autentic"))
      return "no se pudo verificar la autenticación de tu banco";
    if (r.includes("voided") || r.includes("anulad")) return "la transacción fue anulada";
    return "el pago no se pudo procesar";
  })();

  const bodyHtml = `
<h1 style="margin:0 0 12px 0;font-size:22px;color:#3D2E5C;">Tu pago no se pudo procesar 😔</h1>
<p>Hola ${escapeHtml(data.customerName)}, intentamos cobrar tu pedido <strong>${escapeHtml(data.orderNumber)}</strong> por ${formatCOP(data.total)} pero ${escapeHtml(friendlyReason)}.</p>

<p style="margin-top:16px;"><strong>¿Qué puedes hacer?</strong></p>
<ul style="padding-left:20px;margin:8px 0;">
  <li>Vuelve al carrito y reintenta con la misma tarjeta</li>
  <li>Prueba con otro medio de pago (PSE, Nequi, Bancolombia)</li>
  <li>Verifica con tu banco si bloquearon la compra</li>
</ul>

${ctaButton(`${siteUrl}/carrito`, "Volver al carrito →")}

<p style="font-size:13px;color:#3D2E5C;opacity:0.65;margin-top:18px;">No te cobramos nada. Tu carrito sigue ahí esperándote. Si tienes dudas, responde este correo o escríbenos por WhatsApp.</p>
`;

  const text = `Tu pago no se pudo procesar.

Hola ${data.customerName},

Intentamos cobrar tu pedido ${data.orderNumber} por ${formatCOP(data.total)} pero ${friendlyReason}.

¿Qué puedes hacer?
- Vuelve al carrito y reintenta con la misma tarjeta
- Prueba con otro medio de pago (PSE, Nequi, Bancolombia)
- Verifica con tu banco si bloquearon la compra

Volver al carrito: ${siteUrl}/carrito

No te cobramos nada. Tu carrito sigue ahí esperándote.`;

  return {
    subject: `Tu pago para ${data.orderNumber} no se procesó`,
    html: await renderEmailLayout({
      preview: `${friendlyReason} · reintenta con otro medio`,
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
