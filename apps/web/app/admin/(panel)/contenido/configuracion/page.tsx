/*
 * LEGACY (CMS v2): los SiteSetting ahora son campos kind SETTING de la
 * página "global" (Ajustes del sitio). Se conserva la ruta como redirect
 * para no romper enlaces viejos (nav, docs, marcadores).
 */

import { redirect } from "next/navigation";

export default function ConfiguracionLegacyRedirect() {
  redirect("/admin/contenido/paginas/global");
}
