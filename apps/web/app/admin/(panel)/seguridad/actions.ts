"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordAdminAction } from "@/lib/admin-audit";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { logger } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateRecoveryCodes } from "@/features/admin-mfa/recovery-codes";

async function unenrollAllTotp(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.mfa.listFactors();
  for (const f of data?.all ?? []) {
    if (f.factor_type === "totp") {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
  }
}

/** Desactiva (unenroll) los factores TOTP del admin actual + borra recovery codes. */
export async function disableMfaAction(): Promise<void> {
  // Autoservicio de la PROPIA cuenta (session.admin.id): con MFA obligatorio para
  // todo rol (B-1), la pantalla y sus acciones son ALL_PLUS_CMS. aal2 se mantiene.
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.ALL_PLUS_CMS });

  await unenrollAllTotp();
  await prismaDeleteRecoveryCodes(session.admin.id);

  logger.info({ event: "security.admin_mfa_disabled", adminId: session.admin.id });
  await recordAdminAction({
    actorId: session.admin.id,
    action: "admin.mfa.disable",
    entityType: "AdminUser",
    entityId: session.admin.id,
  });
  revalidatePath("/admin/seguridad");
}

/**
 * Cambiar de autenticador/dispositivo: desactiva el TOTP actual y manda a
 * configurar uno nuevo. Tras el unenroll la sesión queda sin factor: el gate de
 * enrolamiento obligatorio (B-1) la deja justo donde va el redirect de abajo
 * (/admin/seguridad, la excepción abierta a todos los roles).
 */
export async function changeMfaDeviceAction(): Promise<void> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.ALL_PLUS_CMS });

  await unenrollAllTotp();
  logger.info({ event: "security.admin_mfa_device_change", adminId: session.admin.id });
  await recordAdminAction({
    actorId: session.admin.id,
    action: "admin.mfa.change_device",
    entityType: "AdminUser",
    entityId: session.admin.id,
  });
  revalidatePath("/admin/seguridad");
  redirect("/admin/seguridad?reconfig=1");
}

export type RecoveryCodesState = { codes?: string[]; error?: string };

/** Genera (o regenera) los códigos de respaldo y los devuelve para mostrarlos una vez. */
export async function generateRecoveryCodesAction(): Promise<RecoveryCodesState> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.ALL_PLUS_CMS });

  const codes = await generateRecoveryCodes(session.admin.id);
  logger.info({ event: "security.admin_mfa_recovery_generated", adminId: session.admin.id });
  await recordAdminAction({
    actorId: session.admin.id,
    action: "admin.mfa.recovery_codes.generate",
    entityType: "AdminUser",
    entityId: session.admin.id,
  });
  revalidatePath("/admin/seguridad");
  return { codes };
}

// Import perezoso para no acoplar el delete al feature module en disable.
async function prismaDeleteRecoveryCodes(adminUserId: string): Promise<void> {
  const { prisma } = await import("@/lib/db");
  await prisma.adminRecoveryCode.deleteMany({ where: { adminUserId } });
}
