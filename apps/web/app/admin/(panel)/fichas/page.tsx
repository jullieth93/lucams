/*
 * LEGACY (2026-09-15): /admin/fichas era un módulo hermano de /admin/disenos en el
 * grupo "Catálogo" — ambos alimentan el Estudio (diseños prediseñados + fichas del
 * abecedario) con el mismo guard MANAGER_UP. Se embebió como tab "Fichas del
 * abecedario" dentro de /admin/disenos y esta ruta queda como redirect permanente
 * (308) para que bookmarks y links viejos sigan llegando. Mismo patrón que el
 * redirect legacy de /admin/mensajes (N-09).
 */

import { redirect, permanentRedirect } from "next/navigation";
import { requireCapability } from "@/lib/admin-rbac-guard";

export default async function FichasLegacyRedirect() {
  // B-7: guard explícito antes del redirect para no filtrar rutas internas en
  // navegaciones soft de roles sin permisos sobre activos del Estudio.
  await requireCapability("production:manage_AssetsCatalog");
  permanentRedirect("/admin/disenos?tab=fichas");
  // unreachable — Next type checker quiere un return
  redirect("/admin/disenos?tab=fichas");
}
