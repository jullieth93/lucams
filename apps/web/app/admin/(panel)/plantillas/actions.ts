"use server";

import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { isMfaReauthRequired, MFA_REAUTH_MESSAGE, requireRecentMfa } from "@/lib/admin-reauth";
import { recordAdminAction } from "@/lib/admin-audit";
import {
  setTemplateApproval,
  deleteTemplateIfOrphan,
} from "@/features/personalization/admin-templates";

export type TemplateActionState = {
  error?: string;
  success?: string;
  reauthRequired?: boolean;
};

type St = TemplateActionState | null;

/**
 * Aprobar (mostrar en el Estudio) u ocultar una plantilla. Gestión de activos
 * del Estudio → capability `production:manage_AssetsCatalog` (SUPERADMIN,
 * OPERATIONS_MANAGER y legacy MANAGER). `formData.approved` = "1" para aprobar.
 */
export async function setTemplateApprovalAction(_prev: St, formData: FormData): Promise<St> {
  const session = await requireAdminAction({ capability: "production:manage_AssetsCatalog" });

  const id = String(formData.get("id") ?? "");
  const approved = String(formData.get("approved") ?? "") === "1";
  if (!id) return { error: "Falta la plantilla." };

  try {
    await setTemplateApproval(id, approved, session.admin.id);
    await recordAdminAction({
      actorId: session.admin.id,
      action: approved ? "template.approve" : "template.hide",
      entityType: "PersonalizationTemplate",
      entityId: id,
    });
    revalidatePath("/admin/plantillas");
    return { success: approved ? "Plantilla aprobada ✨" : "Plantilla oculta" };
  } catch (err) {
    logger.warn({
      event: "admin.template.approval_fail",
      id,
      err: err instanceof Error ? err.message : String(err),
    });
    return { error: "No pudimos actualizar la plantilla." };
  }
}

/**
 * Eliminar DEFINITIVAMENTE una plantilla huérfana (owner 2026-09-14). La guarda
 * de deleteTemplateIfOrphan rechaza aprobadas y las que tienen diseños — esos
 * mensajes se muestran tal cual en la card. Por ser purga física irreversible,
 * exige MFA step-up reciente (≤10 min).
 */
export async function deleteTemplateAction(_prev: St, formData: FormData): Promise<St> {
  const session = await requireAdminAction({ capability: "production:manage_AssetsCatalog" });
  try {
    await requireRecentMfa();
  } catch (err) {
    if (isMfaReauthRequired(err)) {
      return { reauthRequired: true, error: MFA_REAUTH_MESSAGE };
    }
    throw err;
  }

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Falta la plantilla." };

  try {
    await deleteTemplateIfOrphan(id);
    await recordAdminAction({
      actorId: session.admin.id,
      action: "template.delete",
      entityType: "PersonalizationTemplate",
      entityId: id,
    });
    revalidatePath("/admin/plantillas");
    return { success: "Plantilla eliminada" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "No pudimos eliminar la plantilla.";
    logger.warn({ event: "admin.template.delete_fail", id, err: message });
    return { error: message };
  }
}
