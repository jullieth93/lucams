"use server";

/*
 * Server actions de /admin/mensajes — cambio de estado de los mensajes de clientes.
 * Delegan en features/support/admin-service (compartido con /admin/soporte) para que
 * ambas bandejas vean el mismo estado; al cerrar se sella resolvedAt/resolvedBy y al
 * reabrir se limpian.
 */

import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { recordAdminAction } from "@/lib/admin-audit";
import {
  setSupportTicketStatus,
  SUPPORT_STATUSES,
  type SupportTicketStatus,
} from "@/features/support/admin-service";

type St = { error?: string; success?: string } | null;

export async function setMessageStatusAction(_p: St, fd: FormData): Promise<St> {
  // Atención a clientes: SUPERADMIN o MANAGER (no mueve dinero, no exige SUPERADMIN).
  const s = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });
  const id = String(fd.get("id") ?? "");
  const status = String(fd.get("status") ?? "") as SupportTicketStatus;
  if (!id) return { error: "Falta id" };
  if (!SUPPORT_STATUSES.includes(status)) return { error: "Estado inválido" };
  try {
    await setSupportTicketStatus(id, status, s.admin.id);
    await recordAdminAction({
      actorId: s.admin.id,
      action: "support.status",
      entityType: "SupportTicket",
      entityId: id,
      metadata: { status, via: "mensajes" },
    });
    revalidatePath("/admin/mensajes");
    const label =
      status === "CLOSED"
        ? "cerrado"
        : status === "IN_PROGRESS"
          ? "marcado en proceso"
          : "reabierto";
    return { success: `Mensaje ${label}.` };
  } catch (err) {
    logger.warn({
      event: "admin.mensajes.status_fail",
      id,
      err: err instanceof Error ? err.message : String(err),
    });
    return { error: "No se pudo actualizar el mensaje." };
  }
}
