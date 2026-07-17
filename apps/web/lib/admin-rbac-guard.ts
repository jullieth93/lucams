import "server-only";

/*
 * Guard de RBAC del servidor. Usar al INICIO de una página/acción admin sensible.
 */

import { redirect } from "next/navigation";
import type { AdminRole } from "@lucams/db";
import { getCurrentAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Guard central para Server Actions admin mutantes (auditoría 2026-07-16, ADR-062 P0-1).
 *
 * Valida, en orden y SIEMPRE en el servidor:
 *   1. Sesión admin activa (getCurrentAdmin). Si no → /admin/login.
 *   2. MFA aal2 (por defecto): si la cuenta tiene 2 pasos activos (nextLevel="aal2")
 *      pero la sesión sigue en "aal1" (solo contraseña) → /admin/login/mfa. Cierra el
 *      hueco de que el candado MFA solo vivía en el render del layout, no en las
 *      acciones — que Next expone como endpoints POST invocables directo. Sin esto,
 *      una contraseña robada bastaba para invocar cualquier mutación (reembolsos,
 *      auto-promoción a SUPERADMIN vía promoteAdminAction) saltándose el 2º factor.
 *   3. Rol permitido (si se pasan `roles`). Si no → /admin/dashboard?denied=1.
 *
 * redirect() aborta la acción (lanza NEXT_REDIRECT), por eso DEBE invocarse al INICIO
 * de la acción, antes de cualquier try/catch que pudiera tragarse la excepción.
 *
 * Devuelve la misma sesión que getCurrentAdmin ({ user, admin }) ya validada.
 */
export async function requireAdminAction(
  opts: { roles?: readonly AdminRole[]; aal2?: boolean } = {},
) {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  if (opts.aal2 !== false) {
    const supabase = await createSupabaseServerClient();
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal && aal.nextLevel === "aal2" && aal.currentLevel === "aal1") {
      redirect("/admin/login/mfa");
    }
  }

  if (opts.roles && !opts.roles.includes(session.admin.role)) {
    redirect("/admin/dashboard?denied=1");
  }
  return session;
}

/**
 * Compat: verifica sesión + rol permitido. Ahora también exige MFA aal2 (delegando
 * en requireAdminAction), así que las pantallas/acciones que ya lo usaban ganan el
 * enforcement de 2º factor sin cambios.
 */
export async function requireRole(allowed: readonly AdminRole[]) {
  return requireAdminAction({ roles: allowed });
}
