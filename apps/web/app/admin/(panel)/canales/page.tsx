/*
 * Admin > Canales — el grupo no tiene página propia: su primer módulo real es
 * "Tienda Lucams". Sin este redirect, entrar a /admin/canales caía en el
 * catch-all [...placeholder], que hace notFound() porque el grupo no tiene href.
 */

import { redirect } from "next/navigation";
import { requireCapability } from "@/lib/admin-rbac-guard";

export default async function CanalesPage() {
  await requireCapability("catalog:write");
  redirect("/admin/canales/tienda");
}
