/*
 * LEGACY (CMS v2): las plantillas de correo son los campos de la página
 * "emails" del CMS (sección Plantillas de correo). Se conserva la ruta
 * como redirect porque el NAV y docs la referencian desde hace tiempo.
 */

import { redirect } from "next/navigation";

export default function EmailTemplatesLegacyRedirect() {
  redirect("/admin/contenido/paginas/emails");
}
