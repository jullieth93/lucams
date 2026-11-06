"use server";

import { revalidatePath, updateTag } from "next/cache";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { isMfaReauthRequired, MFA_REAUTH_MESSAGE, requireRecentMfa } from "@/lib/admin-reauth";
import { recordAdminAction } from "@/lib/admin-audit";
import { captureServerError } from "@/lib/error-capture";
import {
  createLifecycleJourney,
  retryLifecycleMessage,
  sendLifecycleTest,
  setEnrollmentStatus,
  setLifecycleJourneyStatus,
  updateLifecycleJourney,
  LifecycleValidationError,
} from "./admin-service";
import {
  LifecycleEnrollmentActionSchema,
  LifecycleJourneyIdSchema,
  LifecycleJourneySchema,
  LifecycleMessageRetrySchema,
  LifecycleSettingsSchema,
  LifecycleTestSchema,
} from "./schemas";
import { saveLifecycleSettings } from "./settings";
import type { LifecycleJourneyInput } from "./types";

export type LifecycleActionResult = {
  ok: boolean;
  message: string;
  id?: string;
  reauthRequired?: boolean;
};

function actionFailure(error: unknown): LifecycleActionResult {
  if (isMfaReauthRequired(error)) {
    return { ok: false, message: MFA_REAUTH_MESSAGE, reauthRequired: true };
  }
  if (!(error instanceof LifecycleValidationError)) {
    void captureServerError({
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      routePath: "/admin/lifecycle",
      routeType: "action",
    });
  }
  return {
    ok: false,
    message:
      error instanceof LifecycleValidationError
        ? error.message
        : "No pudimos completar la acción. Revisa los datos e inténtalo nuevamente.",
  };
}

export async function createLifecycleJourneyAction(input: unknown): Promise<LifecycleActionResult> {
  const session = await requireAdminAction({ capability: "lifecycle:manage" });
  const parsed = LifecycleJourneySchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Revisa los campos y pasos del recorrido." };
  try {
    const journey = await createLifecycleJourney(
      parsed.data as LifecycleJourneyInput,
      session.admin.id,
    );
    await recordAdminAction({
      actorId: session.admin.id,
      action: "lifecycle.journey_create",
      entityType: "LifecycleJourney",
      entityId: journey.id,
      metadata: { key: journey.key, trigger: journey.trigger },
    });
    revalidatePath("/admin/lifecycle");
    return { ok: true, message: "Recorrido creado como borrador.", id: journey.id };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function updateLifecycleJourneyAction(input: unknown): Promise<LifecycleActionResult> {
  const session = await requireAdminAction({ capability: "lifecycle:manage" });
  const parsed = LifecycleJourneyIdSchema.merge(LifecycleJourneySchema).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Revisa los campos y pasos del recorrido." };
  try {
    if (parsed.data.status === "ACTIVE") await requireRecentMfa();
    const journey = await updateLifecycleJourney(
      parsed.data.journeyId,
      parsed.data as LifecycleJourneyInput,
      session.admin.id,
    );
    await recordAdminAction({
      actorId: session.admin.id,
      action: "lifecycle.journey_update",
      entityType: "LifecycleJourney",
      entityId: journey.id,
      metadata: { key: journey.key, version: journey.version, status: journey.status },
    });
    revalidatePath("/admin/lifecycle");
    revalidatePath(`/admin/lifecycle/${journey.id}`);
    return { ok: true, message: "Recorrido actualizado.", id: journey.id };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function setLifecycleJourneyStatusAction(
  input: unknown,
): Promise<LifecycleActionResult> {
  const session = await requireAdminAction({ capability: "lifecycle:manage" });
  const parsed = LifecycleJourneyIdSchema.extend({
    status: LifecycleJourneySchema.shape.status,
  }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "El estado seleccionado no es válido." };
  try {
    if (parsed.data.status === "ACTIVE") await requireRecentMfa();
    const journey = await setLifecycleJourneyStatus(
      parsed.data.journeyId,
      parsed.data.status,
      session.admin.id,
    );
    await recordAdminAction({
      actorId: session.admin.id,
      action: "lifecycle.journey_status",
      entityType: "LifecycleJourney",
      entityId: journey.id,
      metadata: { key: journey.key, status: journey.status, version: journey.version },
    });
    revalidatePath("/admin/lifecycle");
    revalidatePath(`/admin/lifecycle/${journey.id}`);
    return { ok: true, message: `Estado actualizado a ${journey.status}.` };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function sendLifecycleTestAction(input: unknown): Promise<LifecycleActionResult> {
  const session = await requireAdminAction({ capability: "lifecycle:manage" });
  const parsed = LifecycleTestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "El paso seleccionado no es válido." };
  try {
    await requireRecentMfa();
    const resendId = await sendLifecycleTest(parsed.data.journeyId, parsed.data.stepId, {
      email: session.admin.email,
      fullName: null,
    });
    await recordAdminAction({
      actorId: session.admin.id,
      action: "lifecycle.test_send",
      entityType: "LifecycleJourney",
      entityId: parsed.data.journeyId,
      metadata: { stepId: parsed.data.stepId ?? null },
    });
    return {
      ok: true,
      message:
        resendId === "dry-run"
          ? "Contenido validado en modo de prueba; no se envió ningún correo."
          : "Prueba enviada a tu correo.",
      id: resendId,
    };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function setEnrollmentStatusAction(input: unknown): Promise<LifecycleActionResult> {
  const session = await requireAdminAction({ capability: "lifecycle:manage" });
  const parsed = LifecycleEnrollmentActionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "La acción de inscripción no es válida." };
  try {
    const enrollment = await setEnrollmentStatus(parsed.data.enrollmentId, parsed.data.action);
    await recordAdminAction({
      actorId: session.admin.id,
      action: `lifecycle.enrollment_${parsed.data.action}`,
      entityType: "LifecycleEnrollment",
      entityId: enrollment.id,
      metadata: { status: enrollment.status },
    });
    revalidatePath(`/admin/lifecycle/${enrollment.journeyId}`);
    return { ok: true, message: "Inscripción actualizada." };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function retryLifecycleMessageAction(input: unknown): Promise<LifecycleActionResult> {
  const session = await requireAdminAction({ capability: "lifecycle:manage" });
  const parsed = LifecycleMessageRetrySchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "El mensaje seleccionado no es válido." };
  try {
    await requireRecentMfa();
    const message = await retryLifecycleMessage(parsed.data.messageId);
    await recordAdminAction({
      actorId: session.admin.id,
      action: "lifecycle.message_retry",
      entityType: "LifecycleMessage",
      entityId: message.id,
      metadata: { status: message.status },
    });
    revalidatePath(`/admin/lifecycle/${message.enrollment.journeyId}`);
    return { ok: true, message: "El mensaje quedó listo para un nuevo intento." };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function saveLifecycleSettingsAction(input: unknown): Promise<LifecycleActionResult> {
  const session = await requireAdminAction({ capability: "lifecycle:manage" });
  const parsed = LifecycleSettingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Revisa el interruptor y el límite global." };
  try {
    await requireRecentMfa();
    await saveLifecycleSettings(parsed.data, session.admin.id);
    await recordAdminAction({
      actorId: session.admin.id,
      action: "lifecycle.settings_update",
      entityType: "SystemSetting",
      entityId: "lifecycle",
      metadata: parsed.data,
    });
    updateTag("cms");
    revalidatePath("/admin/lifecycle");
    return {
      ok: true,
      message: parsed.data.enabled
        ? "Motor general activado y límite global actualizado."
        : "Motor general pausado. No se harán nuevas inscripciones ni ejecuciones.",
    };
  } catch (error) {
    return actionFailure(error);
  }
}
