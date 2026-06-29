import "server-only";

/*
 * Guard de RBAC del servidor (Lucy 2026-06-27, Bloque C / A5). Usar al inicio de
 * una página/acción admin sensible: verifica sesión + rol permitido, si no redirige.
 */

import { redirect } from "next/navigation";
import type { AdminRole } from "@lucams/db";
import { getCurrentAdmin } from "@/lib/auth";

export async function requireRole(allowed: AdminRole[]) {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");
  if (!allowed.includes(session.admin.role)) redirect("/admin/dashboard?denied=1");
  return session;
}
