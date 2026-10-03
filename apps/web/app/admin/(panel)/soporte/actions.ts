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
import {
  addTicketMessage,
  convertTicketToCase,
  caseConversionErrorMessage,
  type LinkedCaseKind,
} from "@/features/support/thread-service";

type St = { error?: string; success?: string } | null;

function revalidateTicket(id: string) {
  revalidatePath("/admin/soporte");
  revalidatePath(`/admin/soporte/${id}`);
}

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
    revalidateTicket(id);
    const label =
      status === "CLOSED"
        ? "cerrado — cliente avisado por correo"
        : status === "IN_PROGRESS"
          ? "marcado en progreso"
          : "reabierto";
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

/**
 * Respuesta pública (va al hilo + email al cliente) o nota interna (solo panel).
 * El checkbox `internal` del form decide; ambos casos quedan auditados.
 */
export async function replyTicketAction(_p: St, fd: FormData): Promise<St> {
  const s = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });
  const id = String(fd.get("id") ?? "");
  const body = String(fd.get("body") ?? "");
  const internal = fd.get("internal") === "on";
  if (!id) return { error: "Falta id" };
  try {
    const message = await addTicketMessage({
      ticketId: id,
      body,
      adminId: s.admin.id,
      internal,
    });
    await recordAdminAction({
      actorId: s.admin.id,
      action: internal ? "support.note" : "support.reply",
      entityType: "SupportTicket",
      entityId: id,
      metadata: { messageId: message.id },
    });
    revalidateTicket(id);
    return {
      success: internal
        ? "Nota interna guardada (no se envía al cliente)."
        : "Respuesta enviada al cliente por correo y guardada en el hilo.",
    };
  } catch (err) {
    logger.warn({
      event: "admin.support.reply_fail",
      id,
      err: err instanceof Error ? err.message : String(err),
    });
    return { error: err instanceof Error ? err.message : "No se pudo guardar el mensaje." };
  }
}

/** Convierte el ticket GARANTIA_DEVOLUCION en WarrantyClaim o RetractRequest enlazado. */
export async function convertTicketToCaseAction(_p: St, fd: FormData): Promise<St> {
  const s = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });
  const id = String(fd.get("id") ?? "");
  const kind = String(fd.get("kind") ?? "") as LinkedCaseKind;
  const orderItemId = String(fd.get("orderItemId") ?? "");
  if (!id) return { error: "Falta id" };
  if (kind !== "warranty" && kind !== "retract") return { error: "Tipo de caso inválido" };
  if (!orderItemId) return { error: "Elige el item del pedido" };
  try {
    const { caseId } = await convertTicketToCase({
      ticketId: id,
      kind,
      orderItemId,
      adminId: s.admin.id,
    });
    await recordAdminAction({
      actorId: s.admin.id,
      action: "support.convert_case",
      entityType: "SupportTicket",
      entityId: id,
      metadata: { kind, caseId, orderItemId },
    });
    revalidateTicket(id);
    return {
      success:
        kind === "warranty"
          ? "Reclamo de garantía creado y enlazado — sigue en /admin/garantias."
          : "Solicitud de retracto creada y enlazada — sigue en /admin/retractos.",
    };
  } catch (err) {
    logger.warn({
      event: "admin.support.convert_fail",
      id,
      kind,
      err: err instanceof Error ? err.message : String(err),
    });
    return { error: caseConversionErrorMessage(err) };
  }
}
