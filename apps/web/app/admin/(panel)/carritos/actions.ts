"use server";

/*
 * Server actions del módulo /admin/carritos (Fase 4, 2026-10-13).
 *
 *  - saveCartRecoverySettingsAction: config del módulo (SUPERADMIN — habilitar
 *    / apagar el envío de correos comerciales y sus ritmos: misma barra que la
 *    ruta /admin/carritos/configuracion en lib/admin-rbac).
 *  - sendReminderAction / bulkSendRemindersAction: envío manual a voluntad
 *    (MANAGER_UP — alineado con la bandeja). Delegan en sendReminderToCart de
 *    features/cart/recovery-service (mismo núcleo que el cron: token fresco,
 *    anti-duplicación por intervalHours, marcado lastReminderSentAt +
 *    reminderCount).
 *
 * Todas registran en AdminActionLog (recordAdminAction).
 */

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { recordAdminAction } from "@/lib/admin-audit";
import { logger } from "@/lib/logger";
import { sendReminderToCart, type ManualReminderResult } from "@/features/cart/recovery-service";
import { saveCartRecoverySettings } from "@/features/cart/recovery-settings";

export type CartRecoveryActionState = { ok?: string; error?: string };

function parseBoundedInt(
  formData: FormData,
  field: string,
  min: number,
  max: number,
): number | null {
  const n = Number.parseInt(String(formData.get(field) ?? ""), 10);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

/** Guarda la config del módulo (toggle, modo, ritmos). */
export async function saveCartRecoverySettingsAction(
  _prev: CartRecoveryActionState | null,
  formData: FormData,
): Promise<CartRecoveryActionState> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.SUPER });

  const enabled = formData.get("enabled") === "1";
  const modeRaw = String(formData.get("mode") ?? "");
  const mode = modeRaw === "manual" ? "manual" : modeRaw === "automatic" ? "automatic" : null;
  const idleHours = parseBoundedInt(formData, "idleHours", 1, 168);
  const maxReminders = parseBoundedInt(formData, "maxReminders", 1, 5);
  const intervalHours = parseBoundedInt(formData, "intervalHours", 1, 168);

  if (mode === null) {
    return { error: "El modo debe ser «automatic» o «manual»." };
  }
  if (idleHours === null) {
    return { error: "Las horas de inactividad deben ser un número entre 1 y 168." };
  }
  if (maxReminders === null) {
    return { error: "El máximo de recordatorios debe ser un número entre 1 y 5." };
  }
  if (intervalHours === null) {
    return { error: "Las horas entre recordatorios deben ser un número entre 1 y 168." };
  }

  try {
    await saveCartRecoverySettings(
      { enabled, mode, idleHours, maxReminders, intervalHours },
      session.admin.id,
    );
    await recordAdminAction({
      actorId: session.admin.id,
      action: "cart_recovery.settings.save",
      entityType: "Setting",
      entityId: "cart-recovery",
      metadata: { enabled, mode, idleHours, maxReminders, intervalHours },
    });
    // Las settings viajan por el tag "cms" (getSettingValue cacheado): invalidar
    // para que el cron y el envío manual vean el cambio al instante.
    updateTag("cms");
    revalidatePath("/admin/carritos");
    revalidatePath("/admin/carritos/configuracion");
    return {
      ok: !enabled
        ? "Módulo APAGADO: no se enviará ningún recordatorio (ni automático ni manual)."
        : mode === "manual"
          ? "Modo MANUAL guardado: el cron no envía nada; los recordatorios salen solo a voluntad desde la bandeja."
          : `Modo automático guardado: hasta ${maxReminders} recordatorio${maxReminders === 1 ? "" : "s"} por carrito tras ${idleHours} h de inactividad.`,
    };
  } catch (err) {
    logger.warn({
      event: "admin.cart_recovery.settings.save_fail",
      adminId: session.admin.id,
      err: err instanceof Error ? err.message : String(err),
    });
    return { error: err instanceof Error ? err.message : "No se pudo guardar." };
  }
}

const CUID_RE = /^c[a-z0-9]{24}$/;

/** Mensaje de resultado del envío manual → query params de la pantalla de detalle. */
function manualResultRedirect(id: string, email: string, r: ManualReminderResult): string {
  const base = `/admin/carritos/${id}`;
  if (r.status === "sent") return `${base}?sent=${encodeURIComponent(email)}`;
  if (r.status === "recovered")
    return `${base}?notice=${encodeURIComponent("Este carrito ya fue recuperado (el cliente compró).")}`;
  if (r.status === "skipped") {
    const msg =
      r.reason === "module-disabled"
        ? "El módulo está apagado (Configuración): no se envió nada."
        : r.reason === "too-soon"
          ? `Ya se envió un recordatorio hace poco. Podrás reenviar desde ${r.retryAt ? r.retryAt.toLocaleString("es-CO") : "más tarde"}.`
          : r.reason === "empty-cart"
            ? "El carrito ya no tiene productos: no hay nada que recordar."
            : "El servicio de correo está en pausa temporal (circuit breaker): intenta de nuevo en unos segundos.";
    return `${base}?notice=${encodeURIComponent(msg)}`;
  }
  return `${base}?error=${encodeURIComponent("No se pudo enviar el recordatorio. Revisa el log del servidor.")}`;
}

/** Envío manual desde la pantalla de detalle (con preview). */
export async function sendReminderAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });
  const id = String(formData.get("id") ?? "").trim();
  if (!CUID_RE.test(id)) redirect("/admin/carritos?error=Identificador%20inv%C3%A1lido");

  const result = await sendReminderToCart(id);
  const email = String(formData.get("email") ?? "");
  await recordAdminAction({
    actorId: session.admin.id,
    action: "cart_recovery.reminder.send",
    entityType: "AbandonedCart",
    entityId: id,
    metadata: {
      status: result.status,
      ...(result.status === "skipped" ? { reason: result.reason } : {}),
    },
  });
  logger.info({
    event: "admin.cart_recovery.reminder_send",
    adminId: session.admin.id,
    abandonedCartId: id,
    status: result.status,
  });

  revalidatePath("/admin/carritos");
  redirect(manualResultRedirect(id, email, result));
}

const BulkCartIdsSchema = z
  .array(z.string().regex(CUID_RE))
  .min(1, "Selecciona al menos un carrito")
  .max(100, "Máximo 100 carritos por lote");

/** Envío masivo desde la pantalla de confirmación (preview incluido). */
export async function bulkSendRemindersAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });

  const ids = formData
    .getAll("ids")
    .map(String)
    .flatMap((v) => v.split(","))
    .map((v) => v.trim())
    .filter(Boolean);
  const parsed = BulkCartIdsSchema.safeParse(ids);
  if (!parsed.success) {
    redirect(
      `/admin/carritos?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Selección inválida")}`,
    );
  }

  const tally = { sent: 0, skipped: 0, recovered: 0, failed: 0 };
  for (const id of parsed.data) {
    const r = await sendReminderToCart(id);
    tally[
      r.status === "sent"
        ? "sent"
        : r.status === "recovered"
          ? "recovered"
          : r.status === "skipped"
            ? "skipped"
            : "failed"
    ]++;
  }
  await recordAdminAction({
    actorId: session.admin.id,
    action: "cart_recovery.reminder.bulk_send",
    entityType: "AbandonedCart",
    entityId: parsed.data.join(","),
    metadata: { count: parsed.data.length, ...tally },
  });
  logger.info({
    event: "admin.cart_recovery.reminder_bulk_send",
    adminId: session.admin.id,
    count: parsed.data.length,
    ...tally,
  });

  revalidatePath("/admin/carritos");
  const parts = [
    `${tally.sent} recordatorio${tally.sent === 1 ? "" : "s"} enviado${tally.sent === 1 ? "" : "s"}`,
  ];
  if (tally.skipped > 0)
    parts.push(
      `${tally.skipped} omitido${tally.skipped === 1 ? "" : "s"} (módulo apagado, reenvío muy pronto o carrito vacío)`,
    );
  if (tally.recovered > 0)
    parts.push(`${tally.recovered} ya recuperado${tally.recovered === 1 ? "" : "s"}`);
  if (tally.failed > 0) parts.push(`${tally.failed} con error`);
  redirect(`/admin/carritos?bulkOk=${encodeURIComponent(parts.join(" · "))}.`);
}
