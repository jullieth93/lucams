/*
 * Template: pedido devuelto por la transportadora (N-22b).
 *
 * Enviado cuando el webhook Aveonline reporta RETURNED/EXCEPTION: el paquete
 * viene de vuelta (dirección no encontrada, cliente no recibió, novedad en
 * transporte). La orden NO se transiciona automáticamente — queda marcada
 * "necesita atención" para que el negocio decida (reenvío / reembolso /
 * reposición de stock).
 *
 * Copy honesto, SIN promesas: no prometemos fecha ni resolución automática;
 * solo decimos qué pasó, que no tiene que hacer nada, y que lo contactamos.
 */

import { renderEmailLayout, getSiteUrl } from "../layout";

export type OrderReturnedData = {
  orderNumber: string;
  customerName: string;
};

export async function orderReturnedEmail(data: OrderReturnedData) {
  const siteUrl = await getSiteUrl();

  const bodyHtml = `
<h1 style="margin:0 0 12px 0;font-size:22px;color:#3D2E5C;">Tu pedido viene de vuelta 📦</h1>
<p>Hola ${escapeHtml(data.customerName)}, la transportadora nos avisó que no pudo entregar tu pedido <strong>${escapeHtml(data.orderNumber)}</strong> y que el paquete viene de regreso hacia nosotros.</p>

<p style="margin-top:16px;"><strong>No tienes que hacer nada por ahora.</strong> Apenas lo recibamos te contactamos a este correo para decidir juntos el siguiente paso: reenviarlo a la dirección que nos confirmes o devolverte el dinero, según lo que prefieras.</p>

<p>Si crees que hubo un problema con la dirección o quieres contarnos algo antes, responde este correo o escríbenos por WhatsApp y lo resolvemos más rápido.</p>

<p style="font-size:13px;color:#3D2E5C;opacity:0.65;margin-top:18px;">También puedes ver el estado de tu pedido en ${siteUrl}/rastrear con tu número de pedido y tu correo.</p>
`;

  const text = `Tu pedido viene de vuelta.

Hola ${data.customerName},

La transportadora nos avisó que no pudo entregar tu pedido ${data.orderNumber} y que el paquete viene de regreso hacia nosotros.

No tienes que hacer nada por ahora. Apenas lo recibamos te contactamos a este correo para decidir juntos el siguiente paso: reenviarlo a la dirección que nos confirmes o devolverte el dinero, según lo que prefieras.

Si crees que hubo un problema con la dirección o quieres contarnos algo antes, responde este correo o escríbenos por WhatsApp.

Rastrea tu pedido en ${siteUrl}/rastrear con tu número de pedido y tu correo.`;

  return {
    subject: `Tu pedido ${data.orderNumber} viene de vuelta — te contactamos`,
    html: await renderEmailLayout({
      preview: "la transportadora no pudo entregarlo · te contactamos para resolverlo",
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
