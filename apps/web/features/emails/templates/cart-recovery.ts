/*
 * Template: recuperación de carrito abandonado (palanca de ingreso, auditoría 2026-07-13). Se envía
 * ~4h después de que el cliente dejó el carrito con email (checkout) sin completar. El link de
 * recuperación restaura la sesión del carrito (incl. anónimo). es-CO tuteo.
 */

import { renderEmailLayout, ctaButton } from "../layout";
import { getSettingValue } from "@/lib/cms";

export type CartRecoveryData = {
  recoverToken: string;
  items: Array<{ name: string; qty: number }>;
  /** Enlace de baja visible (correo comercial). */
  unsubscribeUrl?: string;
};

export async function cartRecoveryEmail(data: CartRecoveryData) {
  const siteUrl = await getSettingValue("SITE_URL", "https://lucamsshop.com");
  const recoverUrl = `${siteUrl}/carrito/recuperar/${encodeURIComponent(data.recoverToken)}`;

  const itemsHtml = data.items
    .map((i) => `<li style="margin-bottom:4px;">${escapeHtml(i.name)} ×${i.qty}</li>`)
    .join("");
  const itemsText = data.items.map((i) => `- ${i.name} ×${i.qty}`).join("\n");

  const bodyHtml = `
<h1 style="margin:0 0 12px 0;font-size:22px;color:#3D2E5C;">¿Se te quedó algo? 🛒</h1>
<p>Hola, notamos que dejaste unos imanes en tu carrito. ¡Todavía te esperan!</p>
<ul style="padding-left:18px;color:#3D2E5C;">${itemsHtml}</ul>
${ctaButton(recoverUrl, "Retomar mi compra →")}
<p style="font-size:13px;color:#3D2E5C;opacity:0.65;margin-top:18px;">¿Tuviste algún problema para terminar? Responde este correo o escríbenos por WhatsApp y te ayudamos. 💜</p>
`;

  const text = `¿Se te quedó algo?

Hola, notamos que dejaste unos imanes en tu carrito. ¡Todavía te esperan!

${itemsText}

Retoma tu compra: ${recoverUrl}

¿Algún problema para terminar? Responde este correo o escríbenos por WhatsApp.`;

  return {
    subject: "¿Se te quedó algo en el carrito? 🛒",
    html: await renderEmailLayout({
      preview: "Tus imanes todavía te esperan — retoma tu compra en un clic.",
      unsubscribeUrl: data.unsubscribeUrl,
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
