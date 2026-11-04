"use server";

import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { recordAdminAction } from "@/lib/admin-audit";
import {
  isSupportPriority,
  setSupportTicketStatus,
  SupportConcurrencyError,
  SUPPORT_STATUSES,
  updateSupportTicketGovernance,
  type SupportTicketPriority,
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
  revalidatePath("/admin/hoy");
}

function parseExpectedUpdatedAt(raw: FormDataEntryValue | null): Date | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const d = new Date(raw.trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function setTicketStatusAction(_p: St, fd: FormData): Promise<St> {
  const s = await requireAdminAction({ capability: "support:manage" });
  const id = String(fd.get("id") ?? "").trim();
  const status = String(fd.get("status") ?? "") as SupportTicketStatus;
  const expectedUpdatedAt = parseExpectedUpdatedAt(fd.get("expectedUpdatedAt"));

  if (!id) return { error: "Falta id" };
  if (!SUPPORT_STATUSES.includes(status)) return { error: "Estado inválido" };

  try {
    await setSupportTicketStatus(id, status, s.admin.id, {
      expectedUpdatedAt,
      autoAssignIfUnassigned: status === "IN_PROGRESS",
    });
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
          ? "tomado en progreso"
          : "reabierto";
    return { success: `Ticket ${label}.` };
  } catch (err) {
    if (err instanceof SupportConcurrencyError) {
      return { error: err.message };
    }
    logger.warn({
      event: "admin.support.status_fail",
      id,
      err: err instanceof Error ? err.message : String(err),
    });
    return { error: "No se pudo actualizar el ticket." };
  }
}

export async function updateTicketGovernanceAction(_p: St, fd: FormData): Promise<St> {
  const s = await requireAdminAction({ capability: "support:manage" });
  const id = String(fd.get("id") ?? "").trim();
  const priorityRaw = String(fd.get("priority") ?? "NORMAL").trim();
  const assignedRaw = String(fd.get("assignedToAdminId") ?? "").trim();
  const expectedUpdatedAt = parseExpectedUpdatedAt(fd.get("expectedUpdatedAt"));

  if (!id) return { error: "Falta id" };
  if (!isSupportPriority(priorityRaw)) return { error: "Prioridad inválida" };

  const assignedToAdminId = assignedRaw === "" || assignedRaw === "UNASSIGNED" ? null : assignedRaw;
  const priority: SupportTicketPriority = priorityRaw;

  try {
    await updateSupportTicketGovernance({
      id,
      assignedToAdminId,
      priority,
      expectedUpdatedAt,
    });
    await recordAdminAction({
      actorId: s.admin.id,
      action: "support.assign",
      entityType: "SupportTicket",
      entityId: id,
      metadata: { assignedToAdminId, priority },
    });
    revalidateTicket(id);
    return { success: "Responsable y prioridad actualizados." };
  } catch (err) {
    if (err instanceof SupportConcurrencyError) {
      return { error: err.message };
    }
    return {
      error: err instanceof Error ? err.message : "No se pudo guardar la asignación.",
    };
  }
}

/**
 * Respuesta pública (va al hilo + email al cliente) o nota interna (solo panel).
 * Si la respuesta provino del borrador sugerido por el copiloto (`aiAssisted = "1"`),
 * registra `aiAssisted: true` en `AdminActionLog`.
 */
export async function replyTicketAction(_p: St, fd: FormData): Promise<St> {
  const s = await requireAdminAction({ capability: "support:manage" });
  const id = String(fd.get("id") ?? "").trim();
  const body = String(fd.get("body") ?? "");
  const internal = fd.get("internal") === "on";
  const aiAssisted = fd.get("aiAssisted") === "1";

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
      metadata: { messageId: message.id, ...(aiAssisted ? { aiAssisted: true } : {}) },
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
  const s = await requireAdminAction({ capability: "support:manage" });
  const id = String(fd.get("id") ?? "").trim();
  const kind = String(fd.get("kind") ?? "") as LinkedCaseKind;
  const orderItemId = String(fd.get("orderItemId") ?? "").trim();
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
