/*
 * Motor transversal de actividades (`ContactActivity`) y tareas (`Task`) del CRM operativo
 * (`Fase 10 · S22`).
 *
 * Diseño:
 *   - Cero dependencias externas de CRM: opera sobre Prisma (`Contact`, `Order`,
 *     `SupportTicket`, `WarrantyClaim`, `RetractRequest`, `AdminUser`).
 *   - Protege horizontalmente contra consultas sin filtro de entidad (`listActivitiesForEntity`
 *     y `listTasksForEntity` exigen al menos un identificador de entidad).
 *   - Si el `contactId` apuntaba a un contacto fusionado (`survivorContactId`), redirige
 *     automáticamente la escritura al contacto sobreviviente activo.
 */

import "server-only";
import { prisma, type Prisma } from "@/lib/db";
import { rolesWithCapability } from "@/lib/admin-rbac";
import { resolveContactRouteParam } from "@/features/identity/contact-360-service";
import {
  isContactActivityKind,
  isCrmTaskPriority,
  isCrmTaskStatus,
  type ContactActivityKind,
  type CrmTaskPriority,
  type CrmTaskStatus,
} from "./constants";

export class CrmValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CrmValidationError";
  }
}

export type CrmActivityView = {
  id: string;
  contactId: string;
  kind: ContactActivityKind;
  body: string;
  createdAt: Date;
  authorEmail: string | null;
  orderNumber: string | null;
  supportTicketId: string | null;
};

export type CrmTaskView = {
  id: string;
  title: string;
  description: string | null;
  status: CrmTaskStatus;
  priority: CrmTaskPriority;
  dueAt: Date | null;
  isOverdue: boolean;
  completedAt: Date | null;
  ownerAdminId: string | null;
  ownerAdminEmail: string | null;
  createdByAdminId: string | null;
  createdByAdminEmail: string | null;
  contactId: string | null;
  orderId: string | null;
  orderNumber: string | null;
  supportTicketId: string | null;
  warrantyClaimId: string | null;
  retractRequestId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AssignableCrmAdmin = {
  id: string;
  email: string;
  role: string;
};

/**
 * Resuelve un `contactId` al contacto activo (siguiendo hasta 4 saltos si fue fusionado en S20).
 */
async function resolveActiveContactIdOrThrow(contactId: string): Promise<string> {
  const cleanId = contactId.trim();
  if (!cleanId) {
    throw new CrmValidationError("Falta el contacto asociado.");
  }

  const resolved = await resolveContactRouteParam(cleanId);
  if (resolved.kind === "not_found") {
    throw new CrmValidationError("El contacto indicado no existe o está archivado.");
  }
  return resolved.contactId;
}

export async function createContactActivity(input: {
  contactId: string;
  orderId?: string | null;
  supportTicketId?: string | null;
  authorAdminId?: string | null;
  kind: ContactActivityKind;
  body: string;
  metadata?: Record<string, unknown>;
}) {
  if (!isContactActivityKind(input.kind)) {
    throw new CrmValidationError("Tipo de actividad inválido.");
  }

  const cleanBody = input.body.trim();
  if (cleanBody.length < 2) {
    throw new CrmValidationError("Escribe al menos 2 caracteres en la nota o registro.");
  }
  if (cleanBody.length > 4000) {
    throw new CrmValidationError("El registro no puede superar 4.000 caracteres.");
  }

  const activeContactId = await resolveActiveContactIdOrThrow(input.contactId);

  return prisma.contactActivity.create({
    data: {
      contactId: activeContactId,
      orderId: input.orderId?.trim() || null,
      supportTicketId: input.supportTicketId?.trim() || null,
      authorAdminId: input.authorAdminId?.trim() || null,
      kind: input.kind,
      body: cleanBody,
      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
}

export async function listActivitiesForEntity(filter: {
  contactId?: string | null;
  orderId?: string | null;
  supportTicketId?: string | null;
  limit?: number;
}): Promise<CrmActivityView[]> {
  const contactId = filter.contactId?.trim() || null;
  const orderId = filter.orderId?.trim() || null;
  const supportTicketId = filter.supportTicketId?.trim() || null;

  if (!contactId && !orderId && !supportTicketId) {
    throw new CrmValidationError("Se requiere filtrar actividades por contacto, pedido o ticket.");
  }

  const where: Prisma.ContactActivityWhereInput = {};
  if (orderId) {
    where.orderId = orderId;
  } else if (supportTicketId) {
    where.supportTicketId = supportTicketId;
  } else if (contactId) {
    where.contactId = contactId;
  }

  const limit = Math.min(Math.max(filter.limit ?? 30, 1), 100);
  const rows = await prisma.contactActivity.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      authorAdmin: { select: { email: true } },
      order: { select: { number: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    contactId: row.contactId,
    kind: isContactActivityKind(row.kind) ? row.kind : "NOTE",
    body: row.body,
    createdAt: row.createdAt,
    authorEmail: row.authorAdmin?.email ?? null,
    orderNumber: row.order?.number ?? null,
    supportTicketId: row.supportTicketId,
  }));
}

export async function createCrmTask(input: {
  title: string;
  description?: string | null;
  priority?: CrmTaskPriority;
  dueAt?: Date | null;
  ownerAdminId?: string | null;
  createdByAdminId?: string | null;
  contactId?: string | null;
  orderId?: string | null;
  supportTicketId?: string | null;
  warrantyClaimId?: string | null;
  retractRequestId?: string | null;
}) {
  const cleanTitle = input.title.trim();
  if (cleanTitle.length < 3) {
    throw new CrmValidationError("El título de la tarea debe tener al menos 3 caracteres.");
  }
  if (cleanTitle.length > 200) {
    throw new CrmValidationError("El título de la tarea no puede superar 200 caracteres.");
  }

  const cleanDesc = input.description?.trim() || null;
  if (cleanDesc && cleanDesc.length > 2000) {
    throw new CrmValidationError("La descripción no puede superar 2.000 caracteres.");
  }

  const priority: CrmTaskPriority =
    input.priority && isCrmTaskPriority(input.priority) ? input.priority : "NORMAL";

  const activeContactId = input.contactId?.trim()
    ? await resolveActiveContactIdOrThrow(input.contactId)
    : null;

  return prisma.task.create({
    data: {
      title: cleanTitle,
      description: cleanDesc,
      status: "OPEN",
      priority,
      dueAt: input.dueAt ?? null,
      ownerAdminId: input.ownerAdminId?.trim() || null,
      createdByAdminId: input.createdByAdminId?.trim() || null,
      contactId: activeContactId,
      orderId: input.orderId?.trim() || null,
      supportTicketId: input.supportTicketId?.trim() || null,
      warrantyClaimId: input.warrantyClaimId?.trim() || null,
      retractRequestId: input.retractRequestId?.trim() || null,
    },
  });
}

export async function updateCrmTaskStatus(input: {
  taskId: string;
  status: CrmTaskStatus;
  ownerAdminId?: string | null;
}) {
  const taskId = input.taskId.trim();
  if (!taskId) {
    throw new CrmValidationError("Falta el identificador de la tarea.");
  }
  if (!isCrmTaskStatus(input.status)) {
    throw new CrmValidationError("Estado de tarea inválido.");
  }

  const data: Prisma.TaskUncheckedUpdateInput = {
    status: input.status,
    completedAt: input.status === "DONE" ? new Date() : null,
  };
  if (input.ownerAdminId !== undefined) {
    data.ownerAdminId = input.ownerAdminId?.trim() || null;
  }

  return prisma.task.update({
    where: { id: taskId },
    data,
  });
}

export async function listTasksForEntity(filter: {
  contactId?: string | null;
  orderId?: string | null;
  supportTicketId?: string | null;
  warrantyClaimId?: string | null;
  retractRequestId?: string | null;
  includeDone?: boolean;
  limit?: number;
}): Promise<CrmTaskView[]> {
  const clauses: Prisma.TaskWhereInput[] = [];
  if (filter.orderId?.trim()) clauses.push({ orderId: filter.orderId.trim() });
  if (filter.supportTicketId?.trim()) {
    clauses.push({ supportTicketId: filter.supportTicketId.trim() });
  }
  if (filter.warrantyClaimId?.trim()) {
    clauses.push({ warrantyClaimId: filter.warrantyClaimId.trim() });
  }
  if (filter.retractRequestId?.trim()) {
    clauses.push({ retractRequestId: filter.retractRequestId.trim() });
  }
  if (filter.contactId?.trim() && clauses.length === 0) {
    clauses.push({ contactId: filter.contactId.trim() });
  }

  if (clauses.length === 0) {
    throw new CrmValidationError("Se requiere al menos una entidad para listar tareas.");
  }

  const includeDone = filter.includeDone ?? true;
  const where: Prisma.TaskWhereInput = {
    OR: clauses,
    ...(includeDone ? {} : { status: { in: ["OPEN", "IN_PROGRESS"] } }),
  };

  const limit = Math.min(Math.max(filter.limit ?? 40, 1), 100);
  const rows = await prisma.task.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    take: limit,
    include: {
      ownerAdmin: { select: { email: true } },
      createdByAdmin: { select: { email: true } },
      order: { select: { number: true } },
    },
  });

  const nowMs = Date.now();
  const mapped: CrmTaskView[] = rows.map((row) => {
    const status: CrmTaskStatus = isCrmTaskStatus(row.status) ? row.status : "OPEN";
    const isActive = status === "OPEN" || status === "IN_PROGRESS";
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      status,
      priority: isCrmTaskPriority(row.priority) ? row.priority : "NORMAL",
      dueAt: row.dueAt,
      isOverdue: isActive && row.dueAt !== null && row.dueAt.getTime() < nowMs,
      completedAt: row.completedAt,
      ownerAdminId: row.ownerAdminId,
      ownerAdminEmail: row.ownerAdmin?.email ?? null,
      createdByAdminId: row.createdByAdminId,
      createdByAdminEmail: row.createdByAdmin?.email ?? null,
      contactId: row.contactId,
      orderId: row.orderId,
      orderNumber: row.order?.number ?? null,
      supportTicketId: row.supportTicketId,
      warrantyClaimId: row.warrantyClaimId,
      retractRequestId: row.retractRequestId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  });

  // Primero tareas abiertas / en curso ordenadas por vencimiento más próximo; luego cerradas.
  return mapped.sort((a, b) => {
    const aActive = a.status === "OPEN" || a.status === "IN_PROGRESS" ? 0 : 1;
    const bActive = b.status === "OPEN" || b.status === "IN_PROGRESS" ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    if (aActive === 0) {
      const aDue = a.dueAt ? a.dueAt.getTime() : Number.MAX_SAFE_INTEGER;
      const bDue = b.dueAt ? b.dueAt.getTime() : Number.MAX_SAFE_INTEGER;
      if (aDue !== bDue) return aDue - bDue;
    }
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}

export async function listAssignableCrmAdmins(): Promise<AssignableCrmAdmin[]> {
  const eligibleRoles = rolesWithCapability("crm:manage_tasks");
  return prisma.adminUser.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      role: { in: eligibleRoles },
    },
    select: {
      id: true,
      email: true,
      role: true,
    },
    orderBy: { email: "asc" },
  });
}
