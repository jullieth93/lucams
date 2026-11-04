/*
 * Servicio de Bandeja Operativa `/admin/hoy` (`Fase 11 · S23`).
 *
 * Consolida en tiempo real los pendientes accionables del negocio respondiendo:
 *   - ¿Qué está vencido o por vencer hoy?
 *   - ¿Qué me corresponde a mí según mi rol y asignación?
 *   - ¿Qué cliente o pedido está bloqueado esperando acción humana?
 *
 * Garantías de seguridad (cero suposiciones):
 *   1. Filtrado estricto por capacidades (`hasCapability`) y rutas (`canAccessAdminPath`).
 *   2. Aislamiento horizontal en tareas: perfiles sin `contacts:read_360` solo reciben
 *      tareas propias o vinculadas a pedidos operativos de su ámbito.
 *   3. Enmascaramiento determinista de PII en servidor (`maskPersonName`, `maskEmail`)
 *      ANTES de retornar el objeto al RSC cuando el rol carece de `orders:read_pii`
 *      o `contacts:read_pii` (ej. `PRINT_WORKSHOP`, `FULFILLMENT`).
 */

import "server-only";
import type { AdminRole } from "@lucams/db";
import { prisma } from "@/lib/db";
import { canAccessAdminPath, hasCapability } from "@/lib/admin-rbac";
import { evaluateSlaStatus, type SlaSemaphoreState } from "@/lib/colombian-sla";
import { maskEmail, maskPersonName } from "@/lib/pii-mask";
import { formatCOP } from "@/lib/format";
import { isCrmTaskPriority, type CrmTaskPriority } from "./constants";

export type TodayQueueCategory = "TASK" | "CARE_SLA" | "WORKSHOP" | "FINANCE" | "RECOVERY";

export type TodaySeverity = "CRITICAL" | "HIGH" | "NORMAL";

export type TodayInboxItem = {
  id: string;
  sourceId: string;
  category: TodayQueueCategory;
  severity: TodaySeverity;
  title: string;
  subtitle: string;
  badgeLabel: string;
  badgeTone: "rose" | "amber" | "purple" | "blue" | "emerald" | "slate" | "pink" | "turquoise";
  assignedToMe: boolean;
  isOverdue: boolean;
  dueAtIso: string | null;
  createdAtIso: string;
  actionHref: string;
  actionLabel: string;
  /** Si el ítem es una `Task` directa y el rol posee `crm:manage_tasks`, permite completarla en 1 clic desde `/admin/hoy`. */
  completableTaskId: string | null;
};

export type TodayInboxResult = {
  items: TodayInboxItem[];
  counts: {
    total: number;
    assignedToMe: number;
    overdueOrCritical: number;
    byCategory: Record<TodayQueueCategory, number>;
  };
  piiMasked: boolean;
};

const SEVERITY_RANK: Record<TodaySeverity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  NORMAL: 2,
};

function slaToSeverity(state: SlaSemaphoreState): TodaySeverity {
  if (state === "OVERDUE") return "CRITICAL";
  if (state === "DUE_SOON") return "HIGH";
  return "NORMAL";
}

function taskPriorityToSeverity(priority: CrmTaskPriority, isOverdue: boolean): TodaySeverity {
  if (isOverdue || priority === "URGENT") return "CRITICAL";
  if (priority === "HIGH") return "HIGH";
  return "NORMAL";
}

function extractShippingCustomerName(shippingAddress: unknown, maskPii: boolean): string {
  if (!shippingAddress || typeof shippingAddress !== "object" || Array.isArray(shippingAddress)) {
    return "Cliente";
  }
  const rec = shippingAddress as Record<string, unknown>;
  const rawName = typeof rec.fullName === "string" ? rec.fullName.trim() : "";
  if (!rawName) return "Cliente";
  return maskPii ? maskPersonName(rawName) : rawName;
}

export async function getTodayOperationalInbox(
  admin: { id: string; role: AdminRole },
  now: Date = new Date(),
): Promise<TodayInboxResult> {
  const { id: adminId, role } = admin;
  if (!hasCapability(role, "dashboard:read")) {
    return {
      items: [],
      counts: {
        total: 0,
        assignedToMe: 0,
        overdueOrCritical: 0,
        byCategory: { TASK: 0, CARE_SLA: 0, WORKSHOP: 0, FINANCE: 0, RECOVERY: 0 },
      },
      piiMasked: true,
    };
  }

  const canReadOrderPii = hasCapability(role, "orders:read_pii");
  const canReadContactPii = hasCapability(role, "contacts:read_pii");
  const canRead360 = hasCapability(role, "contacts:read_360");
  const canManageTasks = hasCapability(role, "crm:manage_tasks");
  const canManageRetract = hasCapability(role, "retract:manage");
  const canManageSupport = hasCapability(role, "support:manage");
  const canManageWarranty = hasCapability(role, "warranty:manage");
  const canTransitionOrders = hasCapability(role, "orders:transition");
  const canModerate = hasCapability(role, "production:moderate");
  const canReconcileOrders = hasCapability(role, "orders:reconcile");
  const canReconcileCod = hasCapability(role, "finance:reconcile_cod");
  const canRecoverCarts = hasCapability(role, "carts:recover") && canReadOrderPii;

  const maskPii = !canReadOrderPii && !canReadContactPii;
  const nowMs = now.getTime();
  const next24h = new Date(nowMs + 24 * 60 * 60 * 1000);
  const next48h = new Date(nowMs + 48 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(nowMs - 7 * 24 * 60 * 60 * 1000);

  const items: TodayInboxItem[] = [];

  const [
    tasks,
    retracts,
    tickets,
    warranties,
    failedRenders,
    pendingDesigns,
    reconciliationOrders,
    codUnreconciled,
    declinedOrders,
  ] = await Promise.all([
    // 1. Tareas CRM (`Task`) abiertas o en curso
    canManageTasks
      ? prisma.task.findMany({
          where: {
            status: { in: ["OPEN", "IN_PROGRESS"] },
            ...(canRead360
              ? {
                  OR: [
                    { ownerAdminId: adminId },
                    { ownerAdminId: null },
                    { dueAt: { lte: next24h } },
                    { priority: { in: ["HIGH", "URGENT"] } },
                  ],
                }
              : {
                  OR: [
                    { ownerAdminId: adminId },
                    ...(canTransitionOrders
                      ? [{ ownerAdminId: null, orderId: { not: null } }]
                      : []),
                  ],
                }),
          },
          orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
          take: 40,
          include: {
            contact: { select: { id: true, displayName: true } },
            order: { select: { id: true, number: true } },
            supportTicket: { select: { id: true } },
            ownerAdmin: { select: { email: true } },
          },
        })
      : Promise.resolve([]),

    // 2. Retractos Ley 1480 activos (15 días calendario máximo de reembolso)
    canManageRetract
      ? prisma.retractRequest.findMany({
          where: { status: { in: ["PENDING", "APPROVED", "RECEIVED"] } },
          orderBy: [{ slaDueAt: "asc" }, { requestedAt: "asc" }],
          take: 25,
          include: {
            orderItem: {
              select: {
                order: { select: { number: true, shippingAddress: true } },
              },
            },
          },
        })
      : Promise.resolve([]),

    // 3. Tickets de soporte sin 1ª respuesta, en riesgo SLA o asignados al agente
    canManageSupport
      ? prisma.supportTicket.findMany({
          where: {
            status: { in: ["OPEN", "IN_PROGRESS"] },
            OR: [
              { firstRespondedAt: null },
              { slaDueAt: { lte: next48h } },
              { assignedToAdminId: adminId },
            ],
          },
          orderBy: [{ slaDueAt: "asc" }, { createdAt: "asc" }],
          take: 30,
        })
      : Promise.resolve([]),

    // 4. Reclamos de garantía abiertos (15 días hábiles SIC)
    canManageWarranty
      ? prisma.warrantyClaim.findMany({
          where: { status: { in: ["PENDING", "IN_REVIEW", "APPROVED"] } },
          orderBy: [{ slaDueAt: "asc" }, { requestedAt: "asc" }],
          take: 25,
          include: {
            orderItem: {
              select: {
                order: { select: { number: true, shippingAddress: true } },
              },
            },
          },
        })
      : Promise.resolve([]),

    // 5. Renders 300 DPI fallidos en pedidos pagados / en preparación
    canTransitionOrders
      ? prisma.renderJob.findMany({
          where: {
            status: "FAILED",
            design: {
              orderItems: {
                some: {
                  order: { deletedAt: null, status: { in: ["PAID", "FULFILLING"] } },
                },
              },
            },
          },
          orderBy: { updatedAt: "desc" },
          take: 20,
          include: {
            design: {
              select: {
                product: { select: { name: true } },
                orderItems: {
                  where: {
                    order: { deletedAt: null, status: { in: ["PAID", "FULFILLING"] } },
                  },
                  take: 1,
                  select: {
                    order: { select: { number: true, shippingAddress: true } },
                  },
                },
              },
            },
          },
        })
      : Promise.resolve([]),

    // 6. Diseños pendientes de moderación en pedidos activos
    canModerate
      ? prisma.design.findMany({
          where: {
            moderationStatus: "PENDING",
            orderItems: {
              some: {
                order: { deletedAt: null, status: { in: ["PAID", "FULFILLING"] } },
              },
            },
          },
          orderBy: { updatedAt: "asc" },
          take: 20,
          select: {
            id: true,
            updatedAt: true,
            product: { select: { name: true } },
            orderItems: {
              where: {
                order: { deletedAt: null, status: { in: ["PAID", "FULFILLING"] } },
              },
              take: 1,
              select: {
                order: { select: { number: true, shippingAddress: true } },
              },
            },
          },
        })
      : Promise.resolve([]),

    // 7. Pedidos marcados con `needsReconciliation = true`
    canReconcileOrders
      ? prisma.order.findMany({
          where: { deletedAt: null, needsReconciliation: true },
          orderBy: { updatedAt: "desc" },
          take: 20,
          select: {
            id: true,
            number: true,
            total: true,
            updatedAt: true,
            shippingAddress: true,
          },
        })
      : Promise.resolve([]),

    // 8. Pedidos COD entregados hace > 7 días sin remesa conciliada o con discrepancia
    canReconcileCod
      ? prisma.order.findMany({
          where: {
            deletedAt: null,
            paymentMethod: "COD",
            status: "DELIVERED",
            updatedAt: { lte: sevenDaysAgo },
            OR: [{ codReconciliation: null }, { codReconciliation: { status: "DISCREPANCY" } }],
          },
          orderBy: { updatedAt: "asc" },
          take: 25,
          select: {
            id: true,
            number: true,
            total: true,
            updatedAt: true,
            shippingAddress: true,
            codReconciliation: { select: { status: true } },
          },
        })
      : Promise.resolve([]),

    // 9. Intentos de pago Wompi rechazados recientemente en órdenes aún sin pagar
    canRecoverCarts
      ? prisma.order.findMany({
          where: {
            deletedAt: null,
            status: "PENDING_PAYMENT",
            createdAt: { gte: sevenDaysAgo },
            wompiAttempts: {
              some: {
                OR: [
                  { status: "FAILED" },
                  { transactions: { some: { status: { in: ["DECLINED", "ERROR"] } } } },
                ],
              },
            },
          },
          orderBy: { updatedAt: "desc" },
          take: 15,
          select: {
            id: true,
            number: true,
            total: true,
            contactId: true,
            updatedAt: true,
            shippingAddress: true,
          },
        })
      : Promise.resolve([]),
  ]);

  // --- Mapear Tareas ---
  for (const t of tasks) {
    const priority: CrmTaskPriority = isCrmTaskPriority(t.priority) ? t.priority : "NORMAL";
    const isOverdue = t.dueAt !== null && t.dueAt.getTime() < nowMs;
    const assignedToMe = t.ownerAdminId === adminId;

    const contactDisplay = t.contact
      ? canReadContactPii
        ? t.contact.displayName
        : maskPersonName(t.contact.displayName)
      : null;

    let actionHref = "/admin/hoy";
    let actionLabel = "Revisar";
    if (t.order?.number && canAccessAdminPath(role, "/admin/pedidos")) {
      actionHref = `/admin/pedidos/${encodeURIComponent(t.order.number)}`;
      actionLabel = `Abrir ${t.order.number}`;
    } else if (t.supportTicket?.id && canAccessAdminPath(role, "/admin/soporte")) {
      actionHref = `/admin/soporte/${encodeURIComponent(t.supportTicket.id)}`;
      actionLabel = "Abrir ticket";
    } else if (t.contact?.id && canAccessAdminPath(role, "/admin/clientes")) {
      actionHref = `/admin/clientes/${encodeURIComponent(t.contact.id)}`;
      actionLabel = "Contacto 360";
    }

    const subtitleParts: string[] = [];
    if (contactDisplay) subtitleParts.push(contactDisplay);
    if (t.order?.number) subtitleParts.push(`Pedido ${t.order.number}`);
    if (t.ownerAdmin?.email) {
      subtitleParts.push(assignedToMe ? "Asignada a ti" : `Responsable: ${t.ownerAdmin.email}`);
    } else {
      subtitleParts.push("Sin responsable asignado");
    }

    items.push({
      id: `task:${t.id}`,
      sourceId: t.id,
      category: "TASK",
      severity: taskPriorityToSeverity(priority, isOverdue),
      title: t.title,
      subtitle: subtitleParts.join(" · "),
      badgeLabel: isOverdue
        ? "Tarea vencida"
        : priority === "URGENT"
          ? "Tarea urgente"
          : "Tarea CRM",
      badgeTone:
        isOverdue || priority === "URGENT" ? "rose" : priority === "HIGH" ? "amber" : "purple",
      assignedToMe,
      isOverdue,
      dueAtIso: t.dueAt ? t.dueAt.toISOString() : null,
      createdAtIso: t.createdAt.toISOString(),
      actionHref,
      actionLabel,
      completableTaskId: canManageTasks ? t.id : null,
    });
  }

  // --- Mapear Retractos ---
  for (const r of retracts) {
    const sla = evaluateSlaStatus(r.slaDueAt, { now, isClosed: false });
    const orderNum = r.orderItem.order.number;
    const customerName = extractShippingCustomerName(
      r.orderItem.order.shippingAddress,
      !canReadOrderPii,
    );

    items.push({
      id: `retract:${r.id}`,
      sourceId: r.id,
      category: "CARE_SLA",
      severity: sla.state === "OVERDUE" ? "CRITICAL" : "HIGH",
      title: `Retracto Ley 1480 · Pedido ${orderNum}`,
      subtitle: `${customerName} · Reembolso ${formatCOP(r.refundAmount)} · ${sla.label}`,
      badgeLabel: sla.label,
      badgeTone: sla.badgeTone,
      assignedToMe: r.assignedToAdminId === adminId,
      isOverdue: sla.state === "OVERDUE",
      dueAtIso: r.slaDueAt ? r.slaDueAt.toISOString() : null,
      createdAtIso: r.requestedAt.toISOString(),
      actionHref: "/admin/retractos",
      actionLabel: "Gestionar retracto",
      completableTaskId: null,
    });
  }

  // --- Mapear Tickets de soporte ---
  for (const tk of tickets) {
    const sla = evaluateSlaStatus(tk.slaDueAt, { now, isClosed: false });
    const displayPerson = canReadContactPii ? tk.name : maskPersonName(tk.name);
    const displayEmail = canReadContactPii ? tk.email : maskEmail(tk.email);
    const needsFirstReply = tk.firstRespondedAt === null;

    items.push({
      id: `ticket:${tk.id}`,
      sourceId: tk.id,
      category: "CARE_SLA",
      severity:
        sla.state === "OVERDUE"
          ? "CRITICAL"
          : needsFirstReply || sla.state === "DUE_SOON"
            ? "HIGH"
            : "NORMAL",
      title: `Ticket #${tk.id.slice(0, 8).toUpperCase()}${needsFirstReply ? " · Sin 1ª respuesta" : ""}`,
      subtitle: `${displayPerson} (${displayEmail}) · ${sla.label}`,
      badgeLabel: sla.label,
      badgeTone: sla.badgeTone,
      assignedToMe: tk.assignedToAdminId === adminId,
      isOverdue: sla.state === "OVERDUE",
      dueAtIso: tk.slaDueAt ? tk.slaDueAt.toISOString() : null,
      createdAtIso: tk.createdAt.toISOString(),
      actionHref: `/admin/soporte/${encodeURIComponent(tk.id)}`,
      actionLabel: "Responder hilo",
      completableTaskId: null,
    });
  }

  // --- Mapear Garantías ---
  for (const w of warranties) {
    const sla = evaluateSlaStatus(w.slaDueAt, { now, isClosed: false });
    const orderNum = w.orderItem.order.number;
    const customerName = extractShippingCustomerName(
      w.orderItem.order.shippingAddress,
      !canReadOrderPii,
    );

    items.push({
      id: `warranty:${w.id}`,
      sourceId: w.id,
      category: "CARE_SLA",
      severity: slaToSeverity(sla.state),
      title: `Garantía legal · Pedido ${orderNum}`,
      subtitle: `${customerName} · ${sla.label}`,
      badgeLabel: sla.label,
      badgeTone: sla.badgeTone,
      assignedToMe: w.assignedToAdminId === adminId,
      isOverdue: sla.state === "OVERDUE",
      dueAtIso: w.slaDueAt ? w.slaDueAt.toISOString() : null,
      createdAtIso: w.requestedAt.toISOString(),
      actionHref: "/admin/garantias",
      actionLabel: "Ver garantía",
      completableTaskId: null,
    });
  }

  // --- Mapear Renders 300 DPI fallidos ---
  for (const rj of failedRenders) {
    const orderRef = rj.design.orderItems[0]?.order;
    if (!orderRef) continue;
    const customerName = extractShippingCustomerName(orderRef.shippingAddress, !canReadOrderPii);

    items.push({
      id: `render:${rj.id}`,
      sourceId: rj.id,
      category: "WORKSHOP",
      severity: "CRITICAL",
      title: `Render 300 DPI fallido · ${orderRef.number}`,
      subtitle: `${rj.design.product.name} · ${customerName}`,
      badgeLabel: "Taller bloqueado",
      badgeTone: "rose",
      assignedToMe: false,
      isOverdue: true,
      dueAtIso: null,
      createdAtIso: rj.updatedAt.toISOString(),
      actionHref: `/admin/pedidos/${encodeURIComponent(orderRef.number)}`,
      actionLabel: "Reintentar render",
      completableTaskId: null,
    });
  }

  // --- Mapear Diseños pendientes de moderación ---
  for (const d of pendingDesigns) {
    const orderRef = d.orderItems[0]?.order;
    if (!orderRef) continue;
    const customerName = extractShippingCustomerName(orderRef.shippingAddress, !canReadOrderPii);

    items.push({
      id: `mod:${d.id}`,
      sourceId: d.id,
      category: "WORKSHOP",
      severity: "HIGH",
      title: `Diseño por aprobar · ${orderRef.number}`,
      subtitle: `${d.product.name} · ${customerName}`,
      badgeLabel: "Moderación pendiente",
      badgeTone: "amber",
      assignedToMe: false,
      isOverdue: false,
      dueAtIso: null,
      createdAtIso: d.updatedAt.toISOString(),
      actionHref: "/admin/moderacion",
      actionLabel: "Moderar diseño",
      completableTaskId: null,
    });
  }

  // --- Mapear Pedidos por reconciliar ---
  for (const ord of reconciliationOrders) {
    const customerName = extractShippingCustomerName(ord.shippingAddress, !canReadOrderPii);
    items.push({
      id: `reconcile:${ord.id}`,
      sourceId: ord.id,
      category: "WORKSHOP",
      severity: "CRITICAL",
      title: `Anomalía por reconciliar · ${ord.number}`,
      subtitle: `${customerName} · Total ${formatCOP(ord.total)}`,
      badgeLabel: "Reconciliar",
      badgeTone: "rose",
      assignedToMe: false,
      isOverdue: true,
      dueAtIso: null,
      createdAtIso: ord.updatedAt.toISOString(),
      actionHref: `/admin/pedidos/${encodeURIComponent(ord.number)}`,
      actionLabel: "Revisar pedido",
      completableTaskId: null,
    });
  }

  // --- Mapear Conciliación contraentrega COD ---
  for (const cod of codUnreconciled) {
    const customerName = extractShippingCustomerName(cod.shippingAddress, !canReadOrderPii);
    const hasDiscrepancy = cod.codReconciliation?.status === "DISCREPANCY";
    items.push({
      id: `cod:${cod.id}`,
      sourceId: cod.id,
      category: "FINANCE",
      severity: hasDiscrepancy ? "CRITICAL" : "HIGH",
      title: `Recaudo COD pendiente (>7d) · ${cod.number}`,
      subtitle: `${customerName} · Esperado ${formatCOP(cod.total)}${hasDiscrepancy ? " · Con discrepancia" : ""}`,
      badgeLabel: hasDiscrepancy ? "Discrepancia COD" : "Remesa pendiente",
      badgeTone: hasDiscrepancy ? "rose" : "amber",
      assignedToMe: false,
      isOverdue: hasDiscrepancy,
      dueAtIso: null,
      createdAtIso: cod.updatedAt.toISOString(),
      actionHref: "/admin/finanzas/conciliacion",
      actionLabel: "Conciliar remesa",
      completableTaskId: null,
    });
  }

  // --- Mapear Pagos Wompi rechazados para recuperación ---
  for (const dec of declinedOrders) {
    const customerName = extractShippingCustomerName(dec.shippingAddress, !canReadOrderPii);
    const canGoToContact = dec.contactId && canAccessAdminPath(role, "/admin/clientes");
    items.push({
      id: `declined:${dec.id}`,
      sourceId: dec.id,
      category: "RECOVERY",
      severity: "NORMAL",
      title: `Pago rechazado recuperable · ${dec.number}`,
      subtitle: `${customerName} · Intento fallido por ${formatCOP(dec.total)}`,
      badgeLabel: "Recuperación pago",
      badgeTone: "pink",
      assignedToMe: false,
      isOverdue: false,
      dueAtIso: null,
      createdAtIso: dec.updatedAt.toISOString(),
      actionHref: canGoToContact
        ? `/admin/clientes/${encodeURIComponent(dec.contactId!)}`
        : `/admin/pedidos/${encodeURIComponent(dec.number)}`,
      actionLabel: canGoToContact ? "Contactar cliente" : "Ver pedido",
      completableTaskId: null,
    });
  }

  // Orden determinista: severidad crítica primero -> vencidos -> fecha límite más próxima -> antigüedad.
  items.sort((a, b) => {
    const sevDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (sevDiff !== 0) return sevDiff;
    if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
    const aDue = a.dueAtIso ? new Date(a.dueAtIso).getTime() : Number.MAX_SAFE_INTEGER;
    const bDue = b.dueAtIso ? new Date(b.dueAtIso).getTime() : Number.MAX_SAFE_INTEGER;
    if (aDue !== bDue) return aDue - bDue;
    return new Date(a.createdAtIso).getTime() - new Date(b.createdAtIso).getTime();
  });

  const byCategory: Record<TodayQueueCategory, number> = {
    TASK: 0,
    CARE_SLA: 0,
    WORKSHOP: 0,
    FINANCE: 0,
    RECOVERY: 0,
  };
  let assignedToMeCount = 0;
  let overdueOrCriticalCount = 0;

  for (const item of items) {
    byCategory[item.category] += 1;
    if (item.assignedToMe) assignedToMeCount += 1;
    if (item.isOverdue || item.severity === "CRITICAL") overdueOrCriticalCount += 1;
  }

  return {
    items,
    counts: {
      total: items.length,
      assignedToMe: assignedToMeCount,
      overdueOrCritical: overdueOrCriticalCount,
      byCategory,
    },
    piiMasked: maskPii,
  };
}
