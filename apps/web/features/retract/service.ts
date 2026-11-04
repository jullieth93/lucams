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
import { prisma, Prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { RetractStatus } from "@lucams/db";
import { sendRetractApproved, sendRetractRejected, sendRetractRefunded } from "./emails";
import { RETRACT_WINDOW_BUSINESS_DAYS } from "@/lib/consumer-law";
import { computeRetractSlaDueAt } from "@/lib/colombian-sla";
import { restoreRedeemedPointsForRetract } from "@/features/loyalty/service";
import { resolvePostSaleContact } from "@/features/identity/resolution-service";
import {
  hashBearerToken,
  verifyEmailMatchesTimingSafe,
  verifyTokenHashTimingSafe,
} from "@/lib/token-hash";

export { RETRACT_WINDOW_BUSINESS_DAYS };

// Colombia es UTC-5 SIN horario de verano (fijo). El cómputo de días hábiles y el
// cierre de ventana deben ser en hora colombiana (COT), no en la del servidor
// (UTC en Vercel) — si no, la ventana se recorta ~5h y podría negar un retracto
// legítimamente vigente. Trabajamos en "reloj de pared COT" restando el offset,
// operando con métodos UTC, y volviendo al instante UTC real.
const COT_OFFSET_MS = 5 * 60 * 60 * 1000;

/**
 * Avanza `n` días hábiles (Lun-Vie, en calendario colombiano) desde `from`. No
 * descuenta festivos CO (raros; el admin aprueba cada solicitud).
 */
export function addBusinessDays(from: Date, n: number): Date {
  const cot = new Date(from.getTime() - COT_OFFSET_MS); // reloj de pared COT
  let added = 0;
  while (added < n) {
    cot.setUTCDate(cot.getUTCDate() + 1);
    const day = cot.getUTCDay(); // 0=Dom … 6=Sáb (en COT)
    if (day !== 0 && day !== 6) added++;
  }
  return new Date(cot.getTime() + COT_OFFSET_MS); // instante UTC real
}

/** Fin de la ventana: 23:59:59.999 hora Colombia del último día hábil, inclusive. */
export function retractWindowEnd(deliveredAt: Date): Date {
  const endCot = new Date(
    addBusinessDays(deliveredAt, RETRACT_WINDOW_BUSINESS_DAYS).getTime() - COT_OFFSET_MS,
  );
  endCot.setUTCHours(23, 59, 59, 999); // fin del día en COT
  return new Date(endCot.getTime() + COT_OFFSET_MS);
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

export interface RetractRefundBreakdownInput {
  lineTotal: number;
  orderSubtotal: number;
  couponDiscount: number;
  couponType?: string | null;
  loyaltyDiscount: number;
  loyaltyPointsRedeemed: number;
  /** Suma de `refundAmount` de otros retractos activos (no REJECTED) en la misma orden. */
  alreadyRefundedCents?: number;
}

export interface RetractRefundBreakdown {
  /** Efectivo en centavos COP a devolver por este ítem (acotado al efectivo realmente pagado). */
  cashRefundCents: number;
  /** Porción combinada de cupón + Puntos Lucams absorbida por esta línea (centavos COP). */
  discountShareCents: number;
  /** Puntos Lucams proporcionales a restaurar cuando el retracto pasa a REFUNDED. */
  pointsToRestore: number;
}

/** División entera half-up con BigInt (sin floats ni riesgo de overflow sobre MAX_SAFE_INTEGER). */
function roundMulDiv(a: number, b: number, denom: number): number {
  if (a <= 0 || b <= 0 || denom <= 0) return 0;
  const num = BigInt(a) * BigInt(b);
  const d = BigInt(denom);
  return Number((num + d / BigInt(2)) / d);
}

/**
 * Calcula el desglose exacto de reembolso por línea (aritmética entera en centavos COP):
 *  - Prorratea TANTO el descuento del cupón sobre mercancía (`FREE_SHIPPING` afecta flete, no ítems)
 *    COMO `Order.loyaltyDiscount` (Puntos Lucams redimidos) sobre `orderSubtotal`.
 *  - Acota `cashRefundCents` contra el efectivo de mercancía realmente pagado menos otros retractos
 *    no rechazados de la misma orden (`[FIN-01]`: nunca devuelve más efectivo del que entró).
 *  - Calcula `pointsToRestore` proporcionales a la línea cuando el pedido redimió Puntos Lucams.
 */
export function computeRetractRefundBreakdown(
  input: RetractRefundBreakdownInput,
): RetractRefundBreakdown {
  const lineTotal = Math.max(0, Math.trunc(input.lineTotal));
  const subtotal = Math.max(0, Math.trunc(input.orderSubtotal));
  const subtotalCouponDiscount =
    input.couponType === "FREE_SHIPPING" ? 0 : Math.max(0, Math.trunc(input.couponDiscount));
  const loyaltyDiscount = Math.max(0, Math.trunc(input.loyaltyDiscount));
  const totalMerchandiseDiscount = Math.min(subtotal, subtotalCouponDiscount + loyaltyDiscount);

  const discountShareCents =
    totalMerchandiseDiscount > 0 && subtotal > 0
      ? Math.min(lineTotal, roundMulDiv(totalMerchandiseDiscount, lineTotal, subtotal))
      : 0;
  const rawCashRefund = Math.max(0, lineTotal - discountShareCents);
  const maxOrderCashMerchandise = Math.max(0, subtotal - totalMerchandiseDiscount);
  const alreadyRefunded = Math.max(0, Math.trunc(input.alreadyRefundedCents ?? 0));
  const remainingOrderCash = Math.max(0, maxOrderCashMerchandise - alreadyRefunded);
  const cashRefundCents = Math.min(rawCashRefund, remainingOrderCash);

  const pointsRedeemed = Math.max(0, Math.trunc(input.loyaltyPointsRedeemed));
  const pointsToRestore =
    pointsRedeemed > 0 && subtotal > 0
      ? Math.min(pointsRedeemed, roundMulDiv(pointsRedeemed, lineTotal, subtotal))
      : 0;

  return {
    cashRefundCents,
    discountShareCents,
    pointsToRestore,
  };
}

export type RetractIneligibleReason =
  "NOT_DELIVERED" | "OUT_OF_WINDOW" | "PERSONALIZED" | "ALREADY_REQUESTED";

export type RetractableItem = {
  orderItemId: string;
  productName: string;
  qty: number;
  lineTotal: number;
  estimatedRefundCents: number;
  estimatedPointsToRestore: number;
  eligible: boolean;
  reason: RetractIneligibleReason | null;
  existingStatus: string | null;
};

/**
 * Evalúa cada item de una orden para el retracto. La identidad es obligatoria
 * (auditoría D-3): si el pedido no pertenece a `customerId`, devuelve lista vacía
 * (no filtra a nivel de UI, corta acá). `now` inyectable para tests.
 */
export async function getRetractableItems(
  orderId: string,
  opts: { customerId: string; now?: Date },
): Promise<RetractableItem[]> {
  const now = opts.now ?? new Date();
  const order = await prisma.order.findFirst({
    where: { id: orderId, deletedAt: null },
    select: {
      customerId: true,
      status: true,
      deliveredAt: true,
      subtotal: true,
      discount: true,
      loyaltyDiscount: true,
      loyaltyPointsRedeemed: true,
      coupon: { select: { type: true } },
      items: {
        select: {
          id: true,
          qty: true,
          unitPrice: true,
          customDesign: true,
          designId: true,
          variant: { select: { product: { select: { name: true } } } },
          retractRequest: { select: { status: true, refundAmount: true } },
        },
      },
    },
  });
  if (!order) return [];
  // Strict ownership (D-3): the order MUST belong to the caller. An order with
  // customerId null (guest / deleted customer) never belongs to a logged-in customer.
  if (order.customerId !== opts.customerId) return [];

  return mapOrderToRetractableItems(order, now);
}

/**
 * [CX-01] — Elegibilidad de retracto (Ley 1480 art. 47 / Ley 2439) para `/pedido/[token]`,
 * autenticada mediante `publicAccessTokenHash`.
 */
export async function getRetractableItemsByOrderToken(
  token: string,
  opts?: { now?: Date },
): Promise<RetractableItem[]> {
  if (!/^[a-f0-9]{32}$/.test(token)) return [];
  const now = opts?.now ?? new Date();
  const order = await prisma.order.findFirst({
    where: { publicAccessTokenHash: hashBearerToken(token), deletedAt: null },
    select: {
      publicAccessTokenHash: true,
      status: true,
      deliveredAt: true,
      subtotal: true,
      discount: true,
      loyaltyDiscount: true,
      loyaltyPointsRedeemed: true,
      coupon: { select: { type: true } },
      items: {
        select: {
          id: true,
          qty: true,
          unitPrice: true,
          customDesign: true,
          designId: true,
          variant: { select: { product: { select: { name: true } } } },
          retractRequest: { select: { status: true, refundAmount: true } },
        },
      },
    },
  });
  if (!order || !verifyTokenHashTimingSafe(token, order.publicAccessTokenHash)) return [];
  return mapOrderToRetractableItems(order, now);
}

function mapOrderToRetractableItems(
  order: {
    status: string;
    deliveredAt: Date | null;
    subtotal: number;
    discount: number;
    loyaltyDiscount: number;
    loyaltyPointsRedeemed: number;
    coupon: { type: string } | null;
    items: Array<{
      id: string;
      qty: number;
      unitPrice: number;
      customDesign: unknown | null;
      designId: string | null;
      variant: { product: { name: string } };
      retractRequest: { status: string; refundAmount: number } | null;
    }>;
  },
  now: Date,
): RetractableItem[] {
  const delivered = order.status === "DELIVERED" && !!order.deliveredAt;
  const withinWindow = order.deliveredAt ? isWithinRetractWindow(order.deliveredAt, now) : false;
  const activeRefundedCents = order.items.reduce((acc, it) => {
    if (it.retractRequest && it.retractRequest.status !== "REJECTED") {
      return acc + it.retractRequest.refundAmount;
    }
    return acc;
  }, 0);

  return order.items.map((it) => {
    let reason: RetractIneligibleReason | null = null;
    if (it.retractRequest) reason = "ALREADY_REQUESTED";
    else if (!delivered) reason = "NOT_DELIVERED";
    else if (!withinWindow) reason = "OUT_OF_WINDOW";
    else if (isItemPersonalized(it)) reason = "PERSONALIZED";
    const lineTotal = it.unitPrice * it.qty;
    const breakdown = computeRetractRefundBreakdown({
      lineTotal,
      orderSubtotal: order.subtotal,
      couponDiscount: order.discount,
      couponType: order.coupon?.type ?? null,
      loyaltyDiscount: order.loyaltyDiscount,
      loyaltyPointsRedeemed: order.loyaltyPointsRedeemed,
      alreadyRefundedCents: it.retractRequest ? 0 : activeRefundedCents,
    });
    return {
      orderItemId: it.id,
      productName: it.variant.product.name,
      qty: it.qty,
      lineTotal,
      estimatedRefundCents: it.retractRequest?.refundAmount ?? breakdown.cashRefundCents,
      estimatedPointsToRestore: breakdown.pointsToRestore,
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
 * atómica. La identidad (`customerId`) es obligatoria (auditoría D-3) — igual que
 * `createWarrantyClaim`. refundAmount = línea del item. Lanza RetractError si no procede.
 */
export async function createRetractRequest(
  orderItemId: string,
  opts: { customerId: string; reason?: string; now?: Date },
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
      order: {
        select: {
          customerId: true,
          contactId: true,
          email: true,
          status: true,
          deliveredAt: true,
          deletedAt: true,
          subtotal: true,
          discount: true,
          loyaltyDiscount: true,
          loyaltyPointsRedeemed: true,
          coupon: { select: { type: true } },
          items: {
            select: {
              id: true,
              retractRequest: { select: { status: true, refundAmount: true } },
            },
          },
        },
      },
    },
  });
  if (!item || item.order.deletedAt) throw new RetractError("NOT_FOUND");
  // Strict ownership (D-3): the order must belong to the caller. A null
  // order.customerId (guest / deleted customer) never matches → FORBIDDEN.
  if (item.order.customerId !== opts.customerId) {
    throw new RetractError("FORBIDDEN");
  }
  if (item.retractRequest) throw new RetractError("ALREADY_REQUESTED");
  if (item.order.status !== "DELIVERED" || !item.order.deliveredAt) {
    throw new RetractError("NOT_DELIVERED");
  }
  if (!isWithinRetractWindow(item.order.deliveredAt, now)) throw new RetractError("OUT_OF_WINDOW");
  if (isItemPersonalized(item)) throw new RetractError("PERSONALIZED");

  // [FIN-01] — el reembolso en efectivo descuenta la parte proporcional TANTO del cupón de
  // mercancía COMO de Puntos Lucams (`loyaltyDiscount`), y nunca supera el efectivo realmente
  // pagado por los ítems menos otros retractos activos de la orden.
  const lineTotal = item.unitPrice * item.qty;
  const ord = item.order;
  const alreadyRefundedCents = ord.items.reduce((acc, sibling) => {
    if (
      sibling.id !== item.id &&
      sibling.retractRequest &&
      sibling.retractRequest.status !== "REJECTED"
    ) {
      return acc + sibling.retractRequest.refundAmount;
    }
    return acc;
  }, 0);
  const { cashRefundCents: refundAmount } = computeRetractRefundBreakdown({
    lineTotal,
    orderSubtotal: ord.subtotal,
    couponDiscount: ord.discount,
    couponType: ord.coupon?.type ?? null,
    loyaltyDiscount: ord.loyaltyDiscount,
    loyaltyPointsRedeemed: ord.loyaltyPointsRedeemed,
    alreadyRefundedCents,
  });
  const contactId = await resolvePostSaleContact(prisma, {
    orderContactId: ord.contactId,
    customerId: opts.customerId,
    orderEmail: ord.email,
  });
  try {
    const created = await prisma.retractRequest.create({
      data: {
        orderItemId,
        ...(contactId ? { contactId } : {}),
        // #5 — cap de 500 chars (defensa en profundidad, igual que warranty): protege a TODOS los
        // callers de un reason gigante (fila enorme / abuso), sin depender de la validación del form.
        reason: opts.reason?.trim().slice(0, 500) || null,
        refundAmount,
        status: "PENDING",
        slaDueAt: computeRetractSlaDueAt(now),
      },
      select: { id: true },
    });
    return { id: created.id, refundAmount };
  } catch (err) {
    // Carrera: dos solicitudes del mismo item a la vez. El @unique(orderItemId)
    // deja pasar solo una; la otra recibe P2002 → ya existe la solicitud.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new RetractError("ALREADY_REQUESTED");
    }
    throw err;
  }
}

/**
 * [CX-01] — Crea una solicitud de retracto desde `/pedido/[token]` para compradores invitados.
 * Protegida por `publicAccessTokenHash` (timing-safe) + confirmación timing-safe de `order.email`,
 * aplicando exactamente la misma ventana de días hábiles, exclusión de personalizados y
 * prorrateo de descuentos/puntos (`computeRetractRefundBreakdown`).
 */
export async function createGuestRetractRequest(
  orderItemId: string,
  opts: { token: string; email: string; reason?: string; now?: Date },
): Promise<{ id: string; refundAmount: number }> {
  if (!/^[a-f0-9]{32}$/.test(opts.token)) throw new RetractError("NOT_FOUND");
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
      order: {
        select: {
          customerId: true,
          contactId: true,
          email: true,
          publicAccessTokenHash: true,
          status: true,
          deliveredAt: true,
          deletedAt: true,
          subtotal: true,
          discount: true,
          loyaltyDiscount: true,
          loyaltyPointsRedeemed: true,
          coupon: { select: { type: true } },
          items: {
            select: {
              id: true,
              retractRequest: { select: { status: true, refundAmount: true } },
            },
          },
        },
      },
    },
  });
  if (
    !item ||
    item.order.deletedAt ||
    !verifyTokenHashTimingSafe(opts.token, item.order.publicAccessTokenHash)
  ) {
    throw new RetractError("NOT_FOUND");
  }
  if (!verifyEmailMatchesTimingSafe(opts.email, item.order.email)) {
    throw new RetractError("FORBIDDEN");
  }
  if (item.retractRequest) throw new RetractError("ALREADY_REQUESTED");
  if (item.order.status !== "DELIVERED" || !item.order.deliveredAt) {
    throw new RetractError("NOT_DELIVERED");
  }
  if (!isWithinRetractWindow(item.order.deliveredAt, now)) throw new RetractError("OUT_OF_WINDOW");
  if (isItemPersonalized(item)) throw new RetractError("PERSONALIZED");

  const lineTotal = item.unitPrice * item.qty;
  const ord = item.order;
  const alreadyRefundedCents = ord.items.reduce((acc, sibling) => {
    if (
      sibling.id !== item.id &&
      sibling.retractRequest &&
      sibling.retractRequest.status !== "REJECTED"
    ) {
      return acc + sibling.retractRequest.refundAmount;
    }
    return acc;
  }, 0);
  const { cashRefundCents: refundAmount } = computeRetractRefundBreakdown({
    lineTotal,
    orderSubtotal: ord.subtotal,
    couponDiscount: ord.discount,
    couponType: ord.coupon?.type ?? null,
    loyaltyDiscount: ord.loyaltyDiscount,
    loyaltyPointsRedeemed: ord.loyaltyPointsRedeemed,
    alreadyRefundedCents,
  });
  const guestContactId = await resolvePostSaleContact(prisma, {
    orderContactId: ord.contactId,
    customerId: ord.customerId,
    orderEmail: ord.email,
  });
  try {
    const created = await prisma.retractRequest.create({
      data: {
        orderItemId,
        ...(guestContactId ? { contactId: guestContactId } : {}),
        reason: opts.reason?.trim().slice(0, 500) || null,
        refundAmount,
        status: "PENDING",
        slaDueAt: computeRetractSlaDueAt(now),
      },
      select: { id: true },
    });
    return { id: created.id, refundAmount };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new RetractError("ALREADY_REQUESTED");
    }
    throw err;
  }
}

// ───────────────────────── Gestión admin ─────────────────────────

/**
 * Crea una solicitud de retracto INICIADA POR EL ADMIN (conversión desde un
 * ticket de soporte GARANTIA_DEVOLUCION en /admin/soporte/[id]).
 *
 * Diferencias con createRetractRequest (flujo cliente):
 *  - Sin chequeo de propiedad (FORBIDDEN): el admin actúa a nombre del cliente.
 *  - La ventana de 5 días hábiles NO se exige: el admin es la válvula legal ya
 *    documentada para los bordes del cómputo (un cliente que escribe por
 *    /contacto suele llegar tarde al formulario self-service).
 *  - SÍ se mantienen: pedido entregado, sin solicitud previa y excepción de
 *    personalizados (Ley 1480 art. 47: no hay válvula para esa excepción).
 * El prorrateo del descuento del cupón es idéntico al flujo cliente (#2).
 */
export async function createRetractRequestAsAdmin(
  orderItemId: string,
  opts: { reason?: string; adminId: string },
): Promise<{ id: string; refundAmount: number }> {
  const item = await prisma.orderItem.findUnique({
    where: { id: orderItemId },
    select: {
      id: true,
      qty: true,
      unitPrice: true,
      customDesign: true,
      designId: true,
      retractRequest: { select: { id: true } },
      order: {
        select: {
          customerId: true,
          contactId: true,
          email: true,
          status: true,
          deletedAt: true,
          subtotal: true,
          discount: true,
          loyaltyDiscount: true,
          loyaltyPointsRedeemed: true,
          coupon: { select: { type: true } },
          items: {
            select: {
              id: true,
              retractRequest: { select: { status: true, refundAmount: true } },
            },
          },
        },
      },
    },
  });
  if (!item || item.order.deletedAt) throw new RetractError("NOT_FOUND");
  if (item.retractRequest) throw new RetractError("ALREADY_REQUESTED");
  if (item.order.status !== "DELIVERED") throw new RetractError("NOT_DELIVERED");
  if (isItemPersonalized(item)) throw new RetractError("PERSONALIZED");

  const lineTotal = item.unitPrice * item.qty;
  const ord = item.order;
  const alreadyRefundedCents = ord.items.reduce((acc, sibling) => {
    if (
      sibling.id !== item.id &&
      sibling.retractRequest &&
      sibling.retractRequest.status !== "REJECTED"
    ) {
      return acc + sibling.retractRequest.refundAmount;
    }
    return acc;
  }, 0);
  const { cashRefundCents: refundAmount } = computeRetractRefundBreakdown({
    lineTotal,
    orderSubtotal: ord.subtotal,
    couponDiscount: ord.discount,
    couponType: ord.coupon?.type ?? null,
    loyaltyDiscount: ord.loyaltyDiscount,
    loyaltyPointsRedeemed: ord.loyaltyPointsRedeemed,
    alreadyRefundedCents,
  });
  const adminContactId = await resolvePostSaleContact(prisma, {
    orderContactId: ord.contactId,
    customerId: ord.customerId,
    orderEmail: ord.email,
  });
  try {
    const created = await prisma.retractRequest.create({
      data: {
        orderItemId,
        ...(adminContactId ? { contactId: adminContactId } : {}),
        reason: opts.reason?.trim().slice(0, 500) || null,
        refundAmount,
        status: "PENDING",
        processedBy: opts.adminId,
        slaDueAt: computeRetractSlaDueAt(new Date()),
      },
      select: { id: true },
    });
    return { id: created.id, refundAmount };
  } catch (err) {
    // Misma carrera que el flujo cliente: @unique(orderItemId) deja pasar una sola.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new RetractError("ALREADY_REQUESTED");
    }
    throw err;
  }
}

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
  const rr = await prisma.retractRequest.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
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
    data: {
      status: "REJECTED",
      rejectionNote: note.trim() || "Sin motivo especificado",
      processedBy: adminId,
    },
  });
  // #2 — avisar al cliente con el motivo (antes pasaba a REJECTED en silencio).
  await sendRetractRejected(id);
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
 * registra el método + fecha, restaura proporcionalmente e idempotentemente los
 * Puntos Lucams redimidos por esta línea (si la orden tenía cliente y redención),
 * y avisa al cliente. NO restaura stock automáticamente (un producto devuelto puede
 * no ser revendible; el admin ajusta inventario a mano) ni cambia el estado de la
 * orden (fue entregada; el retracto es un evento aparte).
 */
export async function refundRetract(
  id: string,
  adminId: string,
  method: "WOMPI_VOID" | "BANK_TRANSFER",
): Promise<void> {
  const rr = await prisma.retractRequest.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      orderItem: {
        select: {
          qty: true,
          unitPrice: true,
          order: {
            select: {
              id: true,
              customerId: true,
              subtotal: true,
              discount: true,
              loyaltyDiscount: true,
              loyaltyPointsRedeemed: true,
              coupon: { select: { type: true } },
            },
          },
        },
      },
    },
  });
  if (!rr) throw new RetractError("NOT_FOUND");
  if (!RETRACT_TRANSITIONS[rr.status].includes("REFUNDED")) {
    throw new RetractTransitionError(rr.status, "REFUNDED");
  }

  const ord = rr.orderItem.order;
  const breakdown = computeRetractRefundBreakdown({
    lineTotal: rr.orderItem.unitPrice * rr.orderItem.qty,
    orderSubtotal: ord.subtotal,
    couponDiscount: ord.discount,
    couponType: ord.coupon?.type ?? null,
    loyaltyDiscount: ord.loyaltyDiscount,
    loyaltyPointsRedeemed: ord.loyaltyPointsRedeemed,
  });

  const pointsRestored = await prisma.$transaction(async (tx) => {
    const updated = await tx.retractRequest.updateMany({
      where: { id, status: "RECEIVED" },
      data: {
        status: "REFUNDED",
        refundedAt: new Date(),
        refundMethod: method,
        processedBy: adminId,
      },
    });
    if (updated.count !== 1) {
      const fresh = await tx.retractRequest.findUnique({
        where: { id },
        select: { status: true },
      });
      throw new RetractTransitionError(fresh?.status ?? rr.status, "REFUNDED");
    }
    if (ord.customerId && ord.loyaltyPointsRedeemed > 0 && breakdown.pointsToRestore > 0) {
      return restoreRedeemedPointsForRetract(tx, {
        retractId: id,
        orderId: ord.id,
        customerId: ord.customerId,
        proportionalPoints: breakdown.pointsToRestore,
        orderPointsRedeemed: ord.loyaltyPointsRedeemed,
      });
    }
    return 0;
  });

  await sendRetractRefunded(id);
  logger.info({ event: "retract.refunded", id, adminId, method, pointsRestored });
}

export type AdminRetractRow = {
  id: string;
  status: RetractStatus;
  reason: string | null;
  rejectionNote: string | null;
  refundAmount: number;
  pointsToRestore: number;
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
          unitPrice: true,
          variant: { select: { product: { select: { name: true } } } },
          order: {
            select: {
              number: true,
              email: true,
              customerId: true,
              subtotal: true,
              discount: true,
              loyaltyDiscount: true,
              loyaltyPointsRedeemed: true,
              coupon: { select: { type: true } },
            },
          },
        },
      },
    },
  });
  return rows.map((r) => {
    const ord = r.orderItem.order;
    const breakdown = computeRetractRefundBreakdown({
      lineTotal: r.orderItem.unitPrice * r.orderItem.qty,
      orderSubtotal: ord.subtotal,
      couponDiscount: ord.discount,
      couponType: ord.coupon?.type ?? null,
      loyaltyDiscount: ord.loyaltyDiscount,
      loyaltyPointsRedeemed: ord.customerId ? ord.loyaltyPointsRedeemed : 0,
    });
    return {
      id: r.id,
      status: r.status,
      reason: r.reason,
      rejectionNote: r.rejectionNote,
      refundAmount: r.refundAmount,
      pointsToRestore: breakdown.pointsToRestore,
      refundMethod: r.refundMethod,
      requestedAt: r.requestedAt,
      orderNumber: ord.number,
      productName: r.orderItem.variant.product.name,
      qty: r.orderItem.qty,
      customerEmail: ord.email,
    };
  });
}

/** Conteo de retractos abiertos (pendientes de revisión, recepción o reembolso) para el Dashboard. */
export async function countOpenRetractRequests(): Promise<number> {
  return prisma.retractRequest.count({
    where: { status: { in: ["PENDING", "APPROVED", "RECEIVED"] } },
  });
}
