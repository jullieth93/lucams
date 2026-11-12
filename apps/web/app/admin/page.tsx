/*
 * /admin raíz — resuelve el home real según el rol activo (`adminHomePath`):
 * roles operativos aterrizan en `/admin/dashboard`; `CMS_EDITOR` aterriza en
 * `/admin/contenido` sin rebote `?denied=1`. Sin sesión admin redirige a `/admin/login`.
 */

import { redirect } from "next/navigation";
import { adminHomePath } from "@/lib/admin-rbac";
import { getCurrentAdmin } from "@/lib/auth";

export default async function AdminRootPage() {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");
  redirect(adminHomePath(session.admin.role));
}
