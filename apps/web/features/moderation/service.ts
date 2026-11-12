/*
 * Service layer — Moderación de contenido de diseños (ADR-062 P0-2).
 *
 * Print-on-demand: cada diseño personalizado se imprime y despacha físicamente. El equipo revisa
 * TODOS los diseños de pedidos activos (PAID/FULFILLING) antes de producir. El gate del envío
 * (transitionOrderAction → SHIPPED) bloquea hasta que todos los diseños del pedido estén APPROVED.
 *
 * A4-01 (cert 2026-09-26): la cola también incluye diseños COMPARTIDOS por link público
 * (/d/<token>) aunque no tengan pedido ni cotización — son contenido público y deben
 * moderarse igual. Rechazar un diseño revoca su link público (ver rejectDesign).
 *
 * La app opera vía Prisma (rol privilegiado). Estas funciones son server-only.
 */

import "server-only";
import type { AdminRole } from "@lucams/db";
import { prisma } from "@/lib/db";
import { hasCapability } from "@/lib/admin-rbac";
import { maskEmail, maskPhone } from "@/lib/pii-mask";

// Estados de pedido en los que un diseño AÚN puede/debe moderarse antes de imprimir.
const ACTIVE_ORDER_STATUSES = ["PAID", "FULFILLING"] as const;
// Estados de pedido ya despachados donde rechazar un diseño es incoherente con la operación física.
const SHIPPED_ORDER_STATUSES = ["SHIPPED", "DELIVERED"] as const;
// Estados terminales de pedido donde no se debe disparar correo de rechazo al cliente.
const TERMINAL_ORDER_STATUSES = ["CANCELLED", "EXPIRED", "REFUNDED"] as const;
// Estados de cotización cuyo diseño todavía puede acabar en la mesa de trabajo. DISCARDED queda
// fuera: esa cotización ya se descartó y su diseño no se va a fabricar.
const ACTIVE_QUOTE_STATUSES = ["PENDING", "CONTACTED", "CLOSED"] as const;

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

/** De dónde viene el diseño que hay que moderar (pedido, cotización o link compartido). */
export type ModerationSource = {
  tipo: "pedido" | "cotizacion";
  numero: string;
  contacto: string;
  /** ID interno de la cotización para enlazar directo a /cotizaciones/[id] o /cotizaciones/[id]/taller. */
  quoteId?: string;
};

function dedupeSources(sources: ModerationSource[]): ModerationSource[] {
  const byKey = new Map<string, ModerationSource>();
  for (const s of sources) byKey.set(`${s.tipo}:${s.numero}`, s);
  return [...byKey.values()];
}

function maskSourcesForActor(role: AdminRole, sources: ModerationSource[]): ModerationSource[] {
  if (hasCapability(role, "orders:read_pii")) return sources;
  return sources.map((s) => ({
    ...s,
    contacto: s.tipo === "pedido" ? maskEmail(s.contacto) : maskPhone(s.contacto),
  }));
}

export type PendingModerationDesign = {
  designId: string;
  previewUrl: string | null;
  productionUrls: string[];
  productName: string;
  createdAt: Date;
  /** Paquete C (2026-10-02) — timestamp de la aceptación explícita de calidad
   *  de fotos en la Vista Previa del Estudio (checkbox obligatorio cuando el
   *  diseño usa fotos con avisos). null = sin avisos o diseño anterior. */
  qualityAcknowledgedAt: Date | null;
  /** Pedidos Y cotizaciones que esperan por este diseño. Vacío si el diseño
   *  solo está COMPARTIDO por link público (A4-01). */
  sources: ModerationSource[];
  /** true si el diseño tiene link público /d/<token> vivo (shareTokenHash != null). */
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
  fromQuotesDesignsCount: number;
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
    {
      quoteItems: {
        some: { quote: { status: { in: [...ACTIVE_QUOTE_STATUSES] }, deletedAt: null } },
      },
    },
    { shareTokenHash: { not: null } },
  ],
};

/** Conteo rápido para alertas operativas en el Dashboard admin. */
export async function countPendingModeration(): Promise<number> {
  return prisma.design.count({ where: PENDING_MODERATION_WHERE });
}

/** Cola de moderación: diseños PENDING de pedidos activos, cotizaciones activas
 *  o COMPARTIDOS por link público, más antiguos primero. */
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
      // Solo para derivar `shared` (boolean) — el hash NUNCA sale del service.
      shareTokenHash: true,
      product: { select: { name: true } },
      orderItems: {
        where: { order: { status: { in: [...ACTIVE_ORDER_STATUSES] }, deletedAt: null } },
        select: { order: { select: { number: true, email: true } } },
      },
      quoteItems: {
        where: { quote: { status: { in: [...ACTIVE_QUOTE_STATUSES] }, deletedAt: null } },
        select: { quote: { select: { id: true, number: true, customerWhatsapp: true } } },
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
    sources: dedupeSources([
      ...d.orderItems.map((o) => ({
        tipo: "pedido" as const,
        numero: o.order.number,
        contacto: o.order.email,
      })),
      ...d.quoteItems.map((q) => ({
        tipo: "cotizacion" as const,
        numero: q.quote.number,
        contacto: q.quote.customerWhatsapp,
        quoteId: q.quote.id,
      })),
    ]),
  }));
}

/**
 * S17 (Fase 8) — Cola de moderación con enmascaramiento server-side de PII
 * (`sources[].contacto`) cuando el actor carece de `orders:read_pii` (`PRINT_WORKSHOP`).
 */
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

/**
 * Resumen ejecutivo de moderación: deriva métricas de la cola pendiente actual +
 * decisiones tomadas en los últimos 7 días. Cero PII expuesta.
 */
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
  let fromQuotesDesignsCount = 0;
  let sharedOnlyDesignsCount = 0;
  let withQualityWarningCount = 0;
  let oldestPendingAt: Date | null = null;

  for (const d of queue) {
    const hasOrder = d.sources.some((s) => s.tipo === "pedido");
    const hasQuote = d.sources.some((s) => s.tipo === "cotizacion");
    for (const s of d.sources) {
      if (s.tipo === "pedido") blockedOrderNumbers.add(s.numero);
    }
    if (hasOrder) fromOrdersDesignsCount += 1;
    else if (hasQuote) fromQuotesDesignsCount += 1;
    else if (d.shared) sharedOnlyDesignsCount += 1;

    if (d.qualityAcknowledgedAt !== null) withQualityWarningCount += 1;
    if (!oldestPendingAt || d.createdAt < oldestPendingAt) {
      oldestPendingAt = d.createdAt;
    }
  }

  return {
    pendingTotal: queue.length,
    blockedOrdersCount: blockedOrderNumbers.size,
    fromOrdersDesignsCount,
    fromQuotesDesignsCount,
    sharedOnlyDesignsCount,
    withQualityWarningCount,
    oldestPendingAt,
    approved7d,
    rejected7d,
    evaluatedAtMs,
  };
}

/**
 * Historial reciente de diseños moderados (solo lectura, últimos 24 por defecto).
 * Búsqueda `q` estrictamente operativa (número de pedido/cotización, producto o ID de diseño),
 * sin oráculo sobre PII cuando el rol no posee `orders:read_pii`.
 */
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
              {
                quoteItems: {
                  some: {
                    quote: {
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
      quoteItems: {
        where: { quote: { deletedAt: null } },
        select: { quote: { select: { id: true, number: true, customerWhatsapp: true } } },
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
    const rawSources = dedupeSources([
      ...d.orderItems.map((o) => ({
        tipo: "pedido" as const,
        numero: o.order.number,
        contacto: o.order.email,
      })),
      ...d.quoteItems.map((qt) => ({
        tipo: "cotizacion" as const,
        numero: qt.quote.number,
        contacto: qt.quote.customerWhatsapp,
        quoteId: qt.quote.id,
      })),
    ]);
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

/**
 * Paths de las piezas reales de producción de UN diseño (bucket privado production-assets).
 * La cola de moderación ya no firma los PNGs de todos los diseños al renderizar (eran 2-5 MB
 * por pieza × hasta 24 por diseño): la grilla muestra el previewUrl y el admin pide las piezas
 * reales bajo demanda (modal "ver piezas") — la server action firma solo estas rutas.
 */
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

/** Aprueba un diseño para producción. Idempotente en la práctica (re-aprobar es no-op semántico). */
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
      quoteItems: {
        where: { quote: { deletedAt: null } },
        select: { quote: { select: { id: true, number: true, customerWhatsapp: true } } },
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

  const sources = dedupeSources([
    ...existing.orderItems.map((o) => ({
      tipo: "pedido" as const,
      numero: o.order.number,
      contacto: o.order.email,
    })),
    ...existing.quoteItems.map((q) => ({
      tipo: "cotizacion" as const,
      numero: q.quote.number,
      contacto: q.quote.customerWhatsapp,
      quoteId: q.quote.id,
    })),
  ]);

  return {
    productName: existing.product.name,
    sources,
    orderNumbers: [...new Set(existing.orderItems.map((o) => o.order.number))],
  };
}

export type RejectResult = { productName: string; sources: ModerationSource[] };

/**
 * Rechaza un diseño (contenido no apto para imprimir). Devuelve la info para avisar al cliente
 * (pedidos afectados + producto). El gate impedirá que esos pedidos se marquen SHIPPED.
 *
 * Bloquea el rechazo si algún pedido vinculado ya está SHIPPED o DELIVERED (evita enviar un
 * correo contradictorio de "cambia tu diseño antes de imprimir" cuando el paquete ya salió).
 *
 * A4-01 (cert 2026-09-26): el rechazo también REVOCA el link público /d/<token>
 * (shareTokenHash=null) — un diseño rechazado no puede seguir publicado. Si luego
 * se aprueba, el link NO se restaura: el token plano es irrecuperable por diseño
 * (F-11, solo queda el hash); el cliente puede volver a compartir desde "Mis
 * diseños" y eso genera un token NUEVO (el viejo queda muerto).
 * No se toca previewUrl: las vistas de pedido/cotización la leen en vivo (misma
 * regla que archiveCustomerDesign).
 */
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
      quoteItems: {
        where: { quote: { deletedAt: null } },
        select: {
          quote: { select: { id: true, number: true, customerWhatsapp: true, status: true } },
        },
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

  const activeQuoteSources = existing.quoteItems
    .filter((q) => q.quote.status !== "DISCARDED")
    .map((q) => ({
      tipo: "cotizacion" as const,
      numero: q.quote.number,
      contacto: q.quote.customerWhatsapp,
      quoteId: q.quote.id,
    }));

  return {
    productName: existing.product.name,
    sources: dedupeSources([...activeOrderSources, ...activeQuoteSources]),
  };
}

/**
 * Gate del envío (ADR-062 P0-2): ¿el pedido tiene algún diseño SIN aprobar (PENDING o REJECTED)?
 * transitionOrderAction lo consulta antes de permitir SHIPPED. Pedidos sin diseños personalizados
 * (productos no personalizables) devuelven false → envían sin fricción.
 */
export async function orderHasUnmoderatedDesigns(orderId: string): Promise<boolean> {
  const count = await prisma.design.count({
    where: {
      moderationStatus: { not: "APPROVED" },
      orderItems: { some: { orderId } },
    },
  });
  return count > 0;
}
