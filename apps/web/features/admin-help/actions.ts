"use server";

import { revalidatePath } from "next/cache";
import { recordAdminAction } from "@/lib/admin-audit";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { logger } from "@/lib/logger";
import {
  GetContextualHelpSchema,
  SaveHelpProgressSchema,
  SubmitHelpFeedbackSchema,
} from "./schemas";
import {
  getContextualHelpForPathname,
  saveAdminHelpProgress,
  submitAdminHelpFeedback,
} from "./service";
import type { AdminHelpProgress, AdminModuleGuide, AdminSubrouteFocus } from "./types";

export type AdminHelpActionResult =
  { ok: true; progress?: AdminHelpProgress; message: string } | { ok: false; message: string };

export type ContextualHelpActionResult =
  | {
      ok: true;
      guide: AdminModuleGuide;
      subroute: AdminSubrouteFocus | null;
      progress: AdminHelpProgress | null;
      feedback: { isHelpful: boolean; comment: string | null } | null;
    }
  | { ok: false; message: string };

export async function getContextualHelpAction(input: unknown): Promise<ContextualHelpActionResult> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.ALL_PLUS_CMS });
  const parsed = GetContextualHelpSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "No pudimos resolver la ruta actual del panel." };
  }

  const resolved = await getContextualHelpForPathname({
    adminUserId: session.admin.id,
    role: session.admin.role,
    pathname: parsed.data.pathname,
  });
  if (!resolved) {
    return { ok: false, message: "No hay guía autorizada para esta pantalla." };
  }

  return { ok: true, ...resolved };
}

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
  revalidatePath("/admin/ayuda");
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

  await recordAdminAction({
    actorId: session.admin.id,
    action: "help.feedback_submit",
    entityType: "AdminHelpFeedback",
    entityId: parsed.data.guideId,
    metadata: {
      isHelpful: parsed.data.isHelpful,
      hasComment: Boolean(parsed.data.comment),
    },
  });
  logger.info({
    event: "admin_help.feedback_submitted",
    actorId: session.admin.id,
    guideId: parsed.data.guideId,
    isHelpful: parsed.data.isHelpful,
  });
  revalidatePath("/admin/ayuda");

  return { ok: true, message: "Gracias por ayudarnos a mejorar esta guía." };
}
