/*
 * LEGACY (CMS v2): el editor de bloques fue reemplazado por el editor de
 * campos (/admin/contenido/campos/[id]). Los ids viejos son de CmsBlock
 * (modelo eliminado) y NO mapean a CmsField → se vuelve al índice.
 */

import { redirect } from "next/navigation";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { requireRole } from "@/lib/admin-rbac-guard";

export default async function EditorBloqueLegacyRedirect() {
  await requireRole(ADMIN_ROLE_SETS.CONTENT);
  redirect("/admin/contenido");
}
