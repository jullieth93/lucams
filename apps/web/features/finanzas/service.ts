/*
 * Finanzas — agregaciones de ingresos para /admin/finanzas.
 *
 * Criterio de "ingreso" = el MISMO que los KPIs de la página (efectivo cobrado):
 *   WOMPI → PAID / FULFILLING / SHIPPED / DELIVERED (plata capturada online)
 *   COD   → solo DELIVERED (el efectivo del contraentrega entra al entregar)
 * DRAFT / PENDING_PAYMENT / CANCELLED / REFUNDED nunca son ingreso.
 *
 * OJO: el faltante por discrepancias COD (ADR-064) se resta solo en el KPI
 * global de la página — no tiene fecha, así que no se puede repartir por
 * período. Las series de acá son el BRUTO cobrado por ventana.
 *
 * Las funciones de agregación son puras (reciben filas) para testearlas sin
 * DB; la única que toca Prisma es getPeriodAggregates.
 */

import type {
  CodReconciliationStatus,
  DianStatus,
  DocumentType,
  OrderStatus,
  PaymentMethod,
} from "@lucams/db";
import { prisma } from "@/lib/db";

export const REVENUE_STATUSES: OrderStatus[] = ["PAID", "FULFILLING", "SHIPPED", "DELIVERED"];

/**
 * Filtro Prisma canónico de pedidos cuyo dinero YA entró a caja:
 *  - WOMPI: pago confirmado en línea (`PAID | FULFILLING | SHIPPED | DELIVERED`).
 *  - COD:   solo cuando el pedido ya fue entregado (`DELIVERED`).
 * Excluye siempre soft-deletes (`deletedAt: null`), `DRAFT`, `PENDING_PAYMENT`,
 * `CANCELLED` y `REFUNDED` (orden reembolsada completa).
 */
export const COLLECTED_REVENUE_ORDER_WHERE = {
  deletedAt: null,
  OR: [
    { paymentMethod: "WOMPI" as const, status: { in: REVENUE_STATUSES } },
    { paymentMethod: "COD" as const, status: "DELIVERED" as const },
  ],
};

export interface NetRevenueBreakdown {
  grossCollectedCents: number;
  codShortfallCents: number;
  retractRefundedCents: number;
  totalDeductionsCents: number;
  netCollectedCents: number;
}

/**
 * Conciliación pura del ingreso neto real en centavos COP (`[FIN-01]`):
 *  `Cobrado bruto (Wompi + COD entregado) − Reembolsos por retracto − Faltante COD`.
 */
export function computeNetCollectedRevenue(input: {
  wompiCollectedCents: number;
  codDeliveredCents: number;
  codShortfallCents: number;
  retractRefundedCents: number;
}): NetRevenueBreakdown {
  const grossCollectedCents = Math.max(
    0,
    Math.trunc(input.wompiCollectedCents) + Math.trunc(input.codDeliveredCents),
  );
  const codShortfallCents = Math.max(0, Math.trunc(input.codShortfallCents));
  const retractRefundedCents = Math.max(0, Math.trunc(input.retractRefundedCents));
  const totalDeductionsCents = codShortfallCents + retractRefundedCents;
  const netCollectedCents = Math.max(0, grossCollectedCents - totalDeductionsCents);
  return {
    grossCollectedCents,
    codShortfallCents,
    retractRefundedCents,
    totalDeductionsCents,
    netCollectedCents,
  };
}

export type FinanzasPeriod = "7d" | "30d" | "90d" | "mes";

export interface PeriodOption {
  key: FinanzasPeriod;
  label: string;
  // Granularidad de las barras: día para rangos cortos, semana para 90 días.
  bucket: "day" | "week";
}

export const FINANZAS_PERIODS: PeriodOption[] = [
  { key: "7d", label: "7 días", bucket: "day" },
  { key: "30d", label: "30 días", bucket: "day" },
  { key: "90d", label: "90 días", bucket: "week" },
  { key: "mes", label: "Este mes", bucket: "day" },
];

export const DEFAULT_PERIOD: FinanzasPeriod = "30d";

export function isFinanzasPeriod(value: string | undefined): value is FinanzasPeriod {
  return FINANZAS_PERIODS.some((p) => p.key === value);
}

/** Fila mínima que necesitan las agregaciones puras. */
export interface RevenueRow {
  total: number;
  paymentMethod: PaymentMethod;
  createdAt: Date;
}

export interface PeriodRange {
  from: Date;
  to: Date;
  previousFrom: Date;
  previousTo: Date;
  bucket: "day" | "week";
  /** Etiqueta de la ventana anterior para la comparativa ("los 30 días anteriores"). */
  previousLabel: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Ventana del período + ventana anterior comparable.
 * - Nd   → últimos N días (hoy incluido); anterior = los N días previos.
 * - mes  → del 1.º del mes a hoy; anterior = el mes calendario completo previo.
 */
export function resolvePeriodRange(key: FinanzasPeriod, now: Date): PeriodRange {
  if (key === "mes") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const previousFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return {
      from,
      to: now,
      previousFrom,
      previousTo: from,
      bucket: "day",
      previousLabel: "el mes anterior",
    };
  }
  const days = key === "7d" ? 7 : key === "30d" ? 30 : 90;
  const from = new Date(startOfDay(now).getTime() - (days - 1) * DAY_MS);
  return {
    from,
    to: now,
    previousFrom: new Date(from.getTime() - days * DAY_MS),
    previousTo: from,
    bucket: days <= 31 ? "day" : "week",
    previousLabel: `los ${days} días anteriores`,
  };
}

export interface RevenueBucket {
  /** Inicio del bucket (día o semana). */
  start: Date;
  /** "18 sep" — tooltip/título de la barra. */
  label: string;
  /** "18" (día) o "18/9" (semana) — etiqueta bajo la barra. */
  tickLabel: string;
  totalCents: number;
  count: number;
}

const fullLabelFmt = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short" });

/**
 * Reparte filas en buckets contiguos día/semana cubriendo [range.from, range.to],
 * con buckets vacíos en cero (los huecos importan: muestran días sin ventas).
 */
export function aggregateRevenueBuckets(rows: RevenueRow[], range: PeriodRange): RevenueBucket[] {
  const stepMs = range.bucket === "day" ? DAY_MS : 7 * DAY_MS;
  const first = startOfDay(range.from);
  const buckets: RevenueBucket[] = [];
  for (let t = first.getTime(); t <= range.to.getTime(); t += stepMs) {
    const start = new Date(t);
    buckets.push({
      start,
      label: fullLabelFmt.format(start),
      tickLabel:
        range.bucket === "day"
          ? String(start.getDate())
          : `${start.getDate()}/${start.getMonth() + 1}`,
      totalCents: 0,
      count: 0,
    });
  }
  for (const row of rows) {
    const idx = Math.floor((row.createdAt.getTime() - first.getTime()) / stepMs);
    // Filas fuera de la ventana (anteriores al from) se descartan, no se clampean:
    // meterlas en el primer bucket inflaría silenciosamente ese día/semana.
    const bucket = idx >= 0 && idx < buckets.length ? buckets[idx] : undefined;
    if (bucket) {
      bucket.totalCents += row.total;
      bucket.count += 1;
    }
  }
  return buckets;
}

export interface PaymentMethodAggregate {
  method: PaymentMethod;
  totalCents: number;
  count: number;
  /** Participación sobre el total de la ventana (0–100, redondeado). */
  pct: number;
}

/** Totales y participación por método de pago dentro de la ventana. */
export function aggregateByPaymentMethod(rows: RevenueRow[]): PaymentMethodAggregate[] {
  const grandTotal = rows.reduce((acc, r) => acc + r.total, 0);
  const byMethod = new Map<PaymentMethod, { totalCents: number; count: number }>();
  for (const row of rows) {
    const entry = byMethod.get(row.paymentMethod) ?? { totalCents: 0, count: 0 };
    entry.totalCents += row.total;
    entry.count += 1;
    byMethod.set(row.paymentMethod, entry);
  }
  return [...byMethod.entries()]
    .map(([method, agg]) => ({
      method,
      totalCents: agg.totalCents,
      count: agg.count,
      pct: grandTotal > 0 ? Math.round((agg.totalCents / grandTotal) * 100) : 0,
    }))
    .sort((a, b) => b.totalCents - a.totalCents);
}

/** Ticket promedio (AOV) en centavos; 0 si no hay pedidos. */
export function computeAov(rows: RevenueRow[]): number {
  if (rows.length === 0) return 0;
  return Math.round(rows.reduce((acc, r) => acc + r.total, 0) / rows.length);
}

/**
 * Variación porcentual vs período anterior; null si el anterior fue 0
 * (no hay base de comparación — la página muestra "sin comparativa").
 */
export function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export interface PeriodAggregates {
  range: PeriodRange;
  buckets: RevenueBucket[];
  byMethod: PaymentMethodAggregate[];
  totalCents: number;
  retractRefundedCents: number;
  netTotalCents: number;
  orderCount: number;
  aovCents: number;
  aovDeltaPct: number | null;
}

/**
 * Consulta ventana actual + anterior y agrega en memoria —
 * incluye deducción de retractos reembolsados en la ventana sobre órdenes que
 * permanecen en `COLLECTED_REVENUE_ORDER_WHERE` (sin doble resta si la orden pasó a REFUNDED).
 */
export async function getPeriodAggregates(period: FinanzasPeriod): Promise<PeriodAggregates> {
  const range = resolvePeriodRange(period, new Date());
  const [rows, retractAgg] = await Promise.all([
    prisma.order.findMany({
      where: {
        ...COLLECTED_REVENUE_ORDER_WHERE,
        createdAt: { gte: range.previousFrom, lte: range.to },
      },
      select: { total: true, paymentMethod: true, createdAt: true },
    }),
    prisma.retractRequest.aggregate({
      where: {
        status: "REFUNDED",
        refundedAt: { gte: range.from, lte: range.to },
        orderItem: { order: COLLECTED_REVENUE_ORDER_WHERE },
      },
      _sum: { refundAmount: true },
    }),
  ]);
  const current = rows.filter((r) => r.createdAt >= range.from);
  const previous = rows.filter((r) => r.createdAt < range.from);
  const totalCents = current.reduce((acc, r) => acc + r.total, 0);
  const retractRefundedCents = retractAgg._sum.refundAmount ?? 0;
  const aovCents = computeAov(current);
  return {
    range,
    buckets: aggregateRevenueBuckets(current, range),
    byMethod: aggregateByPaymentMethod(current),
    totalCents,
    retractRefundedCents,
    netTotalCents: Math.max(0, totalCents - retractRefundedCents),
    orderCount: current.length,
    aovCents,
    aovDeltaPct: pctChange(aovCents, computeAov(previous)),
  };
}

export interface AccountingOrderExportRow {
  number: string;
  createdAt: Date;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  subtotalCents: number;
  discountCents: number;
  loyaltyDiscountCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  retractRefundedCents: number;
  wompiReference: string | null;
  wompiTransactionId: string | null;
  codStatus: CodReconciliationStatus | "PENDING_REMITTANCE" | null;
  codRemittedCents: number | null;
  billingDocumentType: DocumentType | null;
  billingDocumentNumber: string | null;
  billingName: string | null;
  dianStatus: DianStatus;
  dianCufe: string | null;
  email: string;
}

/**
 * Escapa celdas CSV (RFC 4180) y neutraliza inyección de fórmulas en Excel/Sheets
 * (`=`, `+`, `-`, `@`, tab, CR se prefijan con comilla simple `'`).
 */
export function escapeAccountingCsvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function centsToCopCsvNumber(cents: number): string {
  const truncated = Math.trunc(cents);
  if (truncated % 100 === 0) return String(truncated / 100);
  return (truncated / 100).toFixed(2);
}

const ACCOUNTING_CSV_DATE = new Intl.DateTimeFormat("sv-SE", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  timeZone: "America/Bogota",
});

/**
 * Construye CSV contable (con UTF-8 BOM para Excel y saltos CRLF RFC 4180).
 * Pura: sin acceso a DB para testear invariantes de dinero y sanitización.
 */
export function buildAccountingOrdersCsv(rows: AccountingOrderExportRow[]): string {
  const header = [
    "numero_pedido",
    "fecha_bogota",
    "estado_pedido",
    "metodo_pago",
    "subtotal_cop",
    "descuento_cupon_cop",
    "descuento_puntos_cop",
    "envio_cop",
    "impuesto_cop",
    "total_bruto_cop",
    "reembolso_retracto_cop",
    "total_neto_cop",
    "referencia_wompi",
    "transaccion_wompi",
    "conciliacion_cod",
    "remesa_cod_cop",
    "tipo_doc_dian",
    "numero_doc_dian",
    "nombre_facturacion_dian",
    "estado_dian",
    "cufe_dian",
    "email_comprador",
  ].join(",");

  const lines = rows.map((row) => {
    const netCents = Math.max(0, row.totalCents - row.retractRefundedCents);
    return [
      escapeAccountingCsvCell(row.number),
      escapeAccountingCsvCell(ACCOUNTING_CSV_DATE.format(row.createdAt)),
      escapeAccountingCsvCell(row.status),
      escapeAccountingCsvCell(row.paymentMethod),
      centsToCopCsvNumber(row.subtotalCents),
      centsToCopCsvNumber(row.discountCents),
      centsToCopCsvNumber(row.loyaltyDiscountCents),
      centsToCopCsvNumber(row.shippingCents),
      centsToCopCsvNumber(row.taxCents),
      centsToCopCsvNumber(row.totalCents),
      centsToCopCsvNumber(row.retractRefundedCents),
      centsToCopCsvNumber(netCents),
      escapeAccountingCsvCell(row.wompiReference ?? ""),
      escapeAccountingCsvCell(row.wompiTransactionId ?? ""),
      escapeAccountingCsvCell(row.codStatus ?? ""),
      row.codRemittedCents !== null ? centsToCopCsvNumber(row.codRemittedCents) : "",
      escapeAccountingCsvCell(row.billingDocumentType ?? ""),
      escapeAccountingCsvCell(row.billingDocumentNumber ?? ""),
      escapeAccountingCsvCell(row.billingName ?? ""),
      escapeAccountingCsvCell(row.dianStatus),
      escapeAccountingCsvCell(row.dianCufe ?? ""),
      escapeAccountingCsvCell(row.email),
    ].join(",");
  });

  return "\uFEFF" + [header, ...lines].join("\r\n") + "\r\n";
}

/**
 * Lista órdenes cobradas en la ventana contable seleccionada para exportación CSV.
 */
export async function listCollectedOrdersForExport(
  period: FinanzasPeriod,
): Promise<AccountingOrderExportRow[]> {
  const range = resolvePeriodRange(period, new Date());
  const orders = await prisma.order.findMany({
    where: {
      ...COLLECTED_REVENUE_ORDER_WHERE,
      createdAt: { gte: range.from, lte: range.to },
    },
    orderBy: { createdAt: "desc" },
    select: {
      number: true,
      createdAt: true,
      status: true,
      paymentMethod: true,
      subtotal: true,
      discount: true,
      loyaltyDiscount: true,
      shipping: true,
      tax: true,
      total: true,
      wompiReference: true,
      wompiTransactionId: true,
      billingDocumentType: true,
      billingDocumentNumber: true,
      billingName: true,
      dianStatus: true,
      dianCufe: true,
      email: true,
      codReconciliation: {
        select: { status: true, remittedAmount: true },
      },
      items: {
        select: {
          retractRequest: {
            select: { status: true, refundAmount: true },
          },
        },
      },
    },
  });

  return orders.map((order) => {
    const retractRefundedCents = order.items.reduce((acc, item) => {
      if (item.retractRequest?.status === "REFUNDED") {
        return acc + (item.retractRequest.refundAmount ?? 0);
      }
      return acc;
    }, 0);

    const codStatus =
      order.paymentMethod === "COD"
        ? (order.codReconciliation?.status ?? "PENDING_REMITTANCE")
        : null;

    return {
      number: order.number,
      createdAt: order.createdAt,
      status: order.status,
      paymentMethod: order.paymentMethod,
      subtotalCents: order.subtotal,
      discountCents: order.discount,
      loyaltyDiscountCents: order.loyaltyDiscount,
      shippingCents: order.shipping,
      taxCents: order.tax,
      totalCents: order.total,
      retractRefundedCents,
      wompiReference: order.wompiReference,
      wompiTransactionId: order.wompiTransactionId,
      codStatus,
      codRemittedCents: order.codReconciliation?.remittedAmount ?? null,
      billingDocumentType: order.billingDocumentType,
      billingDocumentNumber: order.billingDocumentNumber,
      billingName: order.billingName,
      dianStatus: order.dianStatus,
      dianCufe: order.dianCufe,
      email: order.email,
    };
  });
}
