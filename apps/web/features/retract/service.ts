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
