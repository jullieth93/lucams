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

type OrderRef = { number: string; email: string };

function dedupeOrders(rows: { order: OrderRef }[]): OrderRef[] {
  const byNumber = new Map<string, OrderRef>();
  for (const r of rows) byNumber.set(r.order.number, r.order);
  return [...byNumber.values()];
}

export type PendingModerationDesign = {
  designId: string;
  previewUrl: string | null;
  productName: string;
  createdAt: Date;
  orders: OrderRef[];
};

/** Cola de moderación: diseños PENDING de pedidos activos, más antiguos primero. */
export async function listPendingModeration(): Promise<PendingModerationDesign[]> {
  const designs = await prisma.design.findMany({
    where: {
      moderationStatus: "PENDING",
      orderItems: {
        some: { order: { status: { in: [...ACTIVE_ORDER_STATUSES] }, deletedAt: null } },
      },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      previewUrl: true,
      createdAt: true,
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
    productName: d.product.name,
    createdAt: d.createdAt,
    orders: dedupeOrders(d.orderItems),
  }));
}

/** Cantidad de diseños pendientes (badge del sidebar / card del dashboard). */
export async function countPendingModeration(): Promise<number> {
  return prisma.design.count({
    where: {
      moderationStatus: "PENDING",
      orderItems: {
        some: { order: { status: { in: [...ACTIVE_ORDER_STATUSES] }, deletedAt: null } },
      },
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

export type RejectResult = { productName: string; orders: OrderRef[] };

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
    },
  });
  return { productName: design.product.name, orders: dedupeOrders(design.orderItems) };
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
