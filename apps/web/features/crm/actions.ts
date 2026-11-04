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
}

export async function createContactActivityAction(
  _prev: CrmActionState,
  formData: FormData,
): Promise<CrmActionState> {
  const session = await requireAdminAction({ capability: "crm:manage_activities" });

  const contactId = String(formData.get("contactId") ?? "").trim();
  const orderId = String(formData.get("orderId") ?? "").trim() || null;
  const orderNumber = String(formData.get("orderNumber") ?? "").trim() || null;
  const supportTicketId = String(formData.get("supportTicketId") ?? "").trim() || null;
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
      },
    });

    revalidateCrmSurfaces({
      contactId: activity.contactId,
      orderNumber,
      supportTicketId,
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

  // Defensa horizontal: roles sin acceso 360 no pueden vincular tareas a contactos/tickets arbitrarios.
  const contactId = canRead360 ? rawContactId : null;
  const supportTicketId = canManageSupport ? rawSupportTicketId : null;

  const priority: CrmTaskPriority = isCrmTaskPriority(priorityRaw) ? priorityRaw : "NORMAL";

  try {
    const task = await createCrmTask({
      title,
      description,
      priority,
      dueAt,
      ownerAdminId: ownerAdminId ?? session.admin.id,
      createdByAdminId: session.admin.id,
      contactId,
      orderId,
      supportTicketId,
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
      },
    });

    revalidateCrmSurfaces({
      contactId: task.contactId,
      orderNumber,
      supportTicketId: task.supportTicketId,
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
    },
  });
  if (!existing) {
    return { error: "La tarea ya no existe." };
  }

  // Defensa horizontal: si el actor no posee `contacts:read_360` (ej. taller o logística),
  // solo puede actualizar tareas propias o vinculadas a un pedido operativo.
  const canRead360 = hasCapability(session.admin.role, "contacts:read_360");
  if (!canRead360) {
    const isOwnTask =
      existing.ownerAdminId === session.admin.id || existing.createdByAdminId === session.admin.id;
    const isOperationalOrderTask = existing.orderId !== null;
    if (!isOwnTask && !isOperationalOrderTask) {
      return { error: "No tienes permisos para modificar esta tarea." };
    }
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
      },
    });

    revalidateCrmSurfaces({
      contactId: updated.contactId,
      orderNumber,
      supportTicketId: updated.supportTicketId,
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
