"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/auth";
import { recordAdminAction } from "@/lib/admin-audit";
import { logger } from "@/lib/logger";
import { createAveonlineWebhook, deleteAveonlineWebhook } from "@/features/shipping/aveonline";

type ActionState = { ok?: string; error?: string };

export async function registerAveonlineWebhookAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const baseUrl = String(formData.get("baseUrl") ?? "").trim();
  if (!baseUrl || !baseUrl.startsWith("https://")) {
    return { error: "URL base debe empezar con https://" };
  }
  const secret = process.env.AVEONLINE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return { error: "AVEONLINE_WEBHOOK_SECRET no está en .env" };
  }

  const fullUrl = `${baseUrl.replace(/\/+$/, "")}/api/webhooks/aveonline?secret=${encodeURIComponent(secret)}`;
  try {
    const result = await createAveonlineWebhook({
      url: fullUrl,
      secret,
      extra: { tenant: "lucams_shop" },
    });
    await recordAdminAction({
      actorId: session.admin.id,
      action: "shipping.aveonline.webhook.register",
      entityType: "Integration",
      entityId: "aveonline",
      metadata: { url: fullUrl, ok: result.ok, message: result.message },
    });
    logger.info({
      event: "admin.aveonline.webhook.register",
      adminId: session.admin.id,
      ok: result.ok,
      message: result.message,
    });
    revalidatePath("/admin/integraciones/aveonline");
    if (!result.ok) return { error: result.message || "Aveonline no aceptó el webhook" };
    return { ok: "Webhook registrado en Aveonline." };
  } catch (err) {
    logger.error({
      event: "admin.aveonline.webhook.register_fail",
      err: err instanceof Error ? err.message : String(err),
    });
    return { error: err instanceof Error ? err.message : "Error inesperado" };
  }
}

export async function deleteAveonlineWebhookAction(formData: FormData): Promise<void> {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");
  const url = String(formData.get("url") ?? "");
  if (!url) return;
  const result = await deleteAveonlineWebhook(url);
  await recordAdminAction({
    actorId: session.admin.id,
    action: "shipping.aveonline.webhook.delete",
    entityType: "Integration",
    entityId: "aveonline",
    metadata: { url, ok: result.ok, message: result.message },
  });
  revalidatePath("/admin/integraciones/aveonline");
}
