/*
 * Admin > Canales — el grupo no tiene página propia: su primer módulo real es
 * "Tienda Lucams". Sin este redirect, entrar a /admin/canales caía en el
 * catch-all [...placeholder], que hace notFound() porque el grupo no tiene href.
 */

import { redirect } from "next/navigation";

export default function CanalesPage() {
  redirect("/admin/canales/tienda");
}
