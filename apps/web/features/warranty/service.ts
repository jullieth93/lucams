import "server-only";
import { Prisma } from "@lucams/db";
import { prisma } from "@/lib/db";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { maskEmail, maskPersonName } from "@/lib/pii-mask";
import { logger } from "@/lib/logger";
import { resolvePostSaleContact } from "@/features/identity/resolution-service";
import {
  computeWarrantySlaDueAt,
  evaluateSlaStatus,
  type SlaEvaluation,
} from "@/lib/colombian-sla";
import {
  hashBearerToken,
  verifyEmailMatchesTimingSafe,
  verifyTokenHashTimingSafe,
} from "@/lib/token-hash";
import { addMonthsClampedIsoCO } from "@/lib/datetime";

/*
 * Garantía legal (Ley 1480 art. 7-15). Un cliente reporta un defecto de un producto comprado;
 * el negocio diagnostica y aplica un remedio (reparación / cambio / devolución del dinero).
 *
 * Diferencias vs retracto (Ley 2439):
 *  - Ventana = OrderItem.warrantyMonths (meses calendario) desde la ENTREGA,
 *    es decir, el término sellado cuando se realizó la compra, no el producto
 *    vigente que el Admin podría haber editado después.
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
  return new Date(`${addMonthsClampedIsoCO(deliveredAt, warrantyMonths)}T23:59:59.999-05:00`);
}
export function isWithinWarranty(deliveredAt: Date, warrantyMonths: number, now: Date): boolean {
  return now.getTime() <= warrantyWindowEnd(deliveredAt, warrantyMonths).getTime();
}

/**
 * Sanitiza URLs de evidencia fotográfica (anti-XSS `javascript:`/`data:` y anti-open-redirect).
 * Permite únicamente:
 *  1. Rutas internas seguras `/api/...` (sin `//`, `..` ni barras invertidas).
 *  2. URLs absolutas `https://` válidas.
 * Deduplica y acota a máximo 5 evidencias por reclamo.
 */
export function sanitizeWarrantyEvidenceUrls(urls: unknown): string[] {
  if (!Array.isArray(urls) || urls.length === 0) return [];
  const safe: string[] = [];
  const seen = new Set<string>();
  for (const raw of urls) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.length > 2048) continue;
    if (/[\u0000-\u001F\u007F]/.test(trimmed)) continue;

    let accepted: string | null = null;
    if (trimmed.startsWith("/api/") && !trimmed.startsWith("//")) {
      if (!trimmed.includes("..") && !trimmed.includes("\\")) {
        accepted = trimmed;
      }
    } else {
      try {
        const parsed = new URL(trimmed);
        if (parsed.protocol === "https:" && parsed.hostname.length > 0) {
          accepted = parsed.toString();
        }
      } catch {
        accepted = null;
      }
    }

    if (accepted && !seen.has(accepted)) {
      seen.add(accepted);
      safe.push(accepted);
      if (safe.length >= 5) break;
    }
  }
  return safe;
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
export async function getWarrantyItems(
  orderId: string,
  customerId: string,
): Promise<WarrantyItem[]> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, customerId, deletedAt: null },
    select: {
      status: true,
      deliveredAt: true,
      items: {
        select: {
          id: true,
          qty: true,
          warrantyMonths: true,
          variant: { select: { product: { select: { name: true } } } },
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
  return mapOrderToWarrantyItems(order, new Date());
}

/**
 * [CX-01] — Elegibilidad de garantía para `/pedido/[token]` (invitados y compradores con link
 * de seguimiento autenticado por `publicAccessTokenHash`).
 */
export async function getWarrantyItemsByOrderToken(
  token: string,
  now: Date = new Date(),
): Promise<WarrantyItem[]> {
  if (!/^[a-f0-9]{32}$/.test(token)) return [];
  const tokenHash = hashBearerToken(token);
  const order = await prisma.order.findFirst({
    where: { publicAccessTokenHash: tokenHash, deletedAt: null },
    select: {
      publicAccessTokenHash: true,
      status: true,
      deliveredAt: true,
      items: {
        select: {
          id: true,
          qty: true,
          warrantyMonths: true,
          variant: { select: { product: { select: { name: true } } } },
          warrantyClaims: {
            where: { status: { in: ACTIVE_STATUSES } },
            select: { status: true },
            take: 1,
          },
        },
      },
    },
  });
  if (!order || !verifyTokenHashTimingSafe(token, order.publicAccessTokenHash)) return [];
  return mapOrderToWarrantyItems(order, now);
}

function mapOrderToWarrantyItems(
  order: {
    status: string;
    deliveredAt: Date | null;
    items: Array<{
      id: string;
      qty: number;
      warrantyMonths: number;
      variant: { product: { name: string } };
      warrantyClaims: Array<{ status: string }>;
    }>;
  },
  now: Date,
): WarrantyItem[] {
  const delivered = order.status === "DELIVERED" && !!order.deliveredAt;
  return order.items.map((it) => {
    const wm = it.warrantyMonths;
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
      | "INVALID"
      | "INVALID_ASSIGNEE",
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
      warrantyMonths: true,
      order: {
        select: {
          customerId: true,
          contactId: true,
          email: true,
          status: true,
          deliveredAt: true,
          deletedAt: true,
        },
      },
      warrantyClaims: { where: { status: { in: ACTIVE_STATUSES } }, select: { id: true }, take: 1 },
    },
  });
  if (!item || item.order.deletedAt) throw new WarrantyError("NOT_FOUND");
  if (item.order.customerId !== input.customerId) throw new WarrantyError("FORBIDDEN");
  if (item.order.status !== "DELIVERED" || !item.order.deliveredAt) {
    throw new WarrantyError("NOT_DELIVERED");
  }
  if (!isWithinWarranty(item.order.deliveredAt, item.warrantyMonths, new Date())) {
    throw new WarrantyError("OUT_OF_WARRANTY");
  }
  if (item.warrantyClaims.length > 0) throw new WarrantyError("ACTIVE_CLAIM");
  const description = input.description.trim();
  if (description.length < 10) throw new WarrantyError("INVALID");
  const contactId = await resolvePostSaleContact(prisma, {
    orderContactId: item.order.contactId,
    customerId: input.customerId,
    orderEmail: item.order.email,
  });
  return prisma.warrantyClaim.create({
    data: {
      orderItemId: item.id,
      customerId: input.customerId,
      ...(contactId ? { contactId } : {}),
      description: description.slice(0, 2000),
      evidenceUrls: sanitizeWarrantyEvidenceUrls(input.evidenceUrls),
      status: "PENDING",
      slaDueAt: computeWarrantySlaDueAt(new Date()),
    },
    select: { id: true },
  });
}

/**
 * [CX-01] — Crea un reclamo de garantía desde `/pedido/[token]` para compradores sin cuenta.
 * Exige:
 *  1. `token` de 32 hex válido cuyo SHA-256 coincida timing-safely con `order.publicAccessTokenHash`.
 *  2. Confirmación timing-safe del correo del comprador (`order.email`) para evitar que un
 *     destinatario de regalo con solo el enlace dispare reclamos a nombre del comprador.
 *  3. Mismas reglas legales de entrega, ventana `warrantyMonths` y ausencia de reclamo activo.
 */
export async function createGuestWarrantyClaim(input: {
  token: string;
  email: string;
  orderItemId: string;
  description: string;
  evidenceUrls?: string[];
  now?: Date;
}): Promise<{ id: string }> {
  if (!/^[a-f0-9]{32}$/.test(input.token)) throw new WarrantyError("NOT_FOUND");
  const item = await prisma.orderItem.findUnique({
    where: { id: input.orderItemId },
    select: {
      id: true,
      warrantyMonths: true,
      order: {
        select: {
          customerId: true,
          contactId: true,
          email: true,
          publicAccessTokenHash: true,
          status: true,
          deliveredAt: true,
          deletedAt: true,
        },
      },
      warrantyClaims: { where: { status: { in: ACTIVE_STATUSES } }, select: { id: true }, take: 1 },
    },
  });
  if (
    !item ||
    item.order.deletedAt ||
    !verifyTokenHashTimingSafe(input.token, item.order.publicAccessTokenHash)
  ) {
    throw new WarrantyError("NOT_FOUND");
  }
  if (!verifyEmailMatchesTimingSafe(input.email, item.order.email)) {
    throw new WarrantyError("FORBIDDEN");
  }
  if (item.order.status !== "DELIVERED" || !item.order.deliveredAt) {
    throw new WarrantyError("NOT_DELIVERED");
  }
  const now = input.now ?? new Date();
  if (!isWithinWarranty(item.order.deliveredAt, item.warrantyMonths, now)) {
    throw new WarrantyError("OUT_OF_WARRANTY");
  }
  if (item.warrantyClaims.length > 0) throw new WarrantyError("ACTIVE_CLAIM");
  const description = input.description.trim();
  if (description.length < 10) throw new WarrantyError("INVALID");
  const contactId = await resolvePostSaleContact(prisma, {
    orderContactId: item.order.contactId,
    customerId: item.order.customerId,
    orderEmail: item.order.email,
  });
  return prisma.warrantyClaim.create({
    data: {
      orderItemId: item.id,
      customerId: item.order.customerId,
      ...(contactId ? { contactId } : {}),
      description: description.slice(0, 2000),
      evidenceUrls: sanitizeWarrantyEvidenceUrls(input.evidenceUrls),
      status: "PENDING",
      slaDueAt: computeWarrantySlaDueAt(now),
    },
    select: { id: true },
  });
}

// ── Listado + gestión (admin) ──

/**
 * Crea un reclamo de garantía INICIADO POR EL ADMIN (conversión desde un ticket
 * de soporte GARANTIA_DEVOLUCION en /admin/soporte/[id]).
 *
 * Diferencias con createWarrantyClaim (flujo cliente):
 *  - Sin chequeo de propiedad (FORBIDDEN): el admin actúa a nombre del cliente;
 *    customerId se toma de la orden del item (puede quedar null en pedidos de
 *    invitado — la columna lo permite).
 *  - La ventana de tiempo NO se exige: el admin es la válvula legal (un cliente
 *    que escribe por /contacto ya puede ir por fuera del cómputo exacto y la ley
 *    se evalúa caso a caso). SÍ se exige pedido entregado y sin reclamo activo
 *    (integridad de la máquina de estados).
 */
export async function createWarrantyClaimAsAdmin(input: {
  orderItemId: string;
  description: string;
  adminId: string;
}): Promise<{ id: string }> {
  const item = await prisma.orderItem.findUnique({
    where: { id: input.orderItemId },
    select: {
      id: true,
      order: {
        select: { customerId: true, contactId: true, email: true, status: true, deletedAt: true },
      },
      warrantyClaims: { where: { status: { in: ACTIVE_STATUSES } }, select: { id: true }, take: 1 },
    },
  });
  if (!item || item.order.deletedAt) throw new WarrantyError("NOT_FOUND");
  if (item.order.status !== "DELIVERED") throw new WarrantyError("NOT_DELIVERED");
  if (item.warrantyClaims.length > 0) throw new WarrantyError("ACTIVE_CLAIM");
  const description = input.description.trim();
  if (description.length < 10) throw new WarrantyError("INVALID");
  const contactId = await resolvePostSaleContact(prisma, {
    orderContactId: item.order.contactId,
    customerId: item.order.customerId,
    orderEmail: item.order.email,
  });
  return prisma.warrantyClaim.create({
    data: {
      orderItemId: item.id,
      customerId: item.order.customerId,
      ...(contactId ? { contactId } : {}),
      description: description.slice(0, 2000),
      status: "PENDING",
      processedBy: input.adminId,
      slaDueAt: computeWarrantySlaDueAt(new Date()),
    },
    select: { id: true },
  });
}
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
          order: { select: { number: true, email: true, shippingAddress: true } },
          variant: { select: { product: { select: { name: true } } } },
        },
      },
    },
  });
  return rows.map((r) => {
    const ship = r.orderItem.order.shippingAddress as { fullName?: string } | null;
    const customerFullName = [r.customer?.firstName, r.customer?.lastName]
      .filter(Boolean)
      .join(" ");
    return {
      id: r.id,
      status: r.status as WarrantyStatus,
      description: r.description,
      evidenceUrls: sanitizeWarrantyEvidenceUrls(r.evidenceUrls),
      resolutionType: (r.resolutionType as WarrantyResolution | null) ?? null,
      resolutionNote: r.resolutionNote,
      requestedAt: r.requestedAt,
      resolvedAt: r.resolvedAt,
      customerEmail: r.customer?.email ?? r.orderItem.order.email ?? "—",
      customerName: customerFullName || ship?.fullName?.trim() || "Cliente",
      orderNumber: r.orderItem.order.number,
      productName: r.orderItem.variant.product.name,
      qty: r.orderItem.qty,
    };
  });
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
export async function rejectWarrantyClaim(
  id: string,
  adminId: string,
  note: string,
): Promise<void> {
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

export type WarrantyInboxView = WarrantyStatus | "sla-risk" | "mine" | "all";

export function isWarrantyInboxView(raw: string | undefined): raw is WarrantyInboxView {
  return (
    raw === "PENDING" ||
    raw === "IN_REVIEW" ||
    raw === "APPROVED" ||
    raw === "RESOLVED" ||
    raw === "REJECTED" ||
    raw === "sla-risk" ||
    raw === "mine" ||
    raw === "all"
  );
}

export function isWarrantyResolution(raw: string | undefined): raw is WarrantyResolution {
  return WARRANTY_RESOLUTIONS.includes(raw as WarrantyResolution);
}

export async function assignWarrantyClaim(
  id: string,
  assignedToAdminId: string | null,
): Promise<void> {
  await loadClaim(id);
  if (assignedToAdminId) {
    const validAssignee = await prisma.adminUser.findFirst({
      where: {
        id: assignedToAdminId,
        isActive: true,
        deletedAt: null,
        role: { in: [...ADMIN_ROLE_SETS.SUPPORT_CARE] },
      },
      select: { id: true },
    });
    if (!validAssignee) {
      throw new WarrantyError("INVALID_ASSIGNEE");
    }
  }
  await prisma.warrantyClaim.update({
    where: { id },
    data: { assignedToAdminId },
  });
  logger.info({ event: "warranty.assigned", id, assignedToAdminId });
}

export interface AdminWarrantyCaseRow {
  id: string;
  status: WarrantyStatus;
  description: string | null;
  evidenceUrls: string[];
  resolutionType: WarrantyResolution | null;
  resolutionNote: string | null;
  requestedAt: Date;
  resolvedAt: Date | null;
  slaDueAt: Date | null;
  sla: SlaEvaluation;
  customerEmail: string;
  customerName: string;
  contactId: string | null;
  sourceTicketId: string | null;
  assignedToAdmin: { id: string; email: string } | null;
  orderNumber: string;
  orderPaymentMethod: string | null;
  productName: string;
  productSlug: string;
  qty: number;
  designUnits: number;
  lineTotal: number;
  warrantyMonths: number;
  warrantyEndsAt: Date | null;
  isPersonalized: boolean;
  qualityAcknowledgedAt: Date | null;
}

export interface WarrantyAdminListResult {
  items: AdminWarrantyCaseRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  counts: {
    pending: number;
    inReview: number;
    approved: number;
    resolved: number;
    rejected: number;
    activeTotal: number;
    slaRisk: number;
    mine: number;
    all: number;
  };
  byResolution: Record<WarrantyResolution, number>;
  refundExposure: {
    approvedRefundCount: number;
    approvedRefundCents: number;
    resolvedRefundCount: number;
    resolvedRefundCents: number;
  };
}

/**
 * Bandeja ejecutiva de garantías (`Bloque 6` · Ley 1480 art. 7-15 y art. 58):
 *  - Soporta vistas operativas (`PENDING`, `IN_REVIEW`, `APPROVED`, `RESOLVED`, `REJECTED`, `sla-risk`, `mine`, `all`),
 *    filtro por remedio (`REPAIR`, `REPLACE`, `REFUND`), búsqueda server-side anti-oráculo y paginación.
 *  - Aplica enmascaramiento server-side estricto de PII, textos libres y evidencias fotográficas cuando
 *    el actor consulta en modo contable de solo lectura (`FINANCE_ANALYST`: `!canManage || !canReadPii`).
 */
export async function listWarrantyClaimsAdmin(opts: {
  view?: WarrantyInboxView;
  resolution?: WarrantyResolution;
  q?: string;
  actorAdminId: string;
  canManage: boolean;
  canReadPii: boolean;
  page?: number;
  pageSize?: number;
}): Promise<WarrantyAdminListResult> {
  const effectiveView: WarrantyInboxView =
    !opts.canManage && opts.view === "mine" ? "all" : (opts.view ?? "PENDING");
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, opts.pageSize ?? 20));
  const now = new Date();
  const dueSoonCutoff = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  const andClauses: Prisma.WarrantyClaimWhereInput[] = [];

  if (
    effectiveView === "PENDING" ||
    effectiveView === "IN_REVIEW" ||
    effectiveView === "APPROVED" ||
    effectiveView === "RESOLVED" ||
    effectiveView === "REJECTED"
  ) {
    andClauses.push({ status: effectiveView });
  } else if (effectiveView === "mine") {
    andClauses.push({
      assignedToAdminId: opts.actorAdminId,
      status: { in: ACTIVE_STATUSES },
    });
  } else if (effectiveView === "sla-risk") {
    andClauses.push({
      status: { in: ACTIVE_STATUSES },
      slaDueAt: { lte: dueSoonCutoff },
    });
  }

  if (opts.resolution) {
    andClauses.push({ resolutionType: opts.resolution });
  }

  const qClean = (opts.q ?? "").trim().replace(/^#/, "");
  if (qClean.length > 0) {
    const orClauses: Prisma.WarrantyClaimWhereInput[] = [
      { id: { contains: qClean, mode: "insensitive" } },
      { orderItem: { order: { number: { contains: qClean, mode: "insensitive" } } } },
      {
        orderItem: {
          variant: { product: { name: { contains: qClean, mode: "insensitive" } } },
        },
      },
    ];
    // Anti-oráculo PII: solo roles con `canReadPii` y `canManage` buscan por correo o descripción libre.
    if (opts.canReadPii && opts.canManage) {
      orClauses.push(
        { orderItem: { order: { email: { contains: qClean, mode: "insensitive" } } } },
        { customer: { email: { contains: qClean, mode: "insensitive" } } },
        { description: { contains: qClean, mode: "insensitive" } },
      );
    }
    andClauses.push({ OR: orClauses });
  }

  const where: Prisma.WarrantyClaimWhereInput = andClauses.length > 0 ? { AND: andClauses } : {};

  const [
    rows,
    total,
    groupedByStatus,
    groupedByResolution,
    slaRiskCount,
    mineCount,
    refundClaimItems,
  ] = await Promise.all([
    prisma.warrantyClaim.findMany({
      where,
      orderBy: [{ requestedAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        contactId: true,
        status: true,
        description: true,
        evidenceUrls: true,
        resolutionType: true,
        resolutionNote: true,
        requestedAt: true,
        resolvedAt: true,
        slaDueAt: true,
        assignedToAdmin: { select: { id: true, email: true } },
        customer: { select: { email: true, firstName: true, lastName: true } },
        orderItem: {
          select: {
            qty: true,
            designUnits: true,
            unitPrice: true,
            warrantyMonths: true,
            customDesign: true,
            designId: true,
            design: { select: { qualityAcknowledgedAt: true } },
            order: {
              select: {
                number: true,
                email: true,
                contactId: true,
                paymentMethod: true,
                deliveredAt: true,
                shippingAddress: true,
              },
            },
            variant: {
              select: { product: { select: { name: true, slug: true } } },
            },
          },
        },
      },
    }),
    prisma.warrantyClaim.count({ where }),
    prisma.warrantyClaim.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.warrantyClaim.groupBy({
      by: ["resolutionType"],
      where: { resolutionType: { not: null } },
      _count: { _all: true },
    }),
    prisma.warrantyClaim.count({
      where: {
        status: { in: ACTIVE_STATUSES },
        slaDueAt: { lte: dueSoonCutoff },
      },
    }),
    opts.canManage
      ? prisma.warrantyClaim.count({
          where: {
            assignedToAdminId: opts.actorAdminId,
            status: { in: ACTIVE_STATUSES },
          },
        })
      : Promise.resolve(0),
    prisma.warrantyClaim.findMany({
      where: {
        resolutionType: "REFUND",
        status: { in: ["APPROVED", "RESOLVED"] },
      },
      take: 500,
      select: {
        status: true,
        orderItem: { select: { qty: true, unitPrice: true } },
      },
    }),
  ]);

  const linkedTickets =
    opts.canManage && rows.length > 0
      ? await prisma.supportTicket.findMany({
          where: {
            linkedCaseType: "warranty",
            linkedCaseId: { in: rows.map((r) => r.id) },
          },
          select: { id: true, linkedCaseId: true },
        })
      : [];
  const ticketByCaseId = new Map<string, string>();
  for (const t of linkedTickets) {
    if (t.linkedCaseId && !ticketByCaseId.has(t.linkedCaseId)) {
      ticketByCaseId.set(t.linkedCaseId, t.id);
    }
  }

  const countMap: Record<WarrantyStatus, number> = {
    PENDING: 0,
    IN_REVIEW: 0,
    APPROVED: 0,
    RESOLVED: 0,
    REJECTED: 0,
  };
  for (const g of groupedByStatus) {
    countMap[g.status as WarrantyStatus] = g._count._all;
  }

  const byResolution: Record<WarrantyResolution, number> = {
    REPAIR: 0,
    REPLACE: 0,
    REFUND: 0,
  };
  for (const g of groupedByResolution) {
    if (g.resolutionType && isWarrantyResolution(g.resolutionType)) {
      byResolution[g.resolutionType] = g._count._all;
    }
  }

  let approvedRefundCount = 0;
  let approvedRefundCents = 0;
  let resolvedRefundCount = 0;
  let resolvedRefundCents = 0;
  for (const rc of refundClaimItems) {
    const lineCents = rc.orderItem.unitPrice * rc.orderItem.qty;
    if (rc.status === "APPROVED") {
      approvedRefundCount += 1;
      approvedRefundCents += lineCents;
    } else if (rc.status === "RESOLVED") {
      resolvedRefundCount += 1;
      resolvedRefundCents += lineCents;
    }
  }

  const showFullCustomerData = opts.canManage && opts.canReadPii;
  const items: AdminWarrantyCaseRow[] = rows.map((r) => {
    const ord = r.orderItem.order;
    const ship = ord.shippingAddress as { fullName?: string } | null;
    const customerFullName = [r.customer?.firstName, r.customer?.lastName]
      .filter(Boolean)
      .join(" ");
    const rawName = customerFullName || ship?.fullName?.trim() || "Cliente";
    const rawEmail = r.customer?.email ?? ord.email ?? "—";
    const isClosed = r.status === "RESOLVED" || r.status === "REJECTED";
    const resolvedContactId = r.contactId ?? ord.contactId ?? null;

    return {
      id: r.id,
      status: r.status as WarrantyStatus,
      description: showFullCustomerData ? r.description : null,
      evidenceUrls: showFullCustomerData ? sanitizeWarrantyEvidenceUrls(r.evidenceUrls) : [],
      resolutionType: (r.resolutionType as WarrantyResolution | null) ?? null,
      resolutionNote: showFullCustomerData ? r.resolutionNote : null,
      requestedAt: r.requestedAt,
      resolvedAt: r.resolvedAt,
      slaDueAt: r.slaDueAt,
      sla: evaluateSlaStatus(r.slaDueAt, { now, isClosed }),
      customerEmail: showFullCustomerData ? rawEmail : maskEmail(rawEmail),
      customerName: showFullCustomerData ? rawName : maskPersonName(rawName),
      contactId: showFullCustomerData ? resolvedContactId : null,
      sourceTicketId: opts.canManage ? (ticketByCaseId.get(r.id) ?? null) : null,
      assignedToAdmin: r.assignedToAdmin
        ? {
            id: r.assignedToAdmin.id,
            email: opts.canManage ? r.assignedToAdmin.email : maskEmail(r.assignedToAdmin.email),
          }
        : null,
      orderNumber: ord.number,
      orderPaymentMethod: ord.paymentMethod,
      productName: r.orderItem.variant.product.name,
      productSlug: r.orderItem.variant.product.slug,
      qty: r.orderItem.qty,
      designUnits: r.orderItem.designUnits,
      lineTotal: r.orderItem.unitPrice * r.orderItem.qty,
      warrantyMonths: r.orderItem.warrantyMonths,
      warrantyEndsAt: ord.deliveredAt
        ? warrantyWindowEnd(ord.deliveredAt, r.orderItem.warrantyMonths)
        : null,
      isPersonalized: r.orderItem.designId != null || r.orderItem.customDesign != null,
      qualityAcknowledgedAt: r.orderItem.design?.qualityAcknowledgedAt ?? null,
    };
  });

  const activeTotal = countMap.PENDING + countMap.IN_REVIEW + countMap.APPROVED;
  const allCount = activeTotal + countMap.RESOLVED + countMap.REJECTED;

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    counts: {
      pending: countMap.PENDING,
      inReview: countMap.IN_REVIEW,
      approved: countMap.APPROVED,
      resolved: countMap.RESOLVED,
      rejected: countMap.REJECTED,
      activeTotal,
      slaRisk: slaRiskCount,
      mine: mineCount,
      all: allCount,
    },
    byResolution,
    refundExposure: {
      approvedRefundCount,
      approvedRefundCents,
      resolvedRefundCount,
      resolvedRefundCents,
    },
  };
}
