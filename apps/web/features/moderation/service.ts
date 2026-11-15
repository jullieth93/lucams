/*
 * Service layer — Moderación de contenido de diseños (ADR-062 P0-2).
 *
 * Print-on-demand: cada diseño personalizado se imprime y despacha físicamente. El equipo revisa
 * TODOS los diseños de pedidos activos (PAID/FULFILLING) antes de producir. El gate del envío
 * (transitionOrderAction → SHIPPED) bloquea hasta que todos los diseños del pedido estén APPROVED.
 *
 * La cola también incluye diseños COMPARTIDOS por link público (/d/<token>) aunque no tengan
 * pedido: son contenido público y deben moderarse igual. Rechazar un diseño revoca su link.
 */

import "server-only";
import type { AdminRole } from "@lucams/db";
import { prisma } from "@/lib/db";
import { hasCapability } from "@/lib/admin-rbac";
import { maskEmail } from "@/lib/pii-mask";

const ACTIVE_ORDER_STATUSES = ["PAID", "FULFILLING"] as const;
const SHIPPED_ORDER_STATUSES = ["SHIPPED", "DELIVERED"] as const;
const TERMINAL_ORDER_STATUSES = ["CANCELLED", "EXPIRED", "REFUNDED"] as const;

export class ModerationGuardError extends Error {
  readonly code: "NOT_FOUND" | "ORDER_ALREADY_SHIPPED";
  readonly orderNumber?: string;

  constructor(code: "NOT_FOUND" | "ORDER_ALREADY_SHIPPED", message: string, orderNumber?: string) {
    super(message);
    this.name = "ModerationGuardError";
    this.code = code;
    this.orderNumber = orderNumber;
  }
}

export type ModerationSource = {
  tipo: "pedido";
  numero: string;
  contacto: string;
};

function dedupeSources(sources: ModerationSource[]): ModerationSource[] {
  const byKey = new Map<string, ModerationSource>();
  for (const s of sources) byKey.set(`${s.tipo}:${s.numero}`, s);
  return [...byKey.values()];
}

function maskSourcesForActor(role: AdminRole, sources: ModerationSource[]): ModerationSource[] {
  if (hasCapability(role, "orders:read_pii")) return sources;
  return sources.map((s) => ({ ...s, contacto: maskEmail(s.contacto) }));
}

export type PendingModerationDesign = {
  designId: string;
  previewUrl: string | null;
  productionUrls: string[];
  productName: string;
  createdAt: Date;
  qualityAcknowledgedAt: Date | null;
  sources: ModerationSource[];
  shared: boolean;
};

export type RecentModeratedDesign = {
  designId: string;
  previewUrl: string | null;
  productionUrls: string[];
  productName: string;
  moderationStatus: "APPROVED" | "REJECTED";
  moderationReason: string | null;
  moderatedAt: Date;
  moderatorName: string;
  qualityAcknowledgedAt: Date | null;
  sources: ModerationSource[];
  shared: boolean;
};

export type ModerationSummary = {
  pendingTotal: number;
  blockedOrdersCount: number;
  fromOrdersDesignsCount: number;
  sharedOnlyDesignsCount: number;
  withQualityWarningCount: number;
  oldestPendingAt: Date | null;
  approved7d: number;
  rejected7d: number;
  evaluatedAtMs: number;
};

const PENDING_MODERATION_WHERE = {
  moderationStatus: "PENDING" as const,
  OR: [
    {
      orderItems: {
        some: { order: { status: { in: [...ACTIVE_ORDER_STATUSES] }, deletedAt: null } },
      },
    },
    { shareTokenHash: { not: null } },
  ],
};

export async function countPendingModeration(): Promise<number> {
  return prisma.design.count({ where: PENDING_MODERATION_WHERE });
}

export async function listPendingModeration(): Promise<PendingModerationDesign[]> {
  const designs = await prisma.design.findMany({
    where: PENDING_MODERATION_WHERE,
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      previewUrl: true,
      productionUrls: true,
      createdAt: true,
      qualityAcknowledgedAt: true,
      shareTokenHash: true,
      product: { select: { name: true } },
      orderItems: {
        where: { order: { status: { in: [...ACTIVE_ORDER_STATUSES] }, deletedAt: null } },
        select: { order: { select: { number: true, email: true } } },
      },
    },
  });
  return designs.map((d) => ({
    designId: d.id,
    previewUrl: d.previewUrl,
    productionUrls: d.productionUrls,
    productName: d.product.name,
    createdAt: d.createdAt,
    qualityAcknowledgedAt: d.qualityAcknowledgedAt,
    shared: d.shareTokenHash !== null,
    sources: dedupeSources(
      d.orderItems.map((o) => ({
        tipo: "pedido" as const,
        numero: o.order.number,
        contacto: o.order.email,
      })),
    ),
  }));
}

export async function listPendingModerationForActor(
  role: AdminRole,
): Promise<PendingModerationDesign[]> {
  const rows = await listPendingModeration();
  if (hasCapability(role, "orders:read_pii")) return rows;
  return rows.map((row) => ({
    ...row,
    sources: maskSourcesForActor(role, row.sources),
  }));
}

export async function getModerationSummaryForActor(
  _role: AdminRole,
  preloadedQueue?: PendingModerationDesign[],
): Promise<ModerationSummary> {
  const evaluatedAtMs = Date.now();
  const sevenDaysAgo = new Date(evaluatedAtMs - 7 * 24 * 60 * 60 * 1000);
  const [queue, approved7d, rejected7d] = await Promise.all([
    preloadedQueue ? Promise.resolve(preloadedQueue) : listPendingModeration(),
    prisma.design.count({
      where: { moderationStatus: "APPROVED", moderatedAt: { gte: sevenDaysAgo } },
    }),
    prisma.design.count({
      where: { moderationStatus: "REJECTED", moderatedAt: { gte: sevenDaysAgo } },
    }),
  ]);

  const blockedOrderNumbers = new Set<string>();
  let fromOrdersDesignsCount = 0;
  let sharedOnlyDesignsCount = 0;
  let withQualityWarningCount = 0;
  let oldestPendingAt: Date | null = null;

  for (const d of queue) {
    const hasOrder = d.sources.some((s) => s.tipo === "pedido");
    for (const s of d.sources) blockedOrderNumbers.add(s.numero);
    if (hasOrder) fromOrdersDesignsCount += 1;
    else if (d.shared) sharedOnlyDesignsCount += 1;

    if (d.qualityAcknowledgedAt !== null) withQualityWarningCount += 1;
    if (!oldestPendingAt || d.createdAt < oldestPendingAt) oldestPendingAt = d.createdAt;
  }

  return {
    pendingTotal: queue.length,
    blockedOrdersCount: blockedOrderNumbers.size,
    fromOrdersDesignsCount,
    sharedOnlyDesignsCount,
    withQualityWarningCount,
    oldestPendingAt,
    approved7d,
    rejected7d,
    evaluatedAtMs,
  };
}

export async function listRecentModeratedForActor(
  role: AdminRole,
  opts?: { q?: string; limit?: number },
): Promise<RecentModeratedDesign[]> {
  const q = opts?.q?.trim() ?? "";
  const take = Math.min(Math.max(opts?.limit ?? 24, 1), 60);

  const designs = await prisma.design.findMany({
    where: {
      moderationStatus: { in: ["APPROVED", "REJECTED"] },
      moderatedAt: { not: null },
      ...(q
        ? {
            OR: [
              { id: { contains: q, mode: "insensitive" } },
              { product: { name: { contains: q, mode: "insensitive" } } },
              {
                orderItems: {
                  some: {
                    order: {
                      deletedAt: null,
                      number: { contains: q, mode: "insensitive" },
                    },
                  },
                },
              },
            ],
          }
        : {}),
    },
    orderBy: { moderatedAt: "desc" },
    take,
    select: {
      id: true,
      previewUrl: true,
      productionUrls: true,
      moderationStatus: true,
      moderationReason: true,
      moderatedAt: true,
      moderatedById: true,
      qualityAcknowledgedAt: true,
      shareTokenHash: true,
      product: { select: { name: true } },
      orderItems: {
        where: { order: { deletedAt: null } },
        select: { order: { select: { number: true, email: true } } },
      },
    },
  });

  const moderatorIds = [
    ...new Set(designs.map((d) => d.moderatedById).filter((x): x is string => Boolean(x))),
  ];
  const moderators =
    moderatorIds.length > 0
      ? await prisma.adminUser.findMany({
          where: { id: { in: moderatorIds } },
          select: { id: true, role: true },
        })
      : [];
  const roleNames: Record<AdminRole, string> = {
    SUPERADMIN: "Administradora",
    OPERATIONS_MANAGER: "Gerencia operativa",
    MANAGER: "Gerencia",
    PRINT_WORKSHOP: "Taller de impresión",
    FULFILLMENT: "Alistamiento",
    CUSTOMER_SUPPORT: "Soporte",
    FINANCE_ANALYST: "Finanzas",
    CMS_EDITOR: "Contenido",
  };
  const moderatorMap = new Map(moderators.map((m) => [m.id, roleNames[m.role] ?? "Equipo Admin"]));

  return designs.map((d) => {
    const rawSources = dedupeSources(
      d.orderItems.map((o) => ({
        tipo: "pedido" as const,
        numero: o.order.number,
        contacto: o.order.email,
      })),
    );
    return {
      designId: d.id,
      previewUrl: d.previewUrl,
      productionUrls: d.productionUrls,
      productName: d.product.name,
      moderationStatus: d.moderationStatus === "REJECTED" ? "REJECTED" : "APPROVED",
      moderationReason: d.moderationReason,
      moderatedAt: d.moderatedAt ?? new Date(),
      moderatorName: d.moderatedById
        ? (moderatorMap.get(d.moderatedById) ?? "Equipo Admin")
        : "Equipo Admin",
      qualityAcknowledgedAt: d.qualityAcknowledgedAt,
      shared: d.shareTokenHash !== null,
      sources: maskSourcesForActor(role, rawSources),
    };
  });
}

export async function getDesignProductionPaths(designId: string): Promise<string[]> {
  const design = await prisma.design.findUnique({
    where: { id: designId },
    select: { productionUrls: true },
  });
  return design?.productionUrls ?? [];
}

export type ApproveResult = {
  productName: string;
  sources: ModerationSource[];
  orderNumbers: string[];
};

export async function approveDesign(designId: string, adminId: string): Promise<ApproveResult> {
  const existing = await prisma.design.findUnique({
    where: { id: designId },
    select: {
      id: true,
      product: { select: { name: true } },
      orderItems: {
        where: { order: { deletedAt: null } },
        select: { order: { select: { number: true, email: true } } },
      },
    },
  });
  if (!existing) {
    throw new ModerationGuardError("NOT_FOUND", "El diseño indicado no existe o fue eliminado.");
  }

  await prisma.design.update({
    where: { id: designId },
    data: {
      moderationStatus: "APPROVED",
      moderationReason: null,
      moderatedAt: new Date(),
      moderatedById: adminId,
    },
  });

  const sources = dedupeSources(
    existing.orderItems.map((o) => ({
      tipo: "pedido" as const,
      numero: o.order.number,
      contacto: o.order.email,
    })),
  );

  return {
    productName: existing.product.name,
    sources,
    orderNumbers: [...new Set(existing.orderItems.map((o) => o.order.number))],
  };
}

export type RejectResult = { productName: string; sources: ModerationSource[] };

export async function rejectDesign(
  designId: string,
  adminId: string,
  reason: string,
): Promise<RejectResult> {
  const existing = await prisma.design.findUnique({
    where: { id: designId },
    select: {
      id: true,
      product: { select: { name: true } },
      orderItems: {
        where: { order: { deletedAt: null } },
        select: { order: { select: { number: true, email: true, status: true } } },
      },
    },
  });
  if (!existing) {
    throw new ModerationGuardError("NOT_FOUND", "El diseño indicado no existe o fue eliminado.");
  }

  const shippedOrder = existing.orderItems.find((o) =>
    (SHIPPED_ORDER_STATUSES as readonly string[]).includes(o.order.status),
  );
  if (shippedOrder) {
    throw new ModerationGuardError(
      "ORDER_ALREADY_SHIPPED",
      `No puedes rechazar este diseño porque el pedido ${shippedOrder.order.number} ya fue despachado.`,
      shippedOrder.order.number,
    );
  }

  await prisma.design.update({
    where: { id: designId },
    data: {
      moderationStatus: "REJECTED",
      moderationReason: reason,
      moderatedAt: new Date(),
      moderatedById: adminId,
      shareTokenHash: null,
    },
  });

  const activeOrderSources = existing.orderItems
    .filter((o) => !(TERMINAL_ORDER_STATUSES as readonly string[]).includes(o.order.status))
    .map((o) => ({
      tipo: "pedido" as const,
      numero: o.order.number,
      contacto: o.order.email,
    }));

  return {
    productName: existing.product.name,
    sources: dedupeSources(activeOrderSources),
  };
}

export async function orderHasUnmoderatedDesigns(orderId: string): Promise<boolean> {
  const count = await prisma.design.count({
    where: {
      moderationStatus: { not: "APPROVED" },
      orderItems: { some: { orderId } },
    },
  });
  return count > 0;
}
