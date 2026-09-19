/*
 * Server Actions — Admin Plantillas de correo (Fase 4, feedback Lucy 2026-09-18).
 *
 * Patrón Lucams: actions delgadas, validación Zod aquí, requireAdminAction
 * defensivo (SUPERADMIN, igual que redirects/integraciones), AdminActionLog en
 * cada mutación. Al guardar/borrar un override se invalida el cache
 * "email-overrides" (updateTag) para que el próximo render —preview o envío—
 * use el texto nuevo de inmediato.
 */

"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { recordAdminAction } from "@/lib/admin-audit";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/lib/resend";
import { EMAIL_OVERRIDE_KEYS } from "@/features/emails/overrides";
import { getEmailTemplate } from "@/features/emails/registry";

export type EmailTemplateActionState = {
  error?: string;
  ok?: boolean;
  message?: string;
};

const SaveOverrideSchema = z.object({
  templateId: z.string().trim().min(1).max(80),
  key: z.enum(EMAIL_OVERRIDE_KEYS),
  // Vacío = quitar el override (vuelve el texto base del código).
  value: z.string().trim().max(500),
});

/**
 * Guarda (upsert) o borra (valor vacío) un override de texto. El consumo es
 * con fallback al copy base, así que borrar la fila restaura el original.
 */
export async function saveEmailOverrideAction(
  _prev: EmailTemplateActionState | null,
  formData: FormData,
): Promise<EmailTemplateActionState> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.SUPER });

  const parsed = SaveOverrideSchema.safeParse({
    templateId: formData.get("templateId"),
    key: formData.get("key"),
    value: formData.get("value") ?? "",
  });
  if (!parsed.success) return { error: "Datos inválidos. Revisa el campo e intenta de nuevo." };

  const { templateId, key, value } = parsed.data;
  if (!getEmailTemplate(templateId)) return { error: "Plantilla desconocida." };

  try {
    if (!value) {
      await prisma.emailTemplateOverride.deleteMany({ where: { templateId, key } });
    } else {
      await prisma.emailTemplateOverride.upsert({
        where: { templateId_key: { templateId, key } },
        create: { templateId, key, value, updatedBy: session.user.email ?? session.admin.id },
        update: { value, updatedBy: session.user.email ?? session.admin.id },
      });
    }
  } catch (err) {
    logger.error({
      event: "email_templates.override_save_fail",
      templateId,
      key,
      err: err instanceof Error ? err.message : String(err),
    });
    return { error: "No se pudo guardar. Intenta de nuevo en un momento." };
  }

  await recordAdminAction({
    actorId: session.admin.id,
    action: value ? "email_template.override_save" : "email_template.override_clear",
    entityType: "EmailTemplateOverride",
    entityId: `${templateId}:${key}`,
    metadata: { templateId, key },
  });

  updateTag("email-overrides");
  revalidatePath(`/admin/email-templates/${templateId}`);
  revalidatePath("/admin/email-templates");
  return { ok: true, message: value ? "Texto guardado." : "Volvió al texto original." };
}

/**
 * "Enviarme una prueba": renderiza la plantilla con su sample data (overrides
 * incluidos) y la envía al email del admin logueado vía el sender Resend
 * central (lib/resend — mismo retry/circuit breaker que los transaccionales).
 * El subject lleva prefijo [PRUEBA] para no confundirla con un correo real.
 */
export async function sendTestEmailAction(
  _prev: EmailTemplateActionState | null,
  formData: FormData,
): Promise<EmailTemplateActionState> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.SUPER });

  const templateId = String(formData.get("templateId") ?? "").trim();
  const tpl = getEmailTemplate(templateId);
  if (!tpl) return { error: "Plantilla desconocida." };

  const to = session.user.email;
  if (!to) return { error: "Tu usuario no tiene email asociado." };

  const rendered = await tpl.renderSample();
  const result = await sendEmail({
    to,
    subject: `[PRUEBA] ${rendered.subject}`,
    html: rendered.html,
    text: rendered.text,
    replyTo: rendered.replyTo,
    tags: [
      { name: "kind", value: "template-preview" },
      { name: "template", value: templateId },
    ],
  });

  await recordAdminAction({
    actorId: session.admin.id,
    action: "email_template.test_send",
    entityType: "EmailTemplate",
    entityId: templateId,
    metadata: { to, sent: result.sent, reason: result.sent ? undefined : result.reason },
  });

  if (!result.sent) {
    return {
      error: `No se pudo enviar (${result.reason}). En dev sin RESEND_API_KEY el envío solo se loguea.`,
    };
  }
  return { ok: true, message: `Prueba enviada a ${to}. Revisa tu bandeja (y spam).` };
}
