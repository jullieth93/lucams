import "server-only";

/*
 * Guard de RBAC del servidor. Usar al INICIO de una página/acción admin sensible.
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { AdminRole } from "@lucams/db";
import { getCurrentAdmin } from "@/lib/auth";
import {
  ADMIN_ACTIVITY_COOKIE,
  ADMIN_IDLE_LIMIT_MS,
  readAdminActivityMark,
} from "@/lib/admin-activity";
import { adminHomePath } from "@/lib/admin-rbac";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function readCookieFromRequest(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

export type AdminRouteAccessResult =
  | { ok: true; session: NonNullable<Awaited<ReturnType<typeof getCurrentAdmin>>> }
  | {
      ok: false;
      status: 401 | 403;
      reason:
        "UNAUTHENTICATED" | "IDLE_EXPIRED" | "MFA_NOT_ENROLLED" | "MFA_REQUIRED" | "FORBIDDEN_ROLE";
    };

/**
 * Guard no-redirigente para Route Handlers (`route.ts`) que requieren privilegios
 * administrativos ([SEC-01], auditoría 2026-11).
 *
 * Los Route Handlers no pasan por `app/admin/(panel)/layout.tsx`, por lo que
 * llamar únicamente a `getCurrentAdmin()` dejaba afuera el segundo factor TOTP
 * (`aal2`), el enrolamiento obligatorio de MFA, el filtro explícito de rol y
 * (en rutas bajo `/admin/*` donde el navegador envía `admin_last_activity`) el
 * idle-timeout de 30 min.
 *
 * NOTA sobre `checkIdle`: la cookie `admin_last_activity` tiene `Path=/admin`,
 * así que SOLO debe activarse en Route Handlers servidos bajo `/admin/*`
 * (nunca en `/api/*`, donde el navegador no adjunta esa cookie).
 */
export async function verifyAdminRouteAccess(
  opts: {
    roles?: readonly AdminRole[];
    req?: Request;
    checkIdle?: boolean;
  } = {},
): Promise<AdminRouteAccessResult> {
  const session = await getCurrentAdmin();
  if (!session) {
    return { ok: false, status: 401, reason: "UNAUTHENTICATED" };
  }

  if (opts.checkIdle && opts.req) {
    const rawMark = readCookieFromRequest(opts.req, ADMIN_ACTIVITY_COOKIE);
    const lastAt = readAdminActivityMark(rawMark);
    if (lastAt === null || Date.now() - lastAt > ADMIN_IDLE_LIMIT_MS) {
      return { ok: false, status: 401, reason: "IDLE_EXPIRED" };
    }
  }

  const supabase = await createSupabaseServerClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const hasVerifiedTotp = (factors?.all ?? []).some(
    (f) => f.factor_type === "totp" && f.status === "verified",
  );
  if (!hasVerifiedTotp) {
    return { ok: false, status: 403, reason: "MFA_NOT_ENROLLED" };
  }

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (!aal || aal.currentLevel !== "aal2") {
    return { ok: false, status: 403, reason: "MFA_REQUIRED" };
  }

  if (opts.roles && !opts.roles.includes(session.admin.role)) {
    return { ok: false, status: 403, reason: "FORBIDDEN_ROLE" };
  }

  return { ok: true, session };
}

/**
 * Guard central para Server Actions admin mutantes (auditoría 2026-07-16, ADR-062 P0-1).
 *
 * Valida, en orden y SIEMPRE en el servidor:
 *   1. Sesión admin activa (getCurrentAdmin). Si no → /admin/login.
 *   2. MFA ENROLADO (obligatorio, auditoría 2026-08-24 · B-1): si la cuenta NO tiene
 *      un factor TOTP verificado → /admin/seguridad?enroll=required. Sin este paso el
 *      candado aal2 de abajo era opt-in: Supabase solo reporta nextLevel="aal2" cuando
 *      YA existe un factor verificado, así que un admin sin MFA operaba el panel solo
 *      con contraseña (contra la política declarada en docs/SECURITY.md).
 *      Anti-loop: no se dispara si la request YA apunta a /admin/seguridad (la propia
 *      pantalla de enrolamiento) — el pathname lo setea el proxy (x-pathname,
 *      no spoofeable). El enrolamiento TOTP lo hace el SDK de Supabase en el cliente
 *      (le basta aal1), no Server Actions: ninguna acción necesita saltarse este check.
 *   3. MFA aal2 (por defecto): si la cuenta tiene 2 pasos activos (nextLevel="aal2")
 *      pero la sesión sigue en "aal1" (solo contraseña) → /admin/login/mfa. Cierra el
 *      hueco de que el candado MFA solo vivía en el render del layout, no en las
 *      acciones — que Next expone como endpoints POST invocables directo. Sin esto,
 *      una contraseña robada bastaba para invocar cualquier mutación (reembolsos,
 *      auto-promoción a SUPERADMIN vía promoteAdminAction) saltándose el 2º factor.
 *   4. Rol permitido (si se pasan `roles`). Si no → home del rol con ?denied=1
 *      (adminHomePath: dashboard para operativos, /admin/contenido para CMS_EDITOR).
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

  const supabase = await createSupabaseServerClient();

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const hasVerifiedTotp = (factors?.all ?? []).some(
    (f) => f.factor_type === "totp" && f.status === "verified",
  );
  if (!hasVerifiedTotp) {
    const pathname = (await headers()).get("x-pathname") ?? "";
    if (!pathname.startsWith("/admin/seguridad")) {
      redirect("/admin/seguridad?enroll=required");
    }
  }

  if (opts.aal2 !== false) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal && aal.nextLevel === "aal2" && aal.currentLevel === "aal1") {
      redirect("/admin/login/mfa");
    }
  }

  if (opts.roles && !opts.roles.includes(session.admin.role)) {
    // A SU home, no al dashboard fijo: CMS_EDITOR no tiene acceso a
    // /admin/dashboard y caería en un loop de redirects (ver adminHomePath).
    redirect(`${adminHomePath(session.admin.role)}?denied=1`);
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
