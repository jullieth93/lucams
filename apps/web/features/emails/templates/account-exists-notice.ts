/*
 * Template: aviso "intentaron crear una cuenta con tu correo" (anti-enumeración,
 * auditoría 2026-08-24 · B-3). El registro responde lo mismo exista o no la
 * cuenta; el dueño real del correo recibe este aviso. Así el formulario deja de
 * ser un oráculo de emails registrados (misma política que login y reset).
 * es-CO tuteo.
 */

import { renderEmailLayout, ctaButton, getSiteUrl } from "../layout";

export async function accountExistsNoticeEmail() {
  const siteUrl = await getSiteUrl();
  const loginUrl = `${siteUrl}/login`;
  const resetUrl = `${siteUrl}/recuperar-password`;

  const bodyHtml = `
<h1 style="margin:0 0 12px 0;font-size:22px;color:#3D2E5C;">¿Intentaste crear una cuenta?</h1>
<p>Recibimos una solicitud de registro con <strong>este correo</strong>, pero ya tienes una cuenta en Lucams_shop.</p>
<p>Si fuiste tú, inicia sesión directamente. ¿No recuerdas tu contraseña? <a href="${resetUrl}" style="color:#7C6AAD;">Restablécela aquí</a>.</p>
${ctaButton(loginUrl, "Iniciar sesión →")}
<p style="font-size:13px;color:#3D2E5C;opacity:0.65;margin-top:18px;">Si no fuiste tú, ignora este correo: nadie puede crear otra cuenta con tu correo y tu cuenta sigue protegida.</p>
`;

  const text = `¿Intentaste crear una cuenta?

Recibimos una solicitud de registro con este correo, pero ya tienes una cuenta en Lucams_shop.

Si fuiste tú, inicia sesión: ${loginUrl}
¿No recuerdas tu contraseña? Restablécela aquí: ${resetUrl}

Si no fuiste tú, ignora este correo: nadie puede crear otra cuenta con tu correo y tu cuenta sigue protegida.`;

  return {
    subject: "¿Intentaste crear una cuenta en Lucams_shop?",
    html: await renderEmailLayout({
      preview: "Tu correo ya tiene una cuenta — inicia sesión o restablece tu contraseña.",
      bodyHtml,
    }),
    text,
  };
}
