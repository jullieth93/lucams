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
  } = {},
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
