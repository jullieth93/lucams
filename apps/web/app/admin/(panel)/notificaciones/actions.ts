"use server";

/*
 * Server Actions del centro de notificaciones (/admin/notificaciones).
 *
 * Patrón estándar del panel: requireAdminAction (sesión + MFA aal2 + rol) al
 * INICIO, luego la mutación, recordAdminAction (audit trail) y revalidatePath.
 * Sin updateTag: el feed se lee directo de la DB en cada render (nada cacheado).
 * Cada mutación pasa el rol obligatorio para limitar su alcance a las rutas accesibles.
 */

import { revalidatePath } from "next/cache";
import { recordAdminAction } from "@/lib/admin-audit";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { markRead, markAllRead, type NotificationType } from "@/features/notifications/service";
import { logger } from "@/lib/logger";

const VALID_TYPES: readonly NotificationType[] = ["ALERT", "CRON", "SYSTEM", "ORDER"];

/** Marca UNA notificación como leída dentro del ámbito RBAC del actor. */
export async function markReadAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ capability: "notifications:manage" });
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  await markRead(id, session.admin.role);
  await recordAdminAction({
    actorId: session.admin.id,
    action: "notification.mark_read",
    entityType: "Notification",
    entityId: id,
    metadata: { role: session.admin.role },
  });
  logger.info({
    event: "admin.notification.mark_read",
    adminId: session.admin.id,
    role: session.admin.role,
    id,
  });

  revalidatePath("/admin/notificaciones");
  revalidatePath("/admin", "layout");
}

/**
 * Marca como leídas las notificaciones no leídas visibles para el rol del actor
 * (opcionalmente acotadas al filtro `tipo` activo), sin alterar alertas exclusivas
 * de `SUPERADMIN` cuando opera un perfil operativo.
 */
export async function markAllReadAction(formData?: FormData): Promise<void> {
  const session = await requireAdminAction({ capability: "notifications:manage" });
  const rawType = formData ? String(formData.get("type") ?? "").trim() : "";
  const type = VALID_TYPES.find((t) => t === rawType);

  await markAllRead({ role: session.admin.role, type });
  await recordAdminAction({
    actorId: session.admin.id,
    action: "notification.mark_all_read",
    entityType: "Notification",
    entityId: "*",
    metadata: { role: session.admin.role, ...(type ? { type } : {}) },
  });
  logger.info({
    event: "admin.notification.mark_all_read",
    adminId: session.admin.id,
    role: session.admin.role,
    type: type ?? "ALL",
  });

  revalidatePath("/admin/notificaciones");
  revalidatePath("/admin", "layout");
}
