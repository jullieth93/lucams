"use server";

/*
 * Server Actions del centro de notificaciones (/admin/notificaciones).
 *
 * Patrón estándar del panel: requireAdminAction (sesión + MFA aal2 + rol) al
 * INICIO, luego la mutación, recordAdminAction (audit trail) y revalidatePath.
 * Sin updateTag: el feed se lee directo de la DB en cada render (nada cacheado).
 * SUPERADMIN únicamente (la ruta tampoco está en la matriz RBAC → deny-by-default
 * ya la limita a SUPERADMIN; esto es el mismo candado para las actions).
 */

import { revalidatePath } from "next/cache";
import { recordAdminAction } from "@/lib/admin-audit";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { markRead, markAllRead } from "@/features/notifications/service";
import { logger } from "@/lib/logger";

/** Marca UNA notificación como leída (botón por fila del feed). */
export async function markReadAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.SUPER });
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  await markRead(id);
  await recordAdminAction({
    actorId: session.admin.id,
    action: "notification.mark_read",
    entityType: "Notification",
    entityId: id,
  });
  logger.info({ event: "admin.notification.mark_read", adminId: session.admin.id, id });

  revalidatePath("/admin/notificaciones");
}

/** Marca TODAS las notificaciones como leídas (botón del header). */
export async function markAllReadAction(): Promise<void> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.SUPER });

  await markAllRead();
  await recordAdminAction({
    actorId: session.admin.id,
    action: "notification.mark_all_read",
    entityType: "Notification",
    entityId: "*", // acción global (no hay un id único: marca todas las no leídas)
  });
  logger.info({ event: "admin.notification.mark_all_read", adminId: session.admin.id });

  revalidatePath("/admin/notificaciones");
}
