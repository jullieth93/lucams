"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { AdminRole } from "@lucams/db";
import { recordAdminAction } from "@/lib/admin-audit";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import {
  AdminUserValidationError,
  changeAdminRole,
  promoteToAdmin,
  toggleAdminActive,
} from "@/features/admin-users/service";
import { logger } from "@/lib/logger";

const ROLES: readonly AdminRole[] = ["SUPERADMIN", "MANAGER", "FULFILLMENT", "CMS_EDITOR"];

export type PromoteAdminState = {
  error?: string;
  fieldErrors?: Partial<Record<"email" | "role", string[]>>;
};

export async function promoteAdminAction(
  _prev: PromoteAdminState | null,
  formData: FormData,
): Promise<PromoteAdminState> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.SUPER });

  const email = String(formData.get("email") ?? "").trim();
  const roleRaw = String(formData.get("role") ?? "");
  if (!ROLES.includes(roleRaw as AdminRole)) {
    return { error: "Rol inválido.", fieldErrors: { role: ["Rol inválido."] } };
  }
  const role = roleRaw as AdminRole;

  try {
    const promoted = await promoteToAdmin(email, role, session.admin.id);
    await recordAdminAction({
      actorId: session.admin.id,
      action: "admin.promote",
      entityType: "AdminUser",
      entityId: promoted.id,
      metadata: { email: promoted.email, role: promoted.role },
    });
    logger.info({
      event: "admin.user.promoted",
      adminId: session.admin.id,
      targetEmail: promoted.email,
      role: promoted.role,
    });
    revalidatePath("/admin/usuarios");
    redirect("/admin/usuarios?promoted=1");
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    if (err instanceof AdminUserValidationError) {
      return {
        error: err.message,
        fieldErrors: { [err.field]: [err.message] } as PromoteAdminState["fieldErrors"],
      };
    }
    logger.error({
      event: "admin.user.promote_fail",
      adminId: session.admin.id,
      err: err instanceof Error ? err.message : String(err),
    });
    return { error: "Error al promover. Reintenta." };
  }
}

export async function changeAdminRoleAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.SUPER });

  const id = String(formData.get("id") ?? "");
  const newRole = String(formData.get("role") ?? "") as AdminRole;
  if (!ROLES.includes(newRole)) {
    redirect(`/admin/usuarios?error=${encodeURIComponent("Rol inválido.")}`);
  }

  try {
    const updated = await changeAdminRole(id, newRole, session.admin.id);
    await recordAdminAction({
      actorId: session.admin.id,
      action: "admin.role_change",
      entityType: "AdminUser",
      entityId: id,
      metadata: { newRole: updated.role, email: updated.email },
    });
    revalidatePath("/admin/usuarios");
    redirect("/admin/usuarios?role_changed=1");
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    const msg = err instanceof AdminUserValidationError ? err.message : "Error al cambiar rol.";
    redirect(`/admin/usuarios?error=${encodeURIComponent(msg)}`);
  }
}

export async function toggleAdminActiveAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.SUPER });

  const id = String(formData.get("id") ?? "");
  try {
    const updated = await toggleAdminActive(id, session.admin.id);
    await recordAdminAction({
      actorId: session.admin.id,
      action: updated.isActive ? "admin.activate" : "admin.deactivate",
      entityType: "AdminUser",
      entityId: id,
      metadata: { email: updated.email, isActive: updated.isActive },
    });
    revalidatePath("/admin/usuarios");
    redirect(`/admin/usuarios?${updated.isActive ? "activated" : "deactivated"}=1`);
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    const msg = err instanceof AdminUserValidationError ? err.message : "Error al cambiar estado.";
    redirect(`/admin/usuarios?error=${encodeURIComponent(msg)}`);
  }
}
