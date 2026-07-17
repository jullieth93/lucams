/*
 * Service — Conciliación del efectivo contraentrega (COD) · ADR-064.
 *
 * Problema (ADR-062, dimensión "COD antifraude+conciliación"): cuando un pedido COD se ENTREGA, el
 * courier cobra el efectivo y luego lo remite a la tienda. Hoy el sistema asume "entregado = dinero
 * en caja", pero la remesa del courier es un acto aparte que puede tardar, llegar corta o no llegar
 * (fraude / pérdida). No había registro de qué efectivo realmente llegó.
 *
 * Este service concilia ese efectivo: lista las órdenes COD entregadas y su estado de remesa, y deja
 * que Lucy marque "remitido" (recibí el depósito) o "discrepancia" (no cuadra / no llegó). El estado
 * "por remitir" NO se persiste: se DERIVA de las órdenes COD DELIVERED sin fila REMITTED. Solo se
 * guardan las RESOLUCIONES (CodReconciliation, 1 fila por orden, idempotente por orderId @unique).
 *
 * Server-only (rol privilegiado Prisma). Dinero en centavos COP (nunca float).
 */

import "server-only";
import { prisma, Prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export class CodReconciliationError extends Error {
  constructor(
    public code: "NOT_FOUND" | "NOT_COD" | "NOT_DELIVERED" | "INVALID_AMOUNT",
    message: string,
  ) {
    super(message);
    this.name = "CodReconciliationError";
  }
}

/** Estado de conciliación derivado de una orden COD entregada. */
export type CodReconStatus = "PENDING_REMIT" | "REMITTED" | "DISCREPANCY";

const COD_RECON_PAGE_SIZE = 20;

export type CodReconFilter = "all" | "pending" | "remitted" | "discrepancy";

function reconWhereForFilter(filter: CodReconFilter): Prisma.OrderWhereInput {
  // El universo es SIEMPRE: órdenes COD ENTREGADAS (el efectivo ya lo cobró el courier).
  const base: Prisma.OrderWhereInput = {
    deletedAt: null,
    paymentMethod: "COD",
    status: "DELIVERED",
  };
  switch (filter) {
    case "pending":
      return { ...base, codReconciliation: { is: null } };
    case "remitted":
      return { ...base, codReconciliation: { status: "REMITTED" } };
    case "discrepancy":
      return { ...base, codReconciliation: { status: "DISCREPANCY" } };
    default:
      return base;
  }
}

export type CodReconRow = {
  orderId: string;
  number: string;
  email: string;
  deliveredAt: Date | null;
  createdAt: Date;
  expectedAmount: number; // = order.total (centavos COP)
  status: CodReconStatus;
  remittedAmount: number | null;
  remittedAt: Date | null;
  carrierRef: string | null;
  discrepancyReason: string | null;
  note: string | null;
  shippingCarrier: string | null;
  trackingNumber: string | null;
};

/** Lista paginada de órdenes COD entregadas + su estado de conciliación (derivado o resuelto). */
export async function listCodReconciliation(opts: {
  filter?: CodReconFilter;
  page?: number;
  pageSize?: number;
}): Promise<{ items: CodReconRow[]; total: number; page: number; totalPages: number }> {
  const filter = opts.filter ?? "all";
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = opts.pageSize ?? COD_RECON_PAGE_SIZE;
  const where = reconWhereForFilter(filter);

  const [rows, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { deliveredAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        number: true,
        email: true,
        total: true,
        deliveredAt: true,
        createdAt: true,
        shippingCarrier: true,
        trackingNumber: true,
        codReconciliation: {
          select: {
            status: true,
            remittedAmount: true,
            remittedAt: true,
            carrierRef: true,
            discrepancyReason: true,
            note: true,
          },
        },
      },
    }),
    prisma.order.count({ where }),
  ]);

  const items: CodReconRow[] = rows.map((o) => {
    const r = o.codReconciliation;
    const status: CodReconStatus = r?.status ?? "PENDING_REMIT";
    return {
      orderId: o.id,
      number: o.number,
      email: o.email,
      deliveredAt: o.deliveredAt,
      createdAt: o.createdAt,
      expectedAmount: o.total,
      status,
      remittedAmount: r?.remittedAmount ?? null,
      remittedAt: r?.remittedAt ?? null,
      carrierRef: r?.carrierRef ?? null,
      discrepancyReason: r?.discrepancyReason ?? null,
      note: r?.note ?? null,
      shippingCarrier: o.shippingCarrier,
      trackingNumber: o.trackingNumber,
    };
  });

  return { items, total, page, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** KPIs para el dashboard financiero + resumen diario. */
export async function getCodReconciliationTotals(): Promise<{
  pendingCount: number;
  pendingCop: number; // efectivo COD entregado pero sin remesar (esperado) — antifraude
  remittedCount: number;
  remittedCop: number; // efectivo COD que la tienda ya recibió
  discrepancyCount: number;
}> {
  const [pending, remitted, discrepancyCount] = await Promise.all([
    prisma.order.aggregate({
      where: {
        deletedAt: null,
        paymentMethod: "COD",
        status: "DELIVERED",
        codReconciliation: { is: null },
      },
      _count: true,
      _sum: { total: true },
    }),
    prisma.codReconciliation.aggregate({
      where: { status: "REMITTED" },
      _count: true,
      _sum: { remittedAmount: true },
    }),
    prisma.codReconciliation.count({ where: { status: "DISCREPANCY" } }),
  ]);

  return {
    pendingCount: pending._count,
    pendingCop: pending._sum.total ?? 0,
    remittedCount: remitted._count,
    remittedCop: remitted._sum.remittedAmount ?? 0,
    discrepancyCount,
  };
}

/** Carga la orden COD entregada validando que sea conciliable; devuelve el monto esperado (total). */
async function loadReconcilableOrder(orderId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, deletedAt: null },
    select: { id: true, number: true, paymentMethod: true, status: true, total: true },
  });
  if (!order) throw new CodReconciliationError("NOT_FOUND", "Pedido no encontrado");
  if (order.paymentMethod !== "COD") {
    throw new CodReconciliationError("NOT_COD", "El pedido no es contraentrega");
  }
  if (order.status !== "DELIVERED") {
    throw new CodReconciliationError(
      "NOT_DELIVERED",
      "El pedido aún no está entregado — el efectivo todavía no se ha cobrado",
    );
  }
  return order;
}

/**
 * Marca el efectivo de una orden COD como REMITIDO por el courier (Lucy vio el depósito). Idempotente
 * (upsert por orderId). remittedAmount por defecto = total; se puede registrar un monto distinto si
 * el courier remitió otra cantidad (queda visible el delta vs esperado).
 */
export async function markCodRemitted(
  orderId: string,
  input: { adminId: string; remittedAmount?: number; carrierRef?: string; note?: string },
): Promise<{ orderNumber: string; expectedAmount: number; remittedAmount: number }> {
  const order = await loadReconcilableOrder(orderId);
  const remittedAmount = input.remittedAmount ?? order.total;
  if (!Number.isInteger(remittedAmount) || remittedAmount < 0) {
    throw new CodReconciliationError("INVALID_AMOUNT", "El monto remitido no es válido");
  }

  const data = {
    status: "REMITTED" as const,
    expectedAmount: order.total,
    remittedAmount,
    remittedAt: new Date(),
    remittedBy: input.adminId,
    carrierRef: input.carrierRef?.trim() || null,
    note: input.note?.trim() || null,
    discrepancyReason: null,
  };
  await prisma.codReconciliation.upsert({
    where: { orderId },
    create: { orderId, ...data },
    update: data,
  });

  // Si estaba marcada con needsReconciliation por una discrepancia previa de caja, se limpia al
  // remitir OK (no pisamos flags de OTRO origen: solo si el motivo era de conciliación COD).
  await prisma.order.updateMany({
    where: { id: orderId, needsReconciliation: true, reconciliationReason: { startsWith: "COD:" } },
    data: { needsReconciliation: false, reconciliationReason: null },
  });

  logger.info(
    { event: "cod.remit.done", orderNumber: order.number, expected: order.total, remittedAmount },
    "COD remitido conciliado",
  );
  return { orderNumber: order.number, expectedAmount: order.total, remittedAmount };
}

/**
 * Marca una discrepancia de caja COD (el efectivo no cuadra o no llegó). Idempotente (upsert). Además
 * prende Order.needsReconciliation para que sea VISIBLE en /admin/pedidos (mandato #7, sin Sentry).
 */
export async function flagCodDiscrepancy(
  orderId: string,
  input: { adminId: string; discrepancyReason: string; note?: string; remittedAmount?: number },
): Promise<{ orderNumber: string; expectedAmount: number }> {
  const order = await loadReconcilableOrder(orderId);
  const reason = input.discrepancyReason.trim();
  if (!reason) {
    throw new CodReconciliationError("INVALID_AMOUNT", "La discrepancia necesita un motivo");
  }
  const remittedAmount =
    typeof input.remittedAmount === "number" && Number.isInteger(input.remittedAmount)
      ? input.remittedAmount
      : null;

  const data = {
    status: "DISCREPANCY" as const,
    expectedAmount: order.total,
    remittedAmount,
    remittedBy: input.adminId,
    discrepancyReason: reason,
    note: input.note?.trim() || null,
  };
  await prisma.codReconciliation.upsert({
    where: { orderId },
    create: { orderId, ...data },
    update: data,
  });

  await prisma.order.update({
    where: { id: orderId },
    data: {
      needsReconciliation: true,
      reconciliationReason: `COD: ${reason}`.slice(0, 500),
    },
  });

  logger.warn(
    { event: "cod.discrepancy.flagged", orderNumber: order.number, expected: order.total, reason },
    "Discrepancia de caja COD",
  );
  return { orderNumber: order.number, expectedAmount: order.total };
}
