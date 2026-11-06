"use server";

import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { SaveHelpProgressSchema, SubmitHelpFeedbackSchema } from "./schemas";
import { saveAdminHelpProgress, submitAdminHelpFeedback } from "./service";
import type { AdminHelpProgress } from "./types";

export type AdminHelpActionResult =
  { ok: true; progress?: AdminHelpProgress; message: string } | { ok: false; message: string };

export async function saveHelpProgressAction(input: unknown): Promise<AdminHelpActionResult> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.ALL_PLUS_CMS });
  const parsed = SaveHelpProgressSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "No pudimos validar el avance de la guía." };

  const progress = await saveAdminHelpProgress({
    adminUserId: session.admin.id,
    role: session.admin.role,
    ...parsed.data,
  });
  if (!progress) return { ok: false, message: "La guía no está disponible para tu rol." };
  return { ok: true, progress, message: "Avance guardado." };
}

export async function submitHelpFeedbackAction(input: unknown): Promise<AdminHelpActionResult> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.ALL_PLUS_CMS });
  const parsed = SubmitHelpFeedbackSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Revisa el comentario: puede tener máximo 1000 caracteres." };
  }

  const saved = await submitAdminHelpFeedback({
    adminUserId: session.admin.id,
    role: session.admin.role,
    ...parsed.data,
  });
  if (!saved) return { ok: false, message: "La guía no está disponible para tu rol." };
  return { ok: true, message: "Gracias por ayudarnos a mejorar esta guía." };
}
