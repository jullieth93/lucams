/*
 * Template: "¡Volvió!" (palanca de ingreso, auditoría 2026-07-13). Se envía cuando un producto al
 * que el cliente se suscribió ("avísame cuando vuelva") vuelve a tener stock. es-CO tuteo.
 */

import { renderEmailLayout, ctaButton } from "../layout";
import { getSettingValue } from "@/lib/cms";

export type BackInStockData = {
  productName: string;
  productSlug: string;
};

export async function backInStockEmail(data: BackInStockData) {
  const siteUrl = await getSettingValue("SITE_URL", "https://lucamsshop.co");
  const url = `${siteUrl}/producto/${encodeURIComponent(data.productSlug)}`;

  const bodyHtml = `
<h1 style="margin:0 0 12px 0;font-size:22px;color:#3D2E5C;">¡Volvió! 🎉</h1>
<p><strong>${escapeHtml(data.productName)}</strong> ya está disponible de nuevo. Nos avisaste que lo querías, ¡así que corre antes de que se agote otra vez!</p>
${ctaButton(url, "Verlo ahora →")}
<p style="font-size:13px;color:#3D2E5C;opacity:0.65;margin-top:18px;">Recibes este correo porque pediste que te avisáramos. No te escribiremos de nuevo por este producto.</p>
`;

  const text = `¡Volvió!

${data.productName} ya está disponible de nuevo. Nos avisaste que lo querías, ¡corre antes de que se agote!

Verlo: ${url}

Recibes este correo porque pediste que te avisáramos.`;

  return {
    subject: `¡Volvió! ${data.productName} está disponible 🎉`,
    html: await renderEmailLayout({
      preview: `${data.productName} volvió — corre antes de que se agote otra vez.`,
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
