/*
 * Service layer — Moderación de contenido de diseños (ADR-062 P0-2).
 *
 * Print-on-demand: cada diseño personalizado se imprime y despacha físicamente. Lucy revisa
 * TODOS los diseños de pedidos activos (PAID/FULFILLING) antes de producir. El gate del envío
 * (transitionOrderAction → SHIPPED) bloquea hasta que todos los diseños del pedido estén APPROVED.
 *
 * La app opera vía Prisma (rol privilegiado). Estas funciones son server-only.
 */

import "server-only";
import { prisma } from "@/lib/db";

// Estados de pedido en los que un diseño AÚN puede/deber moderarse antes de imprimir.
const ACTIVE_ORDER_STATUSES = ["PAID", "FULFILLING"] as const;
// Estados de cotización cuyo diseño todavía puede acabar en la mesa de trabajo. DISCARDED queda
// fuera: esa cotización ya se descartó y su diseño no se va a fabricar.
const ACTIVE_QUOTE_STATUSES = ["PENDING", "CONTACTED", "CLOSED"] as const;

/** De dónde viene el diseño que hay que moderar. En Etapa 1 son todas cotizaciones. */
export type ModerationSource = { tipo: "pedido" | "cotizacion"; numero: string; contacto: string };

function dedupeSources(sources: ModerationSource[]): ModerationSource[] {
  const byNumber = new Map<string, ModerationSource>();
  for (const s of sources) byNumber.set(s.numero, s);
  return [...byNumber.values()];
}

export type PendingModerationDesign = {
  designId: string;
  previewUrl: string | null;
  productionUrls: string[];
  productName: string;
  createdAt: Date;
  /** Pedidos Y cotizaciones que esperan por este diseño. */
  sources: ModerationSource[];
};

/** Cola de moderación: diseños PENDING de pedidos activos, más antiguos primero. */
export async function listPendingModeration(): Promise<PendingModerationDesign[]> {
  const designs = await prisma.design.findMany({
    where: {
      moderationStatus: "PENDING",
      // El OR con cotizaciones es lo que hace existir esta cola en la Etapa 1 (Lucy 2026-07-25).
      // Filtrar solo por pedidos la dejaba ESTRUCTURALMENTE vacía —no hay pedidos mientras la tienda
      // opera por cotización—, así que los 699 diseños de la base estaban en PENDING sin forma
      // humana de aprobarlos y toda hoja de taller habría salido marcada "no imprimir".
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
      ],
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      previewUrl: true,
      productionUrls: true,
      createdAt: true,
      product: { select: { name: true } },
      orderItems: {
        where: { order: { status: { in: [...ACTIVE_ORDER_STATUSES] }, deletedAt: null } },
        select: { order: { select: { number: true, email: true } } },
      },
      quoteItems: {
        where: { quote: { status: { in: [...ACTIVE_QUOTE_STATUSES] }, deletedAt: null } },
        select: { quote: { select: { number: true, customerWhatsapp: true } } },
      },
    },
  });
  return designs.map((d) => ({
    designId: d.id,
    previewUrl: d.previewUrl,
    productionUrls: d.productionUrls,
    productName: d.product.name,
    createdAt: d.createdAt,
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
      })),
    ]),
  }));
}

/** Cantidad de diseños pendientes (badge del sidebar / card del dashboard). */
export async function countPendingModeration(): Promise<number> {
  return prisma.design.count({
    where: {
      moderationStatus: "PENDING",
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
      ],
    },
  });
}

/** Aprueba un diseño para producción. Idempotente en la práctica (re-aprobar es no-op semántico). */
export async function approveDesign(designId: string, adminId: string): Promise<void> {
  await prisma.design.update({
    where: { id: designId },
    data: {
      moderationStatus: "APPROVED",
      moderationReason: null,
      moderatedAt: new Date(),
      moderatedById: adminId,
    },
  });
}

export type RejectResult = { productName: string; sources: ModerationSource[] };

/**
 * Rechaza un diseño (contenido no apto para imprimir). Devuelve la info para avisar al cliente
 * (pedidos afectados + producto). El gate impedirá que esos pedidos se marquen SHIPPED.
 */
export async function rejectDesign(
  designId: string,
  adminId: string,
  reason: string,
): Promise<RejectResult> {
  const design = await prisma.design.update({
    where: { id: designId },
    data: {
      moderationStatus: "REJECTED",
      moderationReason: reason,
      moderatedAt: new Date(),
      moderatedById: adminId,
    },
    select: {
      product: { select: { name: true } },
      orderItems: {
        where: { order: { deletedAt: null } },
        select: { order: { select: { number: true, email: true } } },
      },
      // También hay que poder avisarle a quien COTIZÓ: en Etapa 1 es el único caso que ocurre.
      quoteItems: {
        where: { quote: { deletedAt: null } },
        select: { quote: { select: { number: true, customerWhatsapp: true } } },
      },
    },
  });
  return {
    productName: design.product.name,
    sources: dedupeSources([
      ...design.orderItems.map((o) => ({
        tipo: "pedido" as const,
        numero: o.order.number,
        contacto: o.order.email,
      })),
      ...design.quoteItems.map((q) => ({
        tipo: "cotizacion" as const,
        numero: q.quote.number,
        contacto: q.quote.customerWhatsapp,
      })),
    ]),
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
