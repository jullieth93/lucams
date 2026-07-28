/*
 * Service layer ADMIN — Cotizaciones (Etapa 1: catálogo + WhatsApp).
 *
 * Lo consume el módulo /admin/cotizaciones: lista paginada con filtros
 * (estado, búsqueda, rango de fechas), detalle con items, cambio de estado
 * y notas internas.
 *
 * Las mutaciones (updateQuoteStatus, addQuoteInternalNote) exigen
 * requireAdminAction (SUPERADMIN/MANAGER) + registran AdminActionLog —
 * mismo patrón que las acciones admin de retractos/pedidos. El guard hace
 * redirect() ante sesión inválida, así que DEBE ir al INICIO de la función,
 * antes de cualquier try/catch que pudiera tragarse la excepción.
 */

import "server-only";
import { prisma, type Prisma } from "@/lib/db";
import type { QuoteStatus } from "@lucams/db";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { recordAdminAction } from "@/lib/admin-audit";

export class QuoteNotFoundError extends Error {
  constructor(id: string) {
    super(`Cotización no encontrada: ${id}`);
    this.name = "QuoteNotFoundError";
  }
}

// ─────────────────────────────────────────────────────────────────────
// Listado paginado (mismo shape que listRedirects/listOrders del repo)
// ─────────────────────────────────────────────────────────────────────

export type QuoteListOpts = {
  status?: QuoteStatus | "all";
  /** Busca en number, nombre del cliente y WhatsApp (case-insensitive). */
  q?: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
};

export async function listQuotes(opts: QuoteListOpts = {}) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = opts.pageSize ?? 20;

  const where: Prisma.QuoteWhereInput = { deletedAt: null };
  if (opts.status && opts.status !== "all") where.status = opts.status;

  const q = opts.q?.trim();
  if (q) {
    where.OR = [
      { number: { contains: q, mode: "insensitive" } },
      { customerName: { contains: q, mode: "insensitive" } },
      { customerWhatsapp: { contains: q, mode: "insensitive" } },
    ];
  }

  if (opts.from || opts.to) {
    where.createdAt = {};
    if (opts.from) where.createdAt.gte = opts.from;
    if (opts.to) where.createdAt.lte = opts.to;
  }

  const [total, items] = await Promise.all([
    prisma.quote.count({ where }),
    prisma.quote.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        number: true,
        status: true,
        customerName: true,
        customerWhatsapp: true,
        city: true,
        department: true,
        total: true,
        createdAt: true,
        _count: { select: { items: true } },
      },
    }),
  ]);

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Detalle completo para el admin (incluye internalNotes — nunca exponer en público). */
export async function getQuoteById(id: string) {
  return prisma.quote.findFirst({
    where: { id, deletedAt: null },
    include: {
      items: {
        orderBy: { createdAt: "asc" },
        // product.images: la miniatura del detalle muestra la FOTO REAL del producto
        // cuando la línea no es personalizada (antes solo un ícono genérico).
        include: { product: { select: { images: true, slug: true } } },
      },
    },
  });
}

/**
 * Todo lo que hace falta para FABRICAR lo que se cotizó (Lucy, 2026-07-25).
 *
 * Hasta hoy no existía puerta alguna: la descarga de archivos de imprenta colgaba de `Order`, y
 * mientras la tienda opera por cotización no hay pedidos. El detalle de la cotización mostraba una
 * miniatura de 56 px y nada más, así que los PNG a 300 DPI existían en Storage sin forma de llegar
 * a ellos.
 *
 * Tres diferencias deliberadas frente a `getOrderProductionBundle`:
 *   · NO se filtran las líneas sin archivos de imprenta. Los productos no personalizables también se
 *     fabrican y se empacan, y si desaparecen de la hoja se despachan incompletos.
 *   · `QuoteItem.variantId` es nullable (`onDelete: SetNull`), así que el SKU se busca en cascada
 *     variante → producto → null. Nunca se inventa.
 *   · Se traen los datos que el PNG no explica (atributos de la variante, schema y specs del
 *     producto, canvas y metadata del diseño): son los que `resolveProductionSpec` convierte en
 *     instrucciones.
 */
export async function getQuoteProductionBundle(id: string) {
  return prisma.quote.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      number: true,
      status: true,
      customerName: true,
      customerWhatsapp: true,
      city: true,
      department: true,
      notes: true,
      createdAt: true,
      total: true,
      items: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          productName: true,
          variantName: true,
          quantity: true,
          unitPrice: true,
          previewUrl: true,
          variant: { select: { sku: true, attributes: true } },
          product: {
            select: {
              sku: true,
              personalizationKind: true,
              personalizationSchema: true,
              physicalSpecs: true,
            },
          },
          design: {
            select: {
              id: true,
              canvasData: true,
              metadata: true,
              productionUrls: true,
              previewUrl: true,
              moderationStatus: true,
              moderationReason: true,
            },
          },
        },
      },
    },
  });
}

// ─────────────────────────────────────────────────────────────────────
// Mutaciones (guard RBAC + AdminActionLog)
// ─────────────────────────────────────────────────────────────────────

export async function updateQuoteStatus(id: string, status: QuoteStatus) {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });

  const existing = await prisma.quote.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, number: true, status: true },
  });
  if (!existing) throw new QuoteNotFoundError(id);

  // Idempotente hacia el admin: re-marcar el mismo estado no es cambio —
  // no ensucia updatedBy ni el audit log. Devuelve el shape completo (mismo
  // tipo que la rama de update) para que el caller no bifurque tipos.
  if (existing.status === status) {
    return prisma.quote.findUniqueOrThrow({
      where: { id: existing.id },
      include: { items: { orderBy: { createdAt: "asc" } } },
    });
  }

  const updated = await prisma.quote.update({
    where: { id: existing.id },
    data: { status, updatedBy: session.admin.id },
    include: { items: { orderBy: { createdAt: "asc" } } },
  });

  await recordAdminAction({
    actorId: session.admin.id,
    action: "quote.update_status",
    entityType: "Quote",
    entityId: id,
    metadata: { number: existing.number, from: existing.status, to: status },
  });
  return updated;
}

/**
 * Agrega una nota interna (visible solo en admin). Hace APPEND al contenido
 * existente — el rastro de quién/cuándo queda en AdminActionLog, así que el
 * campo guarda solo el texto acumulado.
 */
export async function addQuoteInternalNote(id: string, note: string) {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });

  const trimmed = note.trim();
  if (!trimmed) {
    throw new Error("La nota no puede estar vacía.");
  }
  if (trimmed.length > 2000) {
    throw new Error("La nota supera el máximo de 2000 caracteres.");
  }

  const existing = await prisma.quote.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, number: true, internalNotes: true },
  });
  if (!existing) throw new QuoteNotFoundError(id);

  const internalNotes = existing.internalNotes
    ? `${existing.internalNotes}\n\n---\n\n${trimmed}`
    : trimmed;

  const updated = await prisma.quote.update({
    where: { id: existing.id },
    data: { internalNotes, updatedBy: session.admin.id },
    include: { items: { orderBy: { createdAt: "asc" } } },
  });

  await recordAdminAction({
    actorId: session.admin.id,
    action: "quote.add_internal_note",
    entityType: "Quote",
    entityId: id,
    metadata: { number: existing.number, noteLength: trimmed.length },
  });
  return updated;
}
