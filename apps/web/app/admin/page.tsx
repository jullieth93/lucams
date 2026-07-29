/*
 * /admin raíz — el panel vive en (panel)/dashboard. Sin este redirect, entrar
 * a /admin caía en 404 (el grupo (panel) no tiene página índice propia).
 * Mismo patrón que (panel)/canales/page.tsx → /admin/canales/tienda.
 */

import { redirect } from "next/navigation";

export default function AdminRootPage() {
  redirect("/admin/dashboard");
}
