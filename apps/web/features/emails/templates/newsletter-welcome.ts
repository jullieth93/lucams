/*
 * Template: Bienvenida al newsletter post-suscripción.
 *
 * Single opt-in (no double): el subscriber se confirma con un click
 * "Acepto recibir comunicaciones" en el form. Este email es
 * agradecimiento + setting expectativas + unsubscribe ya operativo.
 */

import { renderEmailLayout, ctaButton } from "../layout";
import { getSettingValue } from "@/lib/cms";

export type NewsletterWelcomeData = {
  email: string; // P0-005: va en el URL junto al token (el token solo verifica).
  unsubscribeToken: string;
};

export async function newsletterWelcomeEmail(data: NewsletterWelcomeData) {
  const siteUrl = await getSettingValue("SITE_URL", "https://lucamsshop.co");
  // #8 — parámetro opaco `u` (base64url(email).token): el email ya NO viaja en claro en la URL.
  const u = `${Buffer.from(data.email.trim().toLowerCase(), "utf-8").toString("base64url")}.${data.unsubscribeToken}`;
  const unsubscribeUrl = `${siteUrl}/unsubscribe?u=${u}`;

  const bodyHtml = `
<h1 style="margin:0 0 12px 0;font-size:22px;color:#3D2E5C;">¡Estás dentro! 💜</h1>
<p>Gracias por sumarte al newsletter de <strong>Lucams_shop</strong>.</p>
<p>Una vez al mes (a veces menos, prometido), te vamos a contar:</p>
<ul style="padding-left:20px;margin:12px 0;">
  <li>Lanzamientos kawaii nuevos</li>
  <li>Promos y descuentos exclusivos</li>
  <li>Curaduría de los imanes más enamorados</li>
</ul>
<p>Sin spam. Te puedes dar de baja cuando quieras desde el link del final.</p>
${ctaButton(`${siteUrl}/productos`, "Mientras tanto, mira el catálogo →")}
<p style="font-size:13px;color:#3D2E5C;opacity:0.65;margin-top:18px;">Te suscribiste desde nuestro sitio. Si fue por error, haz click en "Cancelar suscripción" al final de este email.</p>
`;

  const text = `¡Estás dentro!

Gracias por sumarte al newsletter de Lucams_shop.

Una vez al mes (a veces menos) te vamos a contar:
- Lanzamientos kawaii nuevos
- Promos y descuentos exclusivos
- Curaduría de los imanes más enamorados

Sin spam. Te puedes dar de baja cuando quieras.

Mientras tanto, mira el catálogo:
${siteUrl}/productos

Cancelar suscripción: ${unsubscribeUrl}`;

  return {
    subject: "¡Estás dentro! 💜",
    html: await renderEmailLayout({
      preview: "Gracias por sumarte. Esto es lo que viene.",
      unsubscribeUrl,
      bodyHtml,
    }),
    text,
  };
}
