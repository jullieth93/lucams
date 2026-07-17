"use server";

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

export async function setTicketStatusAction(_p: St, fd: FormData): Promise<St> {
  // Soporte al cliente: SUPERADMIN o MANAGER (no es dinero, no exige SUPERADMIN).
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
      metadata: { status },
    });
    revalidatePath("/admin/soporte");
    const label =
      status === "CLOSED" ? "cerrado" : status === "IN_PROGRESS" ? "marcado en progreso" : "reabierto";
    return { success: `Ticket ${label}.` };
  } catch (err) {
    logger.warn({
      event: "admin.support.status_fail",
      id,
      err: err instanceof Error ? err.message : String(err),
    });
    return { error: "No se pudo actualizar el ticket." };
  }
}
