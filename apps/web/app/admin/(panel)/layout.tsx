/*
 * Layout del Route Group (panel) — admin con sidebar permanente.
 *
 * PLAN_CATALOG_V2 8.1. Aplica a TODAS las pantallas admin excepto /admin/login.
 * Verifica sesión + obtiene admin info para pasar al sidebar.
 *
 * Proxy.ts ya garantiza que el usuario está logueado y es admin activo
 * para `/admin/*` (excepto /admin/login). Acá hacemos double-check
 * defensivo y rendereamos el shell con info del admin.
 */

import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { getCurrentAdmin } from "@/lib/auth";

export default async function AdminPanelLayout({ children }: { children: ReactNode }) {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  return (
    <AdminShell admin={{ email: session.admin.email, role: session.admin.role }}>
      {children}
    </AdminShell>
  );
}
