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

import { Suspense, type ReactNode } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { AdminShell } from "@/components/admin-shell";
import { getCurrentAdmin } from "@/lib/auth";
import { canAccessAdminPath, adminHomePath } from "@/lib/admin-rbac";
import { getCmsImage } from "@/lib/cms";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUnreadCount } from "@/features/notifications/service";
import { AdminHelpLauncher } from "@/features/admin-help/components/help-launcher";
import {
  getHelpRouteIndex,
  getOnboardingForRole,
  getPlaybookIndex,
  getUnreadReleaseSummary,
} from "@/features/admin-help/registry";
import { getAdminHelpProgress } from "@/features/admin-help/service";

// Todo el panel admin es SIEMPRE dinámico: exige sesión + datos vivos de la BD, nunca debe
// prerenderizarse en el build. Además evita el bug de prerender estático de Next 16 (useContext
// null en generación estática) que afloraba en /admin/contenido/bloques y /admin/usuarios. Ver
// ADR-073.
export const dynamic = "force-dynamic";

export default async function AdminPanelLayout({ children }: { children: ReactNode }) {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const supabase = await createSupabaseServerClient();
  // Pathname autoritativo (lo setea el proxy, no spoofeable): lo comparten los
  // gates de MFA (abajo) y el guard RBAC de ruta (más abajo).
  const pathname = (await headers()).get("x-pathname") ?? "";

  // MFA OBLIGATORIO para todo rol admin (auditoría 2026-08-24 · B-1): sin factor
  // TOTP verificado no se renderiza ninguna pantalla del panel → enrolamiento
  // forzado. El candado aal2 de abajo solo aplica cuando YA existe factor;
  // este gate cubre al admin sin MFA (antes operaba el panel solo con
  // contraseña). /admin/seguridad es la excepción: es la pantalla de
  // enrolamiento misma (sin ella esto sería un loop de redirects).
  const { data: factors, error: factorsErr } = await supabase.auth.mfa.listFactors();
  if (factorsErr || !factors) {
    redirect("/admin/login");
  }
  const hasVerifiedTotp = (factors.all ?? []).some(
    (f) => f.factor_type === "totp" && f.status === "verified",
  );
  if (!hasVerifiedTotp) {
    if (!pathname.startsWith("/admin/seguridad")) {
      redirect("/admin/seguridad?enroll=required");
    }
  } else {
    // Candado MFA fail-closed (Bloque C / A6 + SEC-03): toda cuenta con factor TOTP
    // verificado requiere sesión estrictamente en `aal2`; null/error/aal1 van al reto.
    const { data: aal, error: aalErr } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalErr || !aal || aal.currentLevel !== "aal2") {
      redirect("/admin/login/mfa");
    }
  }

  // Guard RBAC server-side (auditoría 2026-07-13): la matriz ruta→rol se ENFORCEA aquí,
  // no solo en el menú (que es UX, no seguridad). Un rol sin permiso para la ruta se
  // redirige a SU home (adminHomePath): para CMS_EDITOR es /admin/contenido — mandarlo
  // al dashboard sería un loop de redirects porque tampoco tiene acceso ahí.
  if (pathname.startsWith("/admin") && !canAccessAdminPath(session.admin.role, pathname)) {
    redirect(`${adminHomePath(session.admin.role)}?denied=1`);
  }

  // Badge del centro de notificaciones (2026-08-05; Bloque 8 — acotado al rol):
  // cuenta únicamente las no leídas cuyo destino (`actionUrl`) pertenece al ámbito
  // RBAC del rol, evitando badges fantasma de alertas exclusivas de SUPERADMIN.
  const unreadNotifications = canAccessAdminPath(session.admin.role, "/admin/notificaciones")
    ? await getUnreadCount(session.admin.role)
    : 0;

  // Logo administrable del shell (Fase 3 · 3.9 — setting CMS `site.logo`,
  // cacheado con tag "cms"; null = insignia gradiente + wordmark de siempre).
  const siteLogo = await getCmsImage("site.logo");
  const helpProgress = await getAdminHelpProgress(session.admin.id);
  const routeIndex = getHelpRouteIndex(session.admin.role);
  const playbookIndex = getPlaybookIndex(session.admin.role);
  const onboarding = getOnboardingForRole(session.admin.role);
  const releaseSummary = getUnreadReleaseSummary(session.admin.role, helpProgress);

  return (
    <AdminShell
      admin={{ email: session.admin.email, role: session.admin.role }}
      unreadNotifications={unreadNotifications}
      logo={siteLogo ? { url: siteLogo.url, alt: siteLogo.alt } : null}
    >
      {children}
      <Suspense fallback={null}>
        <AdminHelpLauncher
          routeIndex={routeIndex}
          playbookIndex={playbookIndex}
          onboarding={onboarding}
          role={session.admin.role}
          initialProgress={helpProgress}
          releaseSummary={releaseSummary}
        />
      </Suspense>
    </AdminShell>
  );
}
