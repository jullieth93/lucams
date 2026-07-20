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
import { headers } from "next/headers";
import { AdminShell } from "@/components/admin-shell";
import { getCurrentAdmin } from "@/lib/auth";
import { canAccessAdminPath } from "@/lib/admin-rbac";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Todo el panel admin es SIEMPRE dinámico: exige sesión + datos vivos de la BD, nunca debe
// prerenderizarse en el build. Además evita el bug de prerender estático de Next 16 (useContext
// null en generación estática) que afloraba en /admin/contenido/bloques y /admin/usuarios. Ver
// ADR-073.
export const dynamic = "force-dynamic";

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

  // Guard RBAC server-side (auditoría 2026-07-13): la matriz ruta→rol se ENFORCEA aquí,
  // no solo en el menú (que es UX, no seguridad). El pathname viene del proxy (x-pathname,
  // autoritativo). Un rol sin permiso para la ruta se redirige a su dashboard.
  const pathname = (await headers()).get("x-pathname") ?? "";
  if (pathname.startsWith("/admin") && !canAccessAdminPath(session.admin.role, pathname)) {
    redirect("/admin/dashboard?denied=1");
  }

  return (
    <AdminShell admin={{ email: session.admin.email, role: session.admin.role }}>
      {children}
    </AdminShell>
  );
}
