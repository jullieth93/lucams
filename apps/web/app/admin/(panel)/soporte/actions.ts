"use server";

import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger";
import { getCurrentAdmin } from "@/lib/auth";
import { recordAdminAction } from "@/lib/admin-audit";
import {
  setSupportTicketStatus,
  SUPPORT_STATUSES,
  type SupportTicketStatus,
} from "@/features/support/admin-service";

type St = { error?: string; success?: string } | null;

export async function setTicketStatusAction(_p: St, fd: FormData): Promise<St> {
  const s = await getCurrentAdmin();
  if (!s) return { error: "No autorizado" };
  // Soporte al cliente: SUPERADMIN o MANAGER (no es dinero, no exige SUPERADMIN).
  if (s.admin.role !== "SUPERADMIN" && s.admin.role !== "MANAGER") {
    return { error: "Solo administrador o manager." };
  }
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
