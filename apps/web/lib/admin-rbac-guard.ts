import "server-only";

/*
 * Guard de RBAC del servidor por Rol y por Capacidad (`AdminCapability`) + MFA `aal2`.
 * Usar al INICIO de toda página RSC, Server Action o Route Handler administrativo.
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
import { adminHomePath, hasCapability, type AdminCapability } from "@/lib/admin-rbac";
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
 * Guard no-redirigente para Route Handlers (`route.ts`) administrativos ([SEC-01] + S17).
 * Acepta filtro por `roles` y/o por `capability` granular.
 */
export async function verifyAdminRouteAccess(
  opts: {
    roles?: readonly AdminRole[];
    capability?: AdminCapability;
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
  let factors: { all?: Array<{ factor_type: string; status: string }> } | null = null;
  try {
    const res = await supabase.auth.mfa.listFactors();
    if (res.error || !res.data) {
      return { ok: false, status: 403, reason: "MFA_REQUIRED" };
    }
    factors = res.data;
  } catch {
    return { ok: false, status: 403, reason: "MFA_REQUIRED" };
  }

  const hasVerifiedTotp = (factors.all ?? []).some(
    (f) => f.factor_type === "totp" && f.status === "verified",
  );
  if (!hasVerifiedTotp) {
    return { ok: false, status: 403, reason: "MFA_NOT_ENROLLED" };
  }

  let currentAal: string | null = null;
  try {
    const { data: aal, error: aalErr } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalErr || !aal) {
      return { ok: false, status: 403, reason: "MFA_REQUIRED" };
    }
    currentAal = aal.currentLevel;
  } catch {
    return { ok: false, status: 403, reason: "MFA_REQUIRED" };
  }
  if (currentAal !== "aal2") {
    return { ok: false, status: 403, reason: "MFA_REQUIRED" };
  }

  if (opts.capability && !hasCapability(session.admin.role, opts.capability)) {
    return { ok: false, status: 403, reason: "FORBIDDEN_ROLE" };
  }

  if (opts.roles && !opts.roles.includes(session.admin.role)) {
    return { ok: false, status: 403, reason: "FORBIDDEN_ROLE" };
  }

  return { ok: true, session };
}

/**
 * Guard central para Server Actions y páginas admin (ADR-062 P0-1 + S17 Capability RBAC).
 *
 * Verifica siempre en el servidor:
 *   1. Sesión admin activa (`getCurrentAdmin`).
 *   2. Factor TOTP verificado obligatorio (B-1).
 *   3. Nivel MFA `aal2` activo (salvo `aal2: false` explícito).
 *   4. `capability` granular y/o conjunto `roles` permitido.
 */
export async function requireAdminAction(
  opts: {
    roles?: readonly AdminRole[];
    capability?: AdminCapability;
    aal2?: boolean;
    /**
     * Reservado EXCLUSIVAMENTE para el Server Component de `/admin/seguridad`
     * (enrolamiento TOTP inicial cuando `listFactors()` confirma 0 factores
     * verificados). Jamás activar en Server Actions mutantes.
     */
    allowMfaEnrollment?: boolean;
  } = {},
) {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const supabase = await createSupabaseServerClient();
  const readIsSecurityEnrollmentPath = async (): Promise<boolean> => {
    try {
      const pathname = (await headers()).get("x-pathname") ?? "";
      return pathname.startsWith("/admin/seguridad");
    } catch {
      return false;
    }
  };

  let factors: { all?: Array<{ factor_type: string; status: string }> } | null = null;
  let factorsFailed = false;
  try {
    const res = await supabase.auth.mfa.listFactors();
    if (res.error || !res.data) {
      factorsFailed = true;
    } else {
      factors = res.data;
    }
  } catch {
    factorsFailed = true;
  }

  if (factorsFailed || !factors) {
    // Fail-closed: si no podemos consultar factores MFA, jamás asumimos "sin
    // factor" en /admin/seguridad (eso degradaría una cuenta enrolada a aal1
    // ni provocaría un bucle redirigiendo a la misma ruta).
    const isSecurityEnrollmentPath = await readIsSecurityEnrollmentPath();
    redirect(isSecurityEnrollmentPath ? "/admin/login" : "/admin/seguridad?enroll=required");
  }

  const hasVerifiedTotp = (factors.all ?? []).some(
    (f) => f.factor_type === "totp" && f.status === "verified",
  );

  const isInitialEnrollmentView =
    !hasVerifiedTotp && opts.allowMfaEnrollment === true && (await readIsSecurityEnrollmentPath());

  if (!hasVerifiedTotp && !isInitialEnrollmentView) {
    redirect("/admin/seguridad?enroll=required");
  }

  if (opts.aal2 !== false && !isInitialEnrollmentView) {
    let currentAal: string | null = null;
    try {
      const { data: aal, error: aalErr } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (!aalErr && aal) {
        currentAal = aal.currentLevel;
      }
    } catch {
      currentAal = null;
    }
    if (currentAal !== "aal2") {
      redirect("/admin/login/mfa");
    }
  }

  if (opts.capability && !hasCapability(session.admin.role, opts.capability)) {
    redirect(`${adminHomePath(session.admin.role)}?denied=1`);
  }

  if (opts.roles && !opts.roles.includes(session.admin.role)) {
    redirect(`${adminHomePath(session.admin.role)}?denied=1`);
  }

  return session;
}

/**
 * Guard declarativo por capacidad granular (`AdminCapability`) + MFA `aal2`.
 */
export async function requireCapability(capability: AdminCapability) {
  return requireAdminAction({ capability });
}

/**
 * Compat: verifica sesión + rol permitido + MFA `aal2`.
 */
export async function requireRole(allowed: readonly AdminRole[]) {
  return requireAdminAction({ roles: allowed });
}
