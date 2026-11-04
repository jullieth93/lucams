"use server";

/*
 * Server Actions para revisión humana de contactos duplicados (`/admin/clientes/duplicados` · S20).
 *
 * Seguridad mandatoria (cero suposiciones):
 *  - Guard N-21 en paridad con la ruta: `requireAdminAction({ capability: "contacts:merge" })`.
 *  - Fusión protegida por elevación reciente MFA TOTP (`requireRecentMfa()` <= 10 min);
 *    si venció, devuelve `{ reauthRequired: true }` para que `<ReauthForm>` abra `<MfaReauthModal>`.
 *  - Auditoría explícita en `AdminActionLog` (`contact.merge` y `contact.merge_reject`).
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordAdminAction } from "@/lib/admin-audit";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { isMfaReauthRequired, requireRecentMfa } from "@/lib/admin-reauth";
import {
  mergeContactsByHumanApproval,
  MergeValidationError,
  rejectMergeCandidate,
} from "@/features/identity/merge-service";
import { logger } from "@/lib/logger";

export async function approveContactMergeAction(
  formData: FormData,
): Promise<{ reauthRequired: true } | void> {
  const session = await requireAdminAction({ capability: "contacts:merge" });

  try {
    await requireRecentMfa();
  } catch (err) {
    if (isMfaReauthRequired(err)) return { reauthRequired: true };
    throw err;
  }

  const candidateId = String(formData.get("candidateId") ?? "").trim();
  const survivorContactId = String(formData.get("survivorContactId") ?? "").trim();
  const note =
    String(formData.get("note") ?? "")
      .trim()
      .slice(0, 500) || null;

  try {
    const result = await mergeContactsByHumanApproval({
      candidateId,
      survivorContactId,
      actorAdminId: session.admin.id,
      note,
    });

    await recordAdminAction({
      actorId: session.admin.id,
      action: "contact.merge",
      entityType: "Contact",
      entityId: result.survivorContactId,
      metadata: {
        candidateId: result.candidateId,
        survivorContactId: result.survivorContactId,
        absorbedContactId: result.absorbedContactId,
        movedCounts: result.movedCounts,
        note,
      },
    });

    logger.info({
      event: "admin.contact.merged",
      adminId: session.admin.id,
      candidateId: result.candidateId,
      survivorContactId: result.survivorContactId,
      absorbedContactId: result.absorbedContactId,
    });

    revalidatePath("/admin/clientes");
    revalidatePath("/admin/clientes/duplicados");
    revalidatePath(`/admin/clientes/${result.survivorContactId}`);
    redirect(
      `/admin/clientes/duplicados?merged=1&survivor=${encodeURIComponent(result.survivorContactId)}`,
    );
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    const msg =
      err instanceof MergeValidationError
        ? err.message
        : "No fue posible completar la fusión. Intenta nuevamente.";
    logger.error({
      event: "admin.contact.merge_failed",
      adminId: session.admin.id,
      candidateId,
      err: err instanceof Error ? err.message : String(err),
    });
    redirect(`/admin/clientes/duplicados?error=${encodeURIComponent(msg)}`);
  }
}

export async function rejectContactMergeAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ capability: "contacts:merge" });

  const candidateId = String(formData.get("candidateId") ?? "").trim();
  const note =
    String(formData.get("note") ?? "")
      .trim()
      .slice(0, 500) || null;

  try {
    const result = await rejectMergeCandidate({
      candidateId,
      actorAdminId: session.admin.id,
      note,
    });

    await recordAdminAction({
      actorId: session.admin.id,
      action: "contact.merge_reject",
      entityType: "IdentityMergeCandidate",
      entityId: result.candidateId,
      metadata: {
        primaryContactId: result.primaryContactId,
        secondaryContactId: result.secondaryContactId,
        note,
      },
    });

    revalidatePath("/admin/clientes");
    revalidatePath("/admin/clientes/duplicados");
    redirect("/admin/clientes/duplicados?rejected=1");
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    const msg =
      err instanceof MergeValidationError ? err.message : "No fue posible descartar la sugerencia.";
    redirect(`/admin/clientes/duplicados?error=${encodeURIComponent(msg)}`);
  }
}
