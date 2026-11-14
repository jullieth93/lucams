/*
 * LEGACY (CMS v2): crear bloque ya no existe como pantalla — los campos
 * nuevos se crean desde cada sección en el editor de página
 * (/admin/contenido/paginas/[slug], "Agregar campo").
 */

import { redirect } from "next/navigation";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { requireRole } from "@/lib/admin-rbac-guard";

export default async function NuevoBloqueLegacyRedirect() {
  await requireRole(ADMIN_ROLE_SETS.CONTENT);
  redirect("/admin/contenido");
}
