/*
 * Email layout base — HTML transaccional kawaii.
 *
 * Sin react-email (decisión J): templates como funciones que devuelven
 * string HTML. Inline CSS porque varios clientes (Gmail, Outlook web)
 * filtran <style> tags.
 *
 * Estructura:
 *  - Header con marca (logo emoji + nombre)
 *  - Body con padding generoso
 *  - Footer con unsubscribe (Ley 1581) + dirección
 *
 * Tokens brand inline para que se vea consistente con el storefront
 * sin requerir CSS externo.
 */

import { getSettingValue } from "@/lib/cms";

export type EmailLayoutOptions = {
  preview?: string; // texto del preview pane de Gmail / Apple Mail
  unsubscribeUrl?: string; // si null, no se muestra (transaccional puro)
  bodyHtml: string;
};

const BRAND_PURPLE = "#7C6AAD";
const BRAND_PURPLE_DARK = "#3D2E5C";
const BRAND_CREAM = "#FFF8F0";
const BRAND_PINK = "#E85B9F";

export async function renderEmailLayout(opts: EmailLayoutOptions): Promise<string> {
  const [contactEmail, copyrightYear, footerTagline] = await Promise.all([
    getSettingValue("CONTACT_EMAIL", "hola@lucamsshop.co"),
    getSettingValue("COPYRIGHT_YEAR", String(new Date().getFullYear())),
    getSettingValue("COPYRIGHT_TAGLINE", "Hecho con 💜 en Bogotá"),
  ]);

  const previewHtml = opts.preview
    ? `<div style="display:none;max-height:0;overflow:hidden;font-size:0;line-height:0;color:transparent;mso-hide:all;">${escapeHtml(opts.preview)}</div>`
    : "";

  return `<!doctype html>
<html lang="es-CO">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lucams_shop</title>
</head>
<body style="margin:0;padding:0;background:${BRAND_CREAM};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND_PURPLE_DARK};">
${previewHtml}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${BRAND_CREAM};padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(124,106,173,0.08);">
      <tr><td style="padding:20px 28px;background:linear-gradient(135deg,${BRAND_PURPLE} 0%,${BRAND_PURPLE_DARK} 100%);color:#ffffff;">
        <div style="font-size:22px;font-weight:700;letter-spacing:0.2px;">
          Lucams<span style="color:${BRAND_PINK};">_shop</span>
        </div>
      </td></tr>
      <tr><td style="padding:28px;font-size:15px;line-height:1.6;">
${opts.bodyHtml}
      </td></tr>
      <tr><td style="padding:18px 28px;background:${BRAND_CREAM};font-size:12px;line-height:1.5;color:${BRAND_PURPLE_DARK};opacity:0.7;">
        <p style="margin:0 0 6px 0;">¿Dudas? Escríbenos a <a href="mailto:${contactEmail}" style="color:${BRAND_PURPLE};text-decoration:none;">${contactEmail}</a></p>
        <p style="margin:0;">© ${escapeHtml(copyrightYear)} Lucams_shop · ${escapeHtml(footerTagline)}</p>
        ${
          opts.unsubscribeUrl
            ? `<p style="margin:6px 0 0 0;font-size:11px;"><a href="${escapeHtml(opts.unsubscribeUrl)}" style="color:${BRAND_PURPLE};text-decoration:underline;">Cancelar suscripción</a> · Ley 1581 de 2012</p>`
            : ""
        }
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

/** Util: escape HTML para evitar XSS al interpolar datos del usuario. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Botón CTA brand-purple usable dentro del body. */
export function ctaButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;"><tr><td>
<a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 24px;background:${BRAND_PURPLE};color:#ffffff;text-decoration:none;border-radius:9999px;font-weight:600;font-size:14px;">${escapeHtml(label)}</a>
</td></tr></table>`;
}
