/*
 * Template: pago no aprobado con el pedido AÚN VIVO (N-22a).
 *
 * Enviado cuando el webhook Wompi reporta DECLINED/ERROR y la orden queda en
 * PENDING_PAYMENT (noop deliberado: Wompi habilita reintento con la misma
 * reference y createOrderFromCart reusa la orden — ver app/api/webhooks/wompi).
 *
 * Distinto de order-payment-failed (que se manda cuando la orden ya se
 * CANCELÓ): acá el pedido sigue esperando el pago, así que el copy invita a
 * REINTENTAR y es honesto sobre la ventana: pasadas las horas de
 * PENDING_PAYMENT_EXPIRY_HOURS el pedido se cancela solo (cron
 * expire-pending-orders), sin ningún cobro.
 */

import { renderEmailLayout, ctaButton, getSiteUrl } from "../layout";
import { formatCOP } from "@/lib/format";
import { PENDING_PAYMENT_EXPIRY_HOURS } from "@/features/orders/constants";

export type OrderPaymentDeclinedData = {
  orderNumber: string;
  customerName: string;
  total: number; // centavos
  reason: string; // mensaje crudo de Wompi (status_message) — se traduce abajo
};

export async function orderPaymentDeclinedEmail(data: OrderPaymentDeclinedData) {
  const siteUrl = await getSiteUrl();

  // Razones técnicas → mensaje amigable (mismo mapa que order-payment-failed).
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
    return "el pago no se pudo procesar";
  })();

  const bodyHtml = `
<h1 style="margin:0 0 12px 0;font-size:22px;color:#3D2E5C;">Tu pago no fue aprobado, pero tu pedido te espera 💜</h1>
<p>Hola ${escapeHtml(data.customerName)}, intentamos cobrar tu pedido <strong>${escapeHtml(data.orderNumber)}</strong> por ${formatCOP(data.total)} pero ${escapeHtml(friendlyReason)}.</p>

<p style="margin-top:16px;"><strong>No te cobramos nada.</strong> Tu pedido sigue reservado y tu carrito tiene todo tal como lo dejaste. Puedes reintentar el pago cuando quieras:</p>
<ul style="padding-left:20px;margin:8px 0;">
  <li>Con la misma tarjeta (a veces es un bloqueo momentáneo del banco)</li>
  <li>Con otro medio de pago (PSE, Nequi, Bancolombia, otra tarjeta)</li>
</ul>

${ctaButton(`${siteUrl}/carrito`, "Volver a mi carrito y reintentar →")}

<p style="font-size:13px;color:#3D2E5C;opacity:0.65;margin-top:18px;">Tienes ${PENDING_PAYMENT_EXPIRY_HOURS} horas desde que creaste el pedido para completar el pago; después se cancela solo, sin ningún cobro. Si tu banco te muestra un cobro pendiente, es una retención que ellos mismos liberan — nosotros no capturamos nada. ¿Dudas? Responde este correo o escríbenos por WhatsApp.</p>
`;

  const text = `Tu pago no fue aprobado, pero tu pedido te espera.

Hola ${data.customerName},

Intentamos cobrar tu pedido ${data.orderNumber} por ${formatCOP(data.total)} pero ${friendlyReason}.

No te cobramos nada. Tu pedido sigue reservado y tu carrito tiene todo tal como lo dejaste. Puedes reintentar el pago:
- Con la misma tarjeta (a veces es un bloqueo momentáneo del banco)
- Con otro medio de pago (PSE, Nequi, Bancolombia, otra tarjeta)

Volver a mi carrito y reintentar: ${siteUrl}/carrito

Tienes ${PENDING_PAYMENT_EXPIRY_HOURS} horas desde que creaste el pedido para completar el pago; después se cancela solo, sin ningún cobro.`;

  return {
    subject: `Tu pago para ${data.orderNumber} no fue aprobado — puedes reintentarlo`,
    html: await renderEmailLayout({
      preview: `${friendlyReason} · tu pedido te espera, reintenta el pago`,
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
