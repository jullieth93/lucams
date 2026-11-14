/*
 * LEGACY (CMS v2): la lista de bloques fue reemplazada por el índice de
 * páginas del sitio. Se conserva la ruta como redirect para no romper
 * enlaces viejos (emails, docs, marcadores).
 */

import { redirect } from "next/navigation";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { requireRole } from "@/lib/admin-rbac-guard";

export default async function BloquesLegacyRedirect() {
  await requireRole(ADMIN_ROLE_SETS.CONTENT);
  redirect("/admin/contenido");
}
