import "server-only";
import { Prisma } from "@lucams/db";
import { prisma } from "@/lib/db";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { evaluateSlaStatus, type SlaEvaluation } from "@/lib/colombian-sla";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/lib/resend";
import { renderSupportTicketClosedEmail } from "@/features/emails/registry";
import type { SUBJECT_LABELS } from "@/features/support/schemas";

/*
 * Gestión admin de tickets de soporte (`Fase 10 · S21`).
 *
 * Incluye:
 *  - Búsqueda server-side (`q`), paginación y vistas operativas (`mine`, `unassigned`, `sla-risk`).
 *  - Ownership de agente (`assignedToAdminId`), prioridad (`LOW | NORMAL | HIGH | URGENT`)
 *    y evaluación de semáforo legal colombiano (`slaDueAt`).
 *  - Control de concurrencia optimista (`SupportConcurrencyError` sobre `updatedAt`) para impedir
 *    que dos agentes sobrescriban estados o asignaciones en silencio.
 *  - Email de cierre N-14 idempotente.
 */

export type SupportTicketStatus = "OPEN" | "IN_PROGRESS" | "CLOSED";
export type SupportTicketPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
export type SupportInboxView =
  "OPEN" | "IN_PROGRESS" | "CLOSED" | "mine" | "unassigned" | "sla-risk" | "all";

export const SUPPORT_STATUSES: SupportTicketStatus[] = ["OPEN", "IN_PROGRESS", "CLOSED"];
export const SUPPORT_PRIORITIES: SupportTicketPriority[] = ["LOW", "NORMAL", "HIGH", "URGENT"];

export const SUPPORT_PRIORITY_LABELS: Record<SupportTicketPriority, string> = {
  LOW: "Baja",
  NORMAL: "Normal",
  HIGH: "Alta",
  URGENT: "Urgente",
};

export class SupportConcurrencyError extends Error {
  constructor(
    message = "Otro integrante del equipo actualizó este ticket mientras lo veías. Recarga la página para ver el último estado.",
  ) {
    super(message);
    this.name = "SupportConcurrencyError";
  }
}

export function isSupportPriority(raw: string | undefined): raw is SupportTicketPriority {
  return SUPPORT_PRIORITIES.includes(raw as SupportTicketPriority);
}

export function isSupportInboxView(raw: string | undefined): raw is SupportInboxView {
  return (
    raw === "OPEN" ||
    raw === "IN_PROGRESS" ||
    raw === "CLOSED" ||
    raw === "mine" ||
    raw === "unassigned" ||
    raw === "sla-risk" ||
    raw === "all"
  );
}

export async function listSupportTickets(filter?: { status?: SupportTicketStatus }) {
  return prisma.supportTicket.findMany({
    where: filter?.status ? { status: filter.status } : {},
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 300,
    select: {
      id: true,
      email: true,
      name: true,
      subject: true,
      message: true,
      status: true,
      priority: true,
      customerId: true,
      contactId: true,
      orderNumber: true,
      linkedCaseType: true,
      linkedCaseId: true,
      assignedToAdminId: true,
      assignedToAdmin: { select: { id: true, email: true } },
      firstRespondedAt: true,
      slaDueAt: true,
      resolvedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export interface SupportTicketListItem {
  id: string;
  email: string;
  name: string;
  subject: string;
  message: string;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  customerId: string | null;
  contactId: string | null;
  orderNumber: string | null;
  linkedCaseType: string | null;
  linkedCaseId: string | null;
  assignedToAdmin: { id: string; email: string } | null;
  firstRespondedAt: Date | null;
  slaDueAt: Date | null;
  sla: SlaEvaluation;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function listAssignableSupportAdmins(): Promise<
  Array<{ id: string; email: string; role: string }>
> {
  return prisma.adminUser.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      role: { in: [...ADMIN_ROLE_SETS.SUPPORT_CARE] },
    },
    orderBy: { email: "asc" },
    select: { id: true, email: true, role: true },
  });
}

export async function listSupportTicketsPaginated(opts: {
  view?: SupportInboxView;
  q?: string;
  priority?: SupportTicketPriority;
  actorAdminId: string;
  page?: number;
  pageSize?: number;
}) {
  const view: SupportInboxView = opts.view ?? "OPEN";
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, opts.pageSize ?? 25));
  const now = new Date();
  const dueSoonCutoff = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  const andClauses: Prisma.SupportTicketWhereInput[] = [];

  if (view === "OPEN" || view === "IN_PROGRESS" || view === "CLOSED") {
    andClauses.push({ status: view });
  } else if (view === "mine") {
    andClauses.push({
      assignedToAdminId: opts.actorAdminId,
      status: { in: ["OPEN", "IN_PROGRESS"] },
    });
  } else if (view === "unassigned") {
    andClauses.push({
      assignedToAdminId: null,
      status: { in: ["OPEN", "IN_PROGRESS"] },
    });
  } else if (view === "sla-risk") {
    andClauses.push({
      status: { in: ["OPEN", "IN_PROGRESS"] },
      slaDueAt: { lte: dueSoonCutoff },
    });
  }

  if (opts.priority) {
    andClauses.push({ priority: opts.priority });
  }

  const cleanQ = opts.q?.trim() ?? "";
  if (cleanQ) {
    const cleanHexPrefix = cleanQ.replace(/^#/, "").trim().toLowerCase();
    andClauses.push({
      OR: [
        { email: { contains: cleanQ, mode: "insensitive" } },
        { name: { contains: cleanQ, mode: "insensitive" } },
        { orderNumber: { contains: cleanQ, mode: "insensitive" } },
        { message: { contains: cleanQ, mode: "insensitive" } },
        ...(cleanHexPrefix.length >= 4 ? [{ id: { startsWith: cleanHexPrefix } }] : []),
      ],
    });
  }

  const where: Prisma.SupportTicketWhereInput = andClauses.length > 0 ? { AND: andClauses } : {};

  const orderBy: Prisma.SupportTicketOrderByWithRelationInput[] =
    view === "sla-risk"
      ? [{ slaDueAt: "asc" }, { createdAt: "asc" }]
      : view === "CLOSED"
        ? [{ resolvedAt: "desc" }, { createdAt: "desc" }]
        : [{ status: "asc" }, { slaDueAt: "asc" }, { createdAt: "desc" }];

  const [rows, total, openCount, inProgressCount, mineCount, unassignedCount, slaRiskCount] =
    await Promise.all([
      prisma.supportTicket.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          email: true,
          name: true,
          subject: true,
          message: true,
          status: true,
          priority: true,
          customerId: true,
          contactId: true,
          orderNumber: true,
          linkedCaseType: true,
          linkedCaseId: true,
          assignedToAdmin: { select: { id: true, email: true } },
          firstRespondedAt: true,
          slaDueAt: true,
          resolvedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.supportTicket.count({ where }),
      prisma.supportTicket.count({ where: { status: "OPEN" } }),
      prisma.supportTicket.count({ where: { status: "IN_PROGRESS" } }),
      prisma.supportTicket.count({
        where: {
          assignedToAdminId: opts.actorAdminId,
          status: { in: ["OPEN", "IN_PROGRESS"] },
        },
      }),
      prisma.supportTicket.count({
        where: {
          assignedToAdminId: null,
          status: { in: ["OPEN", "IN_PROGRESS"] },
        },
      }),
      prisma.supportTicket.count({
        where: {
          status: { in: ["OPEN", "IN_PROGRESS"] },
          slaDueAt: { lte: dueSoonCutoff },
        },
      }),
    ]);

  const items: SupportTicketListItem[] = rows.map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    subject: r.subject,
    message: r.message,
    status: r.status as SupportTicketStatus,
    priority: (isSupportPriority(r.priority) ? r.priority : "NORMAL") as SupportTicketPriority,
    customerId: r.customerId,
    contactId: r.contactId,
    orderNumber: r.orderNumber,
    linkedCaseType: r.linkedCaseType,
    linkedCaseId: r.linkedCaseId,
    assignedToAdmin: r.assignedToAdmin,
    firstRespondedAt: r.firstRespondedAt,
    slaDueAt: r.slaDueAt,
    sla: evaluateSlaStatus(r.slaDueAt, {
      now,
      isClosed: r.status === "CLOSED",
    }),
    resolvedAt: r.resolvedAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    counts: {
      open: openCount,
      inProgress: inProgressCount,
      mine: mineCount,
      unassigned: unassignedCount,
      slaRisk: slaRiskCount,
    },
  };
}

/** Nº de tickets que requieren atención (para el badge del dashboard). */
export async function countOpenSupportTickets(): Promise<number> {
  return prisma.supportTicket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } });
}

async function sendTicketClosedEmail(ticket: {
  id: string;
  name: string;
  email: string;
  subject: string;
}): Promise<void> {
  try {
    const tpl = await renderSupportTicketClosedEmail({
      customerName: ticket.name,
      ticketId: ticket.id,
      subject: ticket.subject as keyof typeof SUBJECT_LABELS,
    });
    const result = await sendEmail({
      to: ticket.email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      replyTo: tpl.replyTo,
      idempotencyKey: `support:closed:${ticket.id}`,
      tags: [{ name: "kind", value: "support-closed" }],
    });
    logger.info({
      event: "support.ticket.closed_email.sent",
      ticketId: ticket.id,
      result: result.sent ? "ok" : `skip:${result.reason}`,
    });
  } catch (err) {
    logger.error({
      event: "support.ticket.closed_email.fail",
      ticketId: ticket.id,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Cambia el estado de un ticket.
 *  - Si `opts?.expectedUpdatedAt` viene informado, aplica control optimista sobre `updatedAt`
 *    y lanza `SupportConcurrencyError` si otro agente modificó el registro entretanto.
 *  - Al cerrar (`!CLOSED -> CLOSED`), dispara el correo N-14 idempotente.
 */
export async function setSupportTicketStatus(
  id: string,
  status: SupportTicketStatus,
  adminId: string,
  opts?: {
    expectedUpdatedAt?: Date | null;
    autoAssignIfUnassigned?: boolean;
  },
) {
  const closing = status === "CLOSED";
  const prev = await prisma.supportTicket.findUnique({
    where: { id },
    select: {
      status: true,
      name: true,
      email: true,
      subject: true,
      assignedToAdminId: true,
      updatedAt: true,
    },
  });
  if (!prev) throw new Error(`Ticket ${id} no encontrado`);

  const baseData: Prisma.SupportTicketUncheckedUpdateInput = {
    status,
    resolvedAt: closing ? new Date() : null,
    resolvedBy: closing ? adminId : null,
  };

  if (opts?.autoAssignIfUnassigned && !prev.assignedToAdminId && status === "IN_PROGRESS") {
    baseData.assignedToAdminId = adminId;
  }

  if (opts?.expectedUpdatedAt) {
    const updated = await prisma.supportTicket.updateMany({
      where: { id, updatedAt: opts.expectedUpdatedAt },
      data: baseData,
    });
    if (updated.count === 0) {
      throw new SupportConcurrencyError();
    }
  } else {
    await prisma.supportTicket.update({
      where: { id },
      data: baseData,
    });
  }

  if (closing && prev.status !== "CLOSED") {
    await sendTicketClosedEmail({
      id,
      name: prev.name,
      email: prev.email,
      subject: prev.subject,
    });
  }
}

/**
 * Actualiza el responsable (`assignedToAdminId`) y/o la prioridad (`priority`) de un ticket
 * con bloqueo optimista sobre `expectedUpdatedAt`.
 */
export async function updateSupportTicketGovernance(input: {
  id: string;
  assignedToAdminId: string | null;
  priority: SupportTicketPriority;
  expectedUpdatedAt?: Date | null;
}): Promise<void> {
  if (!isSupportPriority(input.priority)) {
    throw new Error("Prioridad no válida.");
  }

  if (input.assignedToAdminId) {
    const assignee = await prisma.adminUser.findFirst({
      where: {
        id: input.assignedToAdminId,
        isActive: true,
        deletedAt: null,
        role: { in: [...ADMIN_ROLE_SETS.SUPPORT_CARE] },
      },
      select: { id: true },
    });
    if (!assignee) {
      throw new Error("El integrante seleccionado no está activo o no pertenece a soporte.");
    }
  }

  if (input.expectedUpdatedAt) {
    const res = await prisma.supportTicket.updateMany({
      where: { id: input.id, updatedAt: input.expectedUpdatedAt },
      data: {
        assignedToAdminId: input.assignedToAdminId,
        priority: input.priority,
      },
    });
    if (res.count === 0) {
      throw new SupportConcurrencyError();
    }
    return;
  }

  await prisma.supportTicket.update({
    where: { id: input.id },
    data: {
      assignedToAdminId: input.assignedToAdminId,
      priority: input.priority,
    },
  });
}
