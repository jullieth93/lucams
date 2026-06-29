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
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AdminPanelLayout({ children }: { children: ReactNode }) {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  // Candado MFA (Bloque C / A6): si la cuenta tiene 2 pasos activos pero la
  // sesión sigue en aal1 (solo contraseña), exigir el reto antes del panel.
  const supabase = await createSupabaseServerClient();
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal && aal.nextLevel === "aal2" && aal.currentLevel === "aal1") {
    redirect("/admin/login/mfa");
  }

  return (
    <AdminShell admin={{ email: session.admin.email, role: session.admin.role }}>
      {children}
    </AdminShell>
  );
}
