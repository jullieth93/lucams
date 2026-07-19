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
 * "por remitir" NO se persiste: se DERIVA de las órdenes COD con efectivo cobrado (deliveredAt not
 * null, aunque luego se reembolsen) sin fila de conciliación. Solo se guardan las RESOLUCIONES
 * (CodReconciliation, 1 fila por orden, idempotente por orderId @unique). Review adversarial ADR-064.
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

// Universo de conciliación: órdenes COD cuyo efectivo YA cobró el mensajero al entregar. Se ancla a
// `deliveredAt IS NOT NULL` (el hecho del cobro), NO al `status` vivo (review ADR-064): si la orden
// se reembolsa DESPUÉS de entregada, el mensajero SIGUE debiendo ese efectivo a la tienda (flujo de
// dinero distinto del reembolso al cliente) → no debe desaparecer del ledger.
const COD_CASH_COLLECTED: Prisma.OrderWhereInput = {
  deletedAt: null,
  paymentMethod: "COD",
  deliveredAt: { not: null },
};

function reconWhereForFilter(filter: CodReconFilter): Prisma.OrderWhereInput {
  const base: Prisma.OrderWhereInput = { ...COD_CASH_COLLECTED };
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
            expectedAmount: true,
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
      // Snapshot persistido del recaudo al conciliar (o el total vivo si aún no hay fila).
      expectedAmount: r?.expectedAmount ?? o.total,
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

export type CodReconciliationTotals = {
  pendingCount: number;
  pendingCop: number; // efectivo COD cobrado por el mensajero, aún SIN remesar (antifraude)
  remittedCount: number;
  receivedCop: number; // efectivo COD que la tienda YA recibió (remesas OK + parciales de discrepancia)
  discrepancyCount: number;
  shortfallCop: number; // faltante confirmado por discrepancias (esperado − recibido) — plata perdida
};

/**
 * KPIs para el dashboard financiero + resumen diario. Todos los agregados comparten el MISMO universo
 * (COD con efectivo cobrado = deliveredAt not null, no borrada) para que KPI y drill-down cuadren
 * (review ADR-064). El efectivo de las discrepancias SÍ entra en pesos: `receivedCop` incluye lo
 * parcial recibido y `shortfallCop` expone el faltante (antes se reducían a un conteo).
 */
export async function getCodReconciliationTotals(): Promise<CodReconciliationTotals> {
  // Filtro de orden compartido para agregar SOBRE la tabla de conciliación (no solo su status).
  const orderScope: Prisma.OrderWhereInput = COD_CASH_COLLECTED;
  const [pending, remitted, discrepancy] = await Promise.all([
    prisma.order.aggregate({
      where: { ...COD_CASH_COLLECTED, codReconciliation: { is: null } },
      _count: true,
      _sum: { total: true },
    }),
    prisma.codReconciliation.aggregate({
      where: { status: "REMITTED", order: orderScope },
      _count: true,
      _sum: { remittedAmount: true },
    }),
    prisma.codReconciliation.aggregate({
      where: { status: "DISCREPANCY", order: orderScope },
      _count: true,
      _sum: { expectedAmount: true, remittedAmount: true },
    }),
  ]);

  const remittedReceived = remitted._sum.remittedAmount ?? 0;
  const discrepancyReceived = discrepancy._sum.remittedAmount ?? 0;
  const discrepancyExpected = discrepancy._sum.expectedAmount ?? 0;

  return {
    pendingCount: pending._count,
    pendingCop: pending._sum.total ?? 0,
    remittedCount: remitted._count,
    receivedCop: remittedReceived + discrepancyReceived,
    discrepancyCount: discrepancy._count,
    shortfallCop: Math.max(0, discrepancyExpected - discrepancyReceived),
  };
}

// La columna de montos es INTEGER (centavos COP) → cota INT4. Validar arriba evita un error crudo de
// Postgres ("value out of range") con un mensaje que Lucy no entiende (review ADR-064).
const MAX_COD_AMOUNT_CENTS = 2_147_483_647;

function assertValidAmount(cents: number): void {
  if (!Number.isInteger(cents) || cents < 0) {
    throw new CodReconciliationError("INVALID_AMOUNT", "El monto no es válido");
  }
  if (cents > MAX_COD_AMOUNT_CENTS) {
    throw new CodReconciliationError(
      "INVALID_AMOUNT",
      "El monto es demasiado grande — ¿un cero de más? Revísalo",
    );
  }
}

/**
 * Carga la orden COD cuyo efectivo YA cobró el mensajero (deliveredAt) — validando conciliabilidad.
 * Se ancla a deliveredAt, NO al status vivo: una orden entregada y luego reembolsada sigue debiendo
 * la remesa del mensajero (review ADR-064). Trae reconciliationReason para no pisar motivos ajenos.
 */
async function loadReconcilableOrder(orderId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, deletedAt: null },
    select: {
      id: true,
      number: true,
      paymentMethod: true,
      deliveredAt: true,
      total: true,
      reconciliationReason: true,
    },
  });
  if (!order) throw new CodReconciliationError("NOT_FOUND", "Pedido no encontrado");
  if (order.paymentMethod !== "COD") {
    throw new CodReconciliationError("NOT_COD", "El pedido no es contraentrega");
  }
  if (!order.deliveredAt) {
    throw new CodReconciliationError(
      "NOT_DELIVERED",
      "El pedido aún no está entregado — el efectivo todavía no se ha cobrado",
    );
  }
  return order;
}

/** ¿El motivo de reconciliación vigente es de OTRO flujo (no COD)? → no pisarlo. */
function isForeignReason(reason: string | null): boolean {
  return Boolean(reason && !reason.startsWith("COD:"));
}

/**
 * Marca el efectivo de una orden COD como REMITIDO por el courier (Lucy vio el depósito). Idempotente
 * (upsert por orderId). remittedAmount por defecto = total; admite otro monto si el courier remitió
 * distinto (queda visible el delta vs esperado). Atómico: fila + flag de la orden en una transacción.
 */
export async function markCodRemitted(
  orderId: string,
  input: { adminId: string; remittedAmount?: number; carrierRef?: string; note?: string },
): Promise<{ orderNumber: string; expectedAmount: number; remittedAmount: number }> {
  const order = await loadReconcilableOrder(orderId);
  const remittedAmount = input.remittedAmount ?? order.total;
  assertValidAmount(remittedAmount);

  // #23 — "Registrar remesa" es SOLO para efectivo COMPLETO. Una remesa corta cerraba el pedido
  // como REMITTED y perdía el faltante en silencio (riesgo de fraude/pérdida). Se empuja al camino
  // de discrepancia (botón ámbar), donde shortfallCop captura expected−recibido. Campo vacío →
  // remittedAmount = order.total → no dispara.
  if (remittedAmount < order.total) {
    throw new CodReconciliationError(
      "INVALID_AMOUNT",
      "Recibiste menos de lo esperado. Regístralo como discrepancia (botón ámbar) para no perder el faltante.",
    );
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
  await prisma.$transaction(async (tx) => {
    await tx.codReconciliation.upsert({
      where: { orderId },
      create: { orderId, ...data },
      update: data,
    });
    // Limpia el flag SOLO si el motivo vigente era de conciliación COD (no pisa flags de otro origen).
    await tx.order.updateMany({
      where: {
        id: orderId,
        needsReconciliation: true,
        reconciliationReason: { startsWith: "COD:" },
      },
      data: { needsReconciliation: false, reconciliationReason: null },
    });
  });

  logger.info(
    { event: "cod.remit.done", orderNumber: order.number, expected: order.total, remittedAmount },
    "COD remitido conciliado",
  );
  return { orderNumber: order.number, expectedAmount: order.total, remittedAmount };
}

/**
 * Marca una discrepancia de caja COD (el efectivo no cuadra o no llegó). Idempotente (upsert). Prende
 * Order.needsReconciliation para que sea VISIBLE en /admin/pedidos (mandato #7). NO pisa un motivo de
 * otro flujo (ej. novedad de envío): el detalle COD vive siempre en CodReconciliation.discrepancyReason.
 * Atómico: fila + flag en una transacción.
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
  let remittedAmount: number | null = null;
  if (typeof input.remittedAmount === "number") {
    assertValidAmount(input.remittedAmount);
    remittedAmount = input.remittedAmount;
  }

  const data = {
    status: "DISCREPANCY" as const,
    expectedAmount: order.total,
    remittedAmount,
    remittedBy: input.adminId,
    discrepancyReason: reason,
    note: input.note?.trim() || null,
  };
  // Solo escribimos nuestro motivo si no hay uno de OTRO flujo (para no borrar, ej., "Envío DEVUELTO").
  const orderFlag: Prisma.OrderUpdateInput = isForeignReason(order.reconciliationReason)
    ? { needsReconciliation: true }
    : { needsReconciliation: true, reconciliationReason: `COD: ${reason}`.slice(0, 500) };

  await prisma.$transaction(async (tx) => {
    await tx.codReconciliation.upsert({
      where: { orderId },
      create: { orderId, ...data },
      update: data,
    });
    await tx.order.update({ where: { id: orderId }, data: orderFlag });
  });

  logger.warn(
    { event: "cod.discrepancy.flagged", orderNumber: order.number, expected: order.total, reason },
    "Discrepancia de caja COD",
  );
  return { orderNumber: order.number, expectedAmount: order.total };
}
