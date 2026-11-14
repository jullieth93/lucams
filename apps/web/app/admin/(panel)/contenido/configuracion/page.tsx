/*
 * LEGACY (CMS v2): los SiteSetting ahora son campos kind SETTING de la
 * página "global" (Ajustes del sitio). Se conserva la ruta como redirect
 * para no romper enlaces viejos (nav, docs, marcadores).
 */

import { redirect } from "next/navigation";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { requireRole } from "@/lib/admin-rbac-guard";

export default async function ConfiguracionLegacyRedirect() {
  await requireRole(ADMIN_ROLE_SETS.SUPER);
  redirect("/admin/contenido/paginas/global");
}
