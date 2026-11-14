"use server";

/*
 * Server Actions del motor transversal de actividades y tareas del CRM (`Fase 10 · S22`).
 *
 * Seguridad cero suposiciones:
 *   - `createContactActivityAction` exige `crm:manage_activities` + MFA `aal2`.
 *   - `createCrmTaskAction` y `updateCrmTaskStatusAction` exigen `crm:manage_tasks` + MFA `aal2`.
 *   - Aislamiento horizontal: roles operativos sin `contacts:read_360` (`PRINT_WORKSHOP`,
 *     `FULFILLMENT`, `FINANCE_ANALYST`) solo pueden crear o mutar tareas propias o vinculadas a
 *     pedidos operativos, sin adjuntar arbitrariamente `contactId` o `supportTicketId` ajenos.
 *   - Toda mutación queda trazada en `AdminActionLog`.
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { hasCapability } from "@/lib/admin-rbac";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { recordAdminAction } from "@/lib/admin-audit";
import {
  isCrmTaskPriority,
  isCrmTaskStatus,
  isManualActivityKind,
  type CrmTaskPriority,
  type CrmTaskStatus,
} from "./constants";
import {
  createContactActivity,
  createCrmTask,
  CrmValidationError,
  updateCrmTaskStatus,
} from "./service";

export type CrmActionState = { error?: string; success?: string } | null;

function parseDueDateCot(raw: FormDataEntryValue | null): Date | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const trimmed = raw.trim();
  // Si viene de `<input type="date">` (`YYYY-MM-DD`), interpretamos fin del día en hora Colombia (`-05:00`).
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const parsed = new Date(`${trimmed}T23:59:59.000-05:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function revalidateCrmSurfaces(meta: {
  contactId?: string | null;
  orderNumber?: string | null;
  supportTicketId?: string | null;
  opportunityId?: string | null;
}) {
  revalidatePath("/admin/hoy");
  if (meta.contactId) {
    revalidatePath("/admin/clientes");
    revalidatePath(`/admin/clientes/${meta.contactId}`);
  }
  if (meta.orderNumber) {
    revalidatePath(`/admin/pedidos/${meta.orderNumber}`);
  }
  if (meta.supportTicketId) {
    revalidatePath("/admin/soporte");
    revalidatePath(`/admin/soporte/${meta.supportTicketId}`);
  }
  if (meta.opportunityId) {
    revalidatePath("/admin/oportunidades");
    revalidatePath(`/admin/oportunidades/${meta.opportunityId}`);
  }
}

export async function createContactActivityAction(
  _prev: CrmActionState,
  formData: FormData,
): Promise<CrmActionState> {
  const session = await requireAdminAction({ capability: "crm:manage_activities" });
  const canManageOpportunities = hasCapability(session.admin.role, "opportunities:manage");

  const contactId = String(formData.get("contactId") ?? "").trim();
  const orderId = String(formData.get("orderId") ?? "").trim() || null;
  const orderNumber = String(formData.get("orderNumber") ?? "").trim() || null;
  const supportTicketId = String(formData.get("supportTicketId") ?? "").trim() || null;
  const rawOpportunityId = String(formData.get("opportunityId") ?? "").trim() || null;
  const rawOpportunityNumber = String(formData.get("opportunityNumber") ?? "").trim() || null;
  const opportunityId = canManageOpportunities ? rawOpportunityId : null;
  const opportunityNumber = canManageOpportunities ? rawOpportunityNumber : null;
  const kindRaw = String(formData.get("kind") ?? "NOTE").trim();
  const body = String(formData.get("body") ?? "");

  if (!isManualActivityKind(kindRaw)) {
    return { error: "Selecciona un canal válido para registrar la actividad." };
  }

  try {
    const activity = await createContactActivity({
      contactId,
      orderId,
      supportTicketId,
      authorAdminId: session.admin.id,
      kind: kindRaw,
      body,
      metadata: {
        ...(opportunityId ? { opportunityId } : {}),
        ...(opportunityNumber ? { opportunityNumber } : {}),
      },
    });

    await recordAdminAction({
      actorId: session.admin.id,
      action: "crm.activity_create",
      entityType: "ContactActivity",
      entityId: activity.id,
      metadata: {
        contactId: activity.contactId,
        kind: activity.kind,
        orderId,
        supportTicketId,
        opportunityId,
      },
    });

    revalidateCrmSurfaces({
      contactId: activity.contactId,
      orderNumber,
      supportTicketId,
      opportunityId,
    });

    return { success: "Actividad registrada en la bitácora del contacto." };
  } catch (err) {
    if (err instanceof CrmValidationError) {
      return { error: err.message };
    }
    logger.warn({
      event: "admin.crm.activity_create_fail",
      contactId,
      err: err instanceof Error ? err.message : String(err),
    });
    return { error: "No se pudo guardar la actividad. Intenta de nuevo." };
  }
}

export async function createCrmTaskAction(
  _prev: CrmActionState,
  formData: FormData,
): Promise<CrmActionState> {
  const session = await requireAdminAction({ capability: "crm:manage_tasks" });
  const canRead360 = hasCapability(session.admin.role, "contacts:read_360");
  const canManageSupport = hasCapability(session.admin.role, "support:manage");
  const canManageOpportunities = hasCapability(session.admin.role, "opportunities:manage");

  const title = String(formData.get("title") ?? "");
  const description = String(formData.get("description") ?? "");
  const priorityRaw = String(formData.get("priority") ?? "NORMAL").trim();
  const dueAt = parseDueDateCot(formData.get("dueAt"));
  const ownerRaw = String(formData.get("ownerAdminId") ?? "").trim();
  const ownerAdminId = ownerRaw === "" || ownerRaw === "UNASSIGNED" ? null : ownerRaw;

  const rawContactId = String(formData.get("contactId") ?? "").trim() || null;
  const orderId = String(formData.get("orderId") ?? "").trim() || null;
  const orderNumber = String(formData.get("orderNumber") ?? "").trim() || null;
  const rawSupportTicketId = String(formData.get("supportTicketId") ?? "").trim() || null;
  const rawOpportunityId = String(formData.get("opportunityId") ?? "").trim() || null;

  // Defensa horizontal: roles sin acceso 360/oportunidades no pueden vincular tareas arbitrarias.
  const contactId = canRead360 ? rawContactId : null;
  const supportTicketId = canManageSupport ? rawSupportTicketId : null;
  const opportunityId = canManageOpportunities ? rawOpportunityId : null;

  const priority: CrmTaskPriority = isCrmTaskPriority(priorityRaw) ? priorityRaw : "NORMAL";
  const effectiveOwnerAdminId = ownerAdminId ?? session.admin.id;
  if (
    session.admin.role === "FINANCE_ANALYST" &&
    orderId &&
    effectiveOwnerAdminId !== session.admin.id
  ) {
    return { error: "Solo puedes crear tareas de pedidos asignadas a ti." };
  }

  try {
    const task = await createCrmTask({
      title,
      description,
      priority,
      dueAt,
      ownerAdminId: effectiveOwnerAdminId,
      createdByAdminId: session.admin.id,
      contactId,
      orderId,
      supportTicketId,
      opportunityId,
    });

    await recordAdminAction({
      actorId: session.admin.id,
      action: "crm.task_create",
      entityType: "Task",
      entityId: task.id,
      metadata: {
        priority: task.priority,
        ownerAdminId: task.ownerAdminId,
        contactId: task.contactId,
        orderId: task.orderId,
        supportTicketId: task.supportTicketId,
        opportunityId: task.opportunityId,
      },
    });

    revalidateCrmSurfaces({
      contactId: task.contactId,
      orderNumber,
      supportTicketId: task.supportTicketId,
      opportunityId: task.opportunityId,
    });

    return { success: "Tarea creada y agregada a la Bandeja Hoy." };
  } catch (err) {
    if (err instanceof CrmValidationError) {
      return { error: err.message };
    }
    logger.warn({
      event: "admin.crm.task_create_fail",
      err: err instanceof Error ? err.message : String(err),
    });
    return { error: "No se pudo crear la tarea. Intenta de nuevo." };
  }
}

export async function updateCrmTaskStatusAction(
  _prev: CrmActionState,
  formData: FormData,
): Promise<CrmActionState> {
  const session = await requireAdminAction({ capability: "crm:manage_tasks" });
  const taskId = String(formData.get("taskId") ?? "").trim();
  const statusRaw = String(formData.get("status") ?? "").trim();
  const orderNumber = String(formData.get("orderNumber") ?? "").trim() || null;

  if (!taskId) return { error: "Falta el identificador de la tarea." };
  if (!isCrmTaskStatus(statusRaw)) return { error: "Estado inválido." };

  const status: CrmTaskStatus = statusRaw;

  const existing = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      ownerAdminId: true,
      createdByAdminId: true,
      contactId: true,
      orderId: true,
      supportTicketId: true,
      opportunityId: true,
    },
  });
  if (!existing) {
    return { error: "La tarea ya no existe." };
  }

  const isOwnTask =
    existing.ownerAdminId === session.admin.id || existing.createdByAdminId === session.admin.id;
  const canManageOpportunities = hasCapability(session.admin.role, "opportunities:manage");
  const canManageOrderTasks =
    hasCapability(session.admin.role, "orders:transition") ||
    hasCapability(session.admin.role, "support:manage");
  const canManageSupportTasks = hasCapability(session.admin.role, "support:manage");
  const canSupervisePrivateTasks = hasCapability(session.admin.role, "contacts:merge");

  if (existing.opportunityId !== null && !canManageOpportunities) {
    return { error: "No tienes permisos para modificar tareas de oportunidades." };
  }
  if (existing.orderId !== null && !isOwnTask && !canManageOrderTasks) {
    return { error: "No tienes permisos para modificar esta tarea del pedido." };
  }
  if (existing.supportTicketId !== null && !isOwnTask && !canManageSupportTasks) {
    return { error: "No tienes permisos para modificar esta tarea de soporte." };
  }
  const isPrivateTask =
    existing.opportunityId === null &&
    existing.orderId === null &&
    existing.supportTicketId === null;
  const canMutatePrivateTask =
    existing.ownerAdminId === session.admin.id ||
    (existing.ownerAdminId === null && existing.createdByAdminId === session.admin.id);
  if (isPrivateTask && !canMutatePrivateTask && !canSupervisePrivateTasks) {
    return { error: "No tienes permisos para modificar una tarea privada de otro responsable." };
  }

  try {
    const updated = await updateCrmTaskStatus({
      taskId,
      status,
    });

    await recordAdminAction({
      actorId: session.admin.id,
      action: "crm.task_status",
      entityType: "Task",
      entityId: updated.id,
      metadata: {
        status: updated.status,
        contactId: updated.contactId,
        orderId: updated.orderId,
        supportTicketId: updated.supportTicketId,
        opportunityId: updated.opportunityId,
      },
    });

    revalidateCrmSurfaces({
      contactId: updated.contactId,
      orderNumber,
      supportTicketId: updated.supportTicketId,
      opportunityId: updated.opportunityId,
    });

    return {
      success:
        status === "DONE"
          ? "Tarea marcada como completada."
          : `Estado actualizado a ${status === "IN_PROGRESS" ? "En curso" : "Pendiente"}.`,
    };
  } catch (err) {
    if (err instanceof CrmValidationError) {
      return { error: err.message };
    }
    logger.warn({
      event: "admin.crm.task_status_fail",
      taskId,
      err: err instanceof Error ? err.message : String(err),
    });
    return { error: "No se pudo actualizar el estado de la tarea." };
  }
}
