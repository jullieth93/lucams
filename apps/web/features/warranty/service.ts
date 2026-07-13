import "server-only";
import { prisma } from "@/lib/db";

/*
 * Garantía legal (Ley 1480 art. 7-15). Un cliente reporta un defecto de un producto comprado;
 * el negocio diagnostica y aplica un remedio (reparación / cambio / devolución del dinero).
 *
 * Diferencias vs retracto (Ley 2439):
 *  - Ventana = Product.warrantyMonths (meses calendario) desde la ENTREGA, no 5 días hábiles.
 *  - Los productos PERSONALIZADOS sí tienen garantía (un imán defectuoso se cubre).
 *  - Historial permitido: un producto puede fallar varias veces; se bloquea un nuevo reclamo
 *    solo si ya hay uno ACTIVO (PENDING/IN_REVIEW/APPROVED) para ese item.
 */

export type WarrantyStatus = "PENDING" | "IN_REVIEW" | "APPROVED" | "RESOLVED" | "REJECTED";
export type WarrantyResolution = "REPAIR" | "REPLACE" | "REFUND";

export const WARRANTY_RESOLUTIONS: WarrantyResolution[] = ["REPAIR", "REPLACE", "REFUND"];
const ACTIVE_STATUSES: WarrantyStatus[] = ["PENDING", "IN_REVIEW", "APPROVED"];

// ── Ventana de garantía ──
export function warrantyWindowEnd(deliveredAt: Date, warrantyMonths: number): Date {
  const end = new Date(deliveredAt);
  end.setMonth(end.getMonth() + warrantyMonths);
  return end;
}
export function isWithinWarranty(deliveredAt: Date, warrantyMonths: number, now: Date): boolean {
  return now.getTime() <= warrantyWindowEnd(deliveredAt, warrantyMonths).getTime();
}

// ── Elegibilidad por item (flujo cliente) ──
export type WarrantyIneligibleReason = "NOT_DELIVERED" | "OUT_OF_WARRANTY" | "ACTIVE_CLAIM";

export type WarrantyItem = {
  orderItemId: string;
  productName: string;
  qty: number;
  warrantyMonths: number;
  warrantyEndsAt: Date | null;
  eligible: boolean;
  reason: WarrantyIneligibleReason | null;
  activeClaimStatus: WarrantyStatus | null;
};

/** Items de una orden del cliente con su elegibilidad de garantía. */
export async function getWarrantyItems(orderId: string, customerId: string): Promise<WarrantyItem[]> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, customerId, deletedAt: null },
    select: {
      status: true,
      deliveredAt: true,
      items: {
        select: {
          id: true,
          qty: true,
          variant: { select: { product: { select: { name: true, warrantyMonths: true } } } },
          warrantyClaims: {
            where: { status: { in: ACTIVE_STATUSES } },
            select: { status: true },
            take: 1,
          },
        },
      },
    },
  });
  if (!order) return [];
  const now = new Date();
  const delivered = order.status === "DELIVERED" && !!order.deliveredAt;
  return order.items.map((it) => {
    const wm = it.variant.product.warrantyMonths;
    const within = order.deliveredAt ? isWithinWarranty(order.deliveredAt, wm, now) : false;
    const active = (it.warrantyClaims[0]?.status as WarrantyStatus | undefined) ?? null;
    let reason: WarrantyIneligibleReason | null = null;
    if (!delivered) reason = "NOT_DELIVERED";
    else if (!within) reason = "OUT_OF_WARRANTY";
    else if (active) reason = "ACTIVE_CLAIM";
    return {
      orderItemId: it.id,
      productName: it.variant.product.name,
      qty: it.qty,
      warrantyMonths: wm,
      warrantyEndsAt: order.deliveredAt ? warrantyWindowEnd(order.deliveredAt, wm) : null,
      eligible: reason === null,
      reason,
      activeClaimStatus: active,
    };
  });
}

export class WarrantyError extends Error {
  constructor(
    public readonly reason:
      | "NOT_FOUND"
      | "FORBIDDEN"
      | "NOT_DELIVERED"
      | "OUT_OF_WARRANTY"
      | "ACTIVE_CLAIM"
      | "INVALID",
  ) {
    super(reason);
    this.name = "WarrantyError";
  }
}

/** Crea un reclamo de garantía (cliente). Valida propiedad + entrega + ventana + no-duplicado. */
export async function createWarrantyClaim(input: {
  orderItemId: string;
  customerId: string;
  description: string;
  evidenceUrls?: string[];
}): Promise<{ id: string }> {
  const item = await prisma.orderItem.findUnique({
    where: { id: input.orderItemId },
    select: {
      id: true,
      variant: { select: { product: { select: { warrantyMonths: true } } } },
      order: { select: { customerId: true, status: true, deliveredAt: true, deletedAt: true } },
      warrantyClaims: { where: { status: { in: ACTIVE_STATUSES } }, select: { id: true }, take: 1 },
    },
  });
  if (!item || item.order.deletedAt) throw new WarrantyError("NOT_FOUND");
  if (item.order.customerId !== input.customerId) throw new WarrantyError("FORBIDDEN");
  if (item.order.status !== "DELIVERED" || !item.order.deliveredAt) {
    throw new WarrantyError("NOT_DELIVERED");
  }
  if (!isWithinWarranty(item.order.deliveredAt, item.variant.product.warrantyMonths, new Date())) {
    throw new WarrantyError("OUT_OF_WARRANTY");
  }
  if (item.warrantyClaims.length > 0) throw new WarrantyError("ACTIVE_CLAIM");
  const description = input.description.trim();
  if (description.length < 10) throw new WarrantyError("INVALID");
  return prisma.warrantyClaim.create({
    data: {
      orderItemId: item.id,
      customerId: input.customerId,
      description: description.slice(0, 2000),
      evidenceUrls: (input.evidenceUrls ?? []).slice(0, 5),
      status: "PENDING",
    },
    select: { id: true },
  });
}

// ── Listado + gestión (admin) ──
export type WarrantyClaimRow = {
  id: string;
  status: WarrantyStatus;
  description: string;
  evidenceUrls: string[];
  resolutionType: WarrantyResolution | null;
  resolutionNote: string | null;
  requestedAt: Date;
  resolvedAt: Date | null;
  customerEmail: string;
  customerName: string;
  orderNumber: string;
  productName: string;
  qty: number;
};

export async function listWarrantyClaims(filter?: {
  status?: WarrantyStatus;
}): Promise<WarrantyClaimRow[]> {
  const rows = await prisma.warrantyClaim.findMany({
    where: filter?.status ? { status: filter.status } : {},
    orderBy: [{ status: "asc" }, { requestedAt: "desc" }],
    take: 300,
    select: {
      id: true,
      status: true,
      description: true,
      evidenceUrls: true,
      resolutionType: true,
      resolutionNote: true,
      requestedAt: true,
      resolvedAt: true,
      customer: { select: { email: true, firstName: true, lastName: true } },
      orderItem: {
        select: {
          qty: true,
          order: { select: { number: true } },
          variant: { select: { product: { select: { name: true } } } },
        },
      },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    status: r.status as WarrantyStatus,
    description: r.description,
    evidenceUrls: r.evidenceUrls,
    resolutionType: (r.resolutionType as WarrantyResolution | null) ?? null,
    resolutionNote: r.resolutionNote,
    requestedAt: r.requestedAt,
    resolvedAt: r.resolvedAt,
    customerEmail: r.customer?.email ?? "—",
    customerName: [r.customer?.firstName, r.customer?.lastName].filter(Boolean).join(" ") || "Cliente",
    orderNumber: r.orderItem.order.number,
    productName: r.orderItem.variant.product.name,
    qty: r.orderItem.qty,
  }));
}

/** Nº de reclamos activos (para el badge del dashboard). */
export async function countOpenWarrantyClaims(): Promise<number> {
  return prisma.warrantyClaim.count({ where: { status: { in: ACTIVE_STATUSES } } });
}

export class WarrantyTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Transición inválida ${from} → ${to}`);
    this.name = "WarrantyTransitionError";
  }
}

async function loadClaim(id: string): Promise<{ status: WarrantyStatus }> {
  const c = await prisma.warrantyClaim.findUnique({ where: { id }, select: { status: true } });
  if (!c) throw new WarrantyError("NOT_FOUND");
  return { status: c.status as WarrantyStatus };
}

/** PENDING → IN_REVIEW (empezar diagnóstico). */
export async function reviewWarrantyClaim(id: string, adminId: string): Promise<void> {
  const { status } = await loadClaim(id);
  if (status !== "PENDING") throw new WarrantyTransitionError(status, "IN_REVIEW");
  await prisma.warrantyClaim.update({
    where: { id },
    data: { status: "IN_REVIEW", processedBy: adminId },
  });
}

/** {PENDING, IN_REVIEW} → APPROVED (procede; se elige el remedio y queda en ejecución). */
export async function approveWarrantyClaim(
  id: string,
  adminId: string,
  resolution: WarrantyResolution,
): Promise<void> {
  const { status } = await loadClaim(id);
  if (status !== "PENDING" && status !== "IN_REVIEW") {
    throw new WarrantyTransitionError(status, "APPROVED");
  }
  await prisma.warrantyClaim.update({
    where: { id },
    data: { status: "APPROVED", resolutionType: resolution, processedBy: adminId },
  });
}

/** APPROVED → RESOLVED (remedio ejecutado). */
export async function resolveWarrantyClaim(
  id: string,
  adminId: string,
  note?: string,
): Promise<void> {
  const { status } = await loadClaim(id);
  if (status !== "APPROVED") throw new WarrantyTransitionError(status, "RESOLVED");
  await prisma.warrantyClaim.update({
    where: { id },
    data: {
      status: "RESOLVED",
      resolvedAt: new Date(),
      processedBy: adminId,
      ...(note ? { resolutionNote: note.slice(0, 500) } : {}),
    },
  });
}

/** {PENDING, IN_REVIEW} → REJECTED (no procede; motivo obligatorio). */
export async function rejectWarrantyClaim(id: string, adminId: string, note: string): Promise<void> {
  const { status } = await loadClaim(id);
  if (status !== "PENDING" && status !== "IN_REVIEW") {
    throw new WarrantyTransitionError(status, "REJECTED");
  }
  const reason = note.trim();
  if (!reason) throw new WarrantyError("INVALID");
  await prisma.warrantyClaim.update({
    where: { id },
    data: {
      status: "REJECTED",
      resolvedAt: new Date(),
      processedBy: adminId,
      resolutionNote: reason.slice(0, 500),
    },
  });
}
