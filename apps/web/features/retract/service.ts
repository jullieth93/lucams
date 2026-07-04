/*
 * Derecho de retracto (Bloque F3) — Ley 1480 art. 47 + Ley 2439/2024.
 *
 * Un cliente puede devolver un producto NO personalizado dentro de 5 días hábiles
 * desde la entrega; reembolso en máx. 15 días calendario. Los productos claramente
 * personalizados (foto/texto del cliente) están EXCEPTUADOS. Ver docs/COMPLIANCE.md.
 *
 * `addBusinessDays`/`isWithinRetractWindow` son puros (testeables sin DB). La
 * elegibilidad se calcula al vuelo: item de catálogo estándar (sin customDesign ni
 * designId), orden DELIVERED, dentro de la ventana, sin solicitud previa.
 *
 * Nota: la ventana cuenta días hábiles Lun-Vie; NO descuenta festivos colombianos
 * (raros; el admin aprueba cada solicitud y puede cubrir bordes). Es levemente más
 * estricto que la ley en semanas con festivo — documentado, con válvula admin.
 */

import "server-only";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { RetractStatus } from "@lucams/db";
import { sendRetractApproved, sendRetractRefunded } from "./emails";

export const RETRACT_WINDOW_BUSINESS_DAYS = 5;

/** Avanza `n` días hábiles (Lun-Vie) desde `from`. No considera festivos CO. */
export function addBusinessDays(from: Date, n: number): Date {
  const d = new Date(from);
  let added = 0;
  while (added < n) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay(); // 0=Dom … 6=Sáb
    if (day !== 0 && day !== 6) added++;
  }
  return d;
}

/** Fin de la ventana de retracto (hasta el final del último día hábil, inclusive). */
export function retractWindowEnd(deliveredAt: Date): Date {
  const end = addBusinessDays(deliveredAt, RETRACT_WINDOW_BUSINESS_DAYS);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function isWithinRetractWindow(deliveredAt: Date, now: Date): boolean {
  return now.getTime() <= retractWindowEnd(deliveredAt).getTime();
}

/** Un item personalizado (foto/texto del cliente) está exceptuado del retracto. */
export function isItemPersonalized(item: {
  customDesign: unknown | null;
  designId: string | null;
}): boolean {
  return item.customDesign != null || item.designId != null;
}

export type RetractIneligibleReason =
  | "NOT_DELIVERED"
  | "OUT_OF_WINDOW"
  | "PERSONALIZED"
  | "ALREADY_REQUESTED";

export type RetractableItem = {
  orderItemId: string;
  productName: string;
  qty: number;
  lineTotal: number;
  eligible: boolean;
  reason: RetractIneligibleReason | null;
  existingStatus: string | null;
};

/**
 * Evalúa cada item de una orden para el retracto. Verifica pertenencia al cliente
 * (customerId) si se pasa; si no matchea, devuelve lista vacía (no filtra a nivel
 * de UI, corta acá). `now` inyectable para tests.
 */
export async function getRetractableItems(
  orderId: string,
  opts: { customerId?: string | null; now?: Date } = {},
): Promise<RetractableItem[]> {
  const now = opts.now ?? new Date();
  const order = await prisma.order.findFirst({
    where: { id: orderId, deletedAt: null },
    select: {
      customerId: true,
      status: true,
      deliveredAt: true,
      items: {
        select: {
          id: true,
          qty: true,
          unitPrice: true,
          customDesign: true,
          designId: true,
          variant: { select: { product: { select: { name: true } } } },
          retractRequest: { select: { status: true } },
        },
      },
    },
  });
  if (!order) return [];
  if (opts.customerId && order.customerId && order.customerId !== opts.customerId) return [];

  const delivered = order.status === "DELIVERED" && !!order.deliveredAt;
  const withinWindow = order.deliveredAt ? isWithinRetractWindow(order.deliveredAt, now) : false;

  return order.items.map((it) => {
    let reason: RetractIneligibleReason | null = null;
    if (it.retractRequest) reason = "ALREADY_REQUESTED";
    else if (!delivered) reason = "NOT_DELIVERED";
    else if (!withinWindow) reason = "OUT_OF_WINDOW";
    else if (isItemPersonalized(it)) reason = "PERSONALIZED";
    return {
      orderItemId: it.id,
      productName: it.variant.product.name,
      qty: it.qty,
      lineTotal: it.unitPrice * it.qty,
      eligible: reason === null,
      reason,
      existingStatus: it.retractRequest?.status ?? null,
    };
  });
}

export class RetractError extends Error {
  constructor(public readonly reason: RetractIneligibleReason | "NOT_FOUND" | "FORBIDDEN") {
    super(reason);
    this.name = "RetractError";
  }
}

/**
 * Crea la solicitud de retracto para un item, re-validando elegibilidad de forma
 * atómica. refundAmount = línea del item. Lanza RetractError si no procede.
 */
export async function createRetractRequest(
  orderItemId: string,
  opts: { customerId?: string | null; reason?: string; now?: Date },
): Promise<{ id: string; refundAmount: number }> {
  const now = opts.now ?? new Date();
  const item = await prisma.orderItem.findUnique({
    where: { id: orderItemId },
    select: {
      id: true,
      qty: true,
      unitPrice: true,
      customDesign: true,
      designId: true,
      retractRequest: { select: { id: true } },
      order: { select: { customerId: true, status: true, deliveredAt: true, deletedAt: true } },
    },
  });
  if (!item || item.order.deletedAt) throw new RetractError("NOT_FOUND");
  if (opts.customerId && item.order.customerId && item.order.customerId !== opts.customerId) {
    throw new RetractError("FORBIDDEN");
  }
  if (item.retractRequest) throw new RetractError("ALREADY_REQUESTED");
  if (item.order.status !== "DELIVERED" || !item.order.deliveredAt) {
    throw new RetractError("NOT_DELIVERED");
  }
  if (!isWithinRetractWindow(item.order.deliveredAt, now)) throw new RetractError("OUT_OF_WINDOW");
  if (isItemPersonalized(item)) throw new RetractError("PERSONALIZED");

  const refundAmount = item.unitPrice * item.qty;
  const created = await prisma.retractRequest.create({
    data: {
      orderItemId,
      reason: opts.reason?.trim() || null,
      refundAmount,
      status: "PENDING",
    },
    select: { id: true },
  });
  return { id: created.id, refundAmount };
}

// ───────────────────────── Gestión admin ─────────────────────────

/** Transiciones legales del ciclo de vida de una solicitud de retracto. */
export const RETRACT_TRANSITIONS: Record<RetractStatus, readonly RetractStatus[]> = {
  PENDING: ["APPROVED", "REJECTED"],
  APPROVED: ["RECEIVED", "REJECTED"],
  RECEIVED: ["REFUNDED"],
  REFUNDED: [],
  REJECTED: [],
};

export class RetractTransitionError extends Error {
  constructor(
    public readonly from: RetractStatus,
    public readonly to: RetractStatus,
  ) {
    super(`Transición de retracto ilegal: ${from} → ${to}`);
    this.name = "RetractTransitionError";
  }
}

async function assertRetract(id: string): Promise<{ id: string; status: RetractStatus }> {
  const rr = await prisma.retractRequest.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!rr) throw new RetractError("NOT_FOUND");
  return rr;
}

/** PENDING → APPROVED. Envía instrucciones de devolución al cliente. */
export async function approveRetract(id: string, adminId: string): Promise<void> {
  const rr = await assertRetract(id);
  if (!RETRACT_TRANSITIONS[rr.status].includes("APPROVED")) {
    throw new RetractTransitionError(rr.status, "APPROVED");
  }
  await prisma.retractRequest.update({
    where: { id },
    data: { status: "APPROVED", approvedAt: new Date(), processedBy: adminId },
  });
  await sendRetractApproved(id);
  logger.info({ event: "retract.approved", id, adminId });
}

/** PENDING/APPROVED → REJECTED, con motivo obligatorio. */
export async function rejectRetract(id: string, adminId: string, note: string): Promise<void> {
  const rr = await assertRetract(id);
  if (!RETRACT_TRANSITIONS[rr.status].includes("REJECTED")) {
    throw new RetractTransitionError(rr.status, "REJECTED");
  }
  await prisma.retractRequest.update({
    where: { id },
    data: { status: "REJECTED", rejectionNote: note.trim() || "Sin motivo especificado", processedBy: adminId },
  });
  logger.info({ event: "retract.rejected", id, adminId });
}

/** APPROVED → RECEIVED (el cliente devolvió el producto). */
export async function markRetractReceived(id: string, adminId: string): Promise<void> {
  const rr = await assertRetract(id);
  if (!RETRACT_TRANSITIONS[rr.status].includes("RECEIVED")) {
    throw new RetractTransitionError(rr.status, "RECEIVED");
  }
  await prisma.retractRequest.update({
    where: { id },
    data: { status: "RECEIVED", receivedAt: new Date(), processedBy: adminId },
  });
  logger.info({ event: "retract.received", id, adminId });
}

/**
 * RECEIVED → REFUNDED. El dinero se emite MANUALMENTE en Wompi/transferencia; esto
 * registra el método + fecha y avisa al cliente. NO restaura stock automáticamente
 * (un producto devuelto puede no ser revendible; el admin ajusta inventario a mano)
 * ni cambia el estado de la orden (fue entregada; el retracto es un evento aparte).
 */
export async function refundRetract(
  id: string,
  adminId: string,
  method: "WOMPI_VOID" | "BANK_TRANSFER",
): Promise<void> {
  const rr = await assertRetract(id);
  if (!RETRACT_TRANSITIONS[rr.status].includes("REFUNDED")) {
    throw new RetractTransitionError(rr.status, "REFUNDED");
  }
  await prisma.retractRequest.update({
    where: { id },
    data: { status: "REFUNDED", refundedAt: new Date(), refundMethod: method, processedBy: adminId },
  });
  await sendRetractRefunded(id);
  logger.info({ event: "retract.refunded", id, adminId, method });
}

export type AdminRetractRow = {
  id: string;
  status: RetractStatus;
  reason: string | null;
  rejectionNote: string | null;
  refundAmount: number;
  refundMethod: string | null;
  requestedAt: Date;
  orderNumber: string;
  productName: string;
  qty: number;
  customerEmail: string;
};

/** Lista solicitudes para el panel admin, opcionalmente filtradas por estado. */
export async function listRetractRequests(
  opts: { status?: RetractStatus } = {},
): Promise<AdminRetractRow[]> {
  const rows = await prisma.retractRequest.findMany({
    where: opts.status ? { status: opts.status } : {},
    orderBy: { requestedAt: "desc" },
    take: 200,
    select: {
      id: true,
      status: true,
      reason: true,
      rejectionNote: true,
      refundAmount: true,
      refundMethod: true,
      requestedAt: true,
      orderItem: {
        select: {
          qty: true,
          variant: { select: { product: { select: { name: true } } } },
          order: { select: { number: true, email: true } },
        },
      },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    reason: r.reason,
    rejectionNote: r.rejectionNote,
    refundAmount: r.refundAmount,
    refundMethod: r.refundMethod,
    requestedAt: r.requestedAt,
    orderNumber: r.orderItem.order.number,
    productName: r.orderItem.variant.product.name,
    qty: r.orderItem.qty,
    customerEmail: r.orderItem.order.email,
  }));
}
