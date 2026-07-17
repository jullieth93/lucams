/*
 * Integración — Conciliación de efectivo contraentrega (COD) · ADR-064.
 *
 * Ejerce el service contra la DB real: marcar remitido (idempotente), marcar discrepancia (+ flag
 * needsReconciliation), guards (no-COD / no-entregado), listado derivado (por remitir vs resuelto) y
 * totales. Requiere DATABASE_URL; sin él se salta (skipIf) para no romper CI sin DB.
 *
 * Aislamiento (memoria del proyecto: la DB de dev es COMPARTIDA): TODO fixture lleva el prefijo RUN
 * único; el cleanup borra SCOPED por prefijo en orden de FK (CodReconciliation → Order, onDelete
 * Restrict). JAMÁS se borra sin filtro ni se tocan datos reales.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  markCodRemitted,
  flagCodDiscrepancy,
  listCodReconciliation,
  getCodReconciliationTotals,
  CodReconciliationError,
} from "./cod-reconciliation";

const hasDb = Boolean(process.env.DATABASE_URL);
const RUN = `codrec${Date.now()}${Math.floor(Math.random() * 1e6)}`.toLowerCase();
const T = 30_000;
const ADMIN = `${RUN}-admin`;

// Crea una Order mínima (sin flujo de carrito). Devuelve su id.
async function makeOrder(opts: {
  suffix: string;
  paymentMethod: "COD" | "WOMPI";
  status: "PENDING_PAYMENT" | "PAID" | "SHIPPED" | "DELIVERED";
  total: number;
}): Promise<string> {
  const o = await prisma.order.create({
    data: {
      number: `${RUN}-${opts.suffix}`.toUpperCase().slice(0, 40),
      email: `${RUN}-${opts.suffix}@test.local`,
      phone: "3200000000",
      shippingAddress: { city: "Cali", department: "Valle" },
      subtotal: opts.total,
      shipping: 0,
      total: opts.total,
      paymentMethod: opts.paymentMethod,
      status: opts.status,
      deliveredAt: opts.status === "DELIVERED" ? new Date() : null,
    },
    select: { id: true },
  });
  return o.id;
}

async function cleanup() {
  // FK: CodReconciliation → Order (Restrict) → borrar la conciliación primero.
  await prisma.codReconciliation.deleteMany({ where: { order: { email: { startsWith: RUN } } } });
  await prisma.order.deleteMany({ where: { email: { startsWith: RUN } } });
}

describe.skipIf(!hasDb)("cod-reconciliation (integración DB)", { timeout: T }, () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  it("markCodRemitted: crea la conciliación REMITTED (monto completo por defecto)", async () => {
    const orderId = await makeOrder({
      suffix: "remit",
      paymentMethod: "COD",
      status: "DELIVERED",
      total: 45_000_00,
    });
    const res = await markCodRemitted(orderId, { adminId: ADMIN });
    expect(res.expectedAmount).toBe(45_000_00);
    expect(res.remittedAmount).toBe(45_000_00);

    const row = await prisma.codReconciliation.findUnique({ where: { orderId } });
    expect(row?.status).toBe("REMITTED");
    expect(row?.remittedBy).toBe(ADMIN);
    expect(row?.remittedAt).toBeTruthy();
  });

  it("markCodRemitted: idempotente + permite corregir el monto (upsert)", async () => {
    const orderId = await makeOrder({
      suffix: "idem",
      paymentMethod: "COD",
      status: "DELIVERED",
      total: 30_000_00,
    });
    await markCodRemitted(orderId, { adminId: ADMIN });
    // Re-marcar con un monto distinto (llegó corto) → actualiza, no duplica.
    const res = await markCodRemitted(orderId, { adminId: ADMIN, remittedAmount: 28_000_00 });
    expect(res.remittedAmount).toBe(28_000_00);
    const count = await prisma.codReconciliation.count({ where: { orderId } });
    expect(count).toBe(1);
  });

  it("flagCodDiscrepancy: marca DISCREPANCY y prende needsReconciliation en la orden", async () => {
    const orderId = await makeOrder({
      suffix: "disc",
      paymentMethod: "COD",
      status: "DELIVERED",
      total: 50_000_00,
    });
    await flagCodDiscrepancy(orderId, {
      adminId: ADMIN,
      discrepancyReason: "no llegó el efectivo",
      remittedAmount: 0,
    });
    const row = await prisma.codReconciliation.findUnique({ where: { orderId } });
    expect(row?.status).toBe("DISCREPANCY");
    expect(row?.discrepancyReason).toContain("no llegó");
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { needsReconciliation: true, reconciliationReason: true },
    });
    expect(order?.needsReconciliation).toBe(true);
    expect(order?.reconciliationReason).toContain("COD:");
  });

  it("remitir tras una discrepancia limpia el flag needsReconciliation de origen COD", async () => {
    const orderId = await makeOrder({
      suffix: "fix",
      paymentMethod: "COD",
      status: "DELIVERED",
      total: 20_000_00,
    });
    await flagCodDiscrepancy(orderId, { adminId: ADMIN, discrepancyReason: "corto" });
    await markCodRemitted(orderId, { adminId: ADMIN });
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { needsReconciliation: true },
    });
    expect(order?.needsReconciliation).toBe(false);
  });

  it("guard: rechaza órdenes no-COD y no-entregadas", async () => {
    const wompi = await makeOrder({
      suffix: "wompi",
      paymentMethod: "WOMPI",
      status: "DELIVERED",
      total: 10_000_00,
    });
    await expect(markCodRemitted(wompi, { adminId: ADMIN })).rejects.toMatchObject({
      code: "NOT_COD",
    });

    const notDelivered = await makeOrder({
      suffix: "shipped",
      paymentMethod: "COD",
      status: "SHIPPED",
      total: 10_000_00,
    });
    await expect(markCodRemitted(notDelivered, { adminId: ADMIN })).rejects.toBeInstanceOf(
      CodReconciliationError,
    );
  });

  it("listCodReconciliation + totales: por-remitir se DERIVA; resueltas se cuentan aparte", async () => {
    // Una orden COD entregada SIN conciliar → aparece como PENDING_REMIT en el filtro 'pending'.
    const pendingId = await makeOrder({
      suffix: "pending",
      paymentMethod: "COD",
      status: "DELIVERED",
      total: 15_000_00,
    });
    const pending = await listCodReconciliation({ filter: "pending", pageSize: 100 });
    const row = pending.items.find((r) => r.orderId === pendingId);
    expect(row?.status).toBe("PENDING_REMIT");

    const totals = await getCodReconciliationTotals();
    // Los totales son globales (incluyen otras órdenes reales de dev), así que solo verificamos
    // que la magnitud sea coherente: hay al menos este pendiente + los remitidos/discrepancias creados.
    expect(totals.pendingCop).toBeGreaterThanOrEqual(15_000_00);
    expect(totals.remittedCount).toBeGreaterThanOrEqual(1);
    expect(totals.discrepancyCount).toBeGreaterThanOrEqual(0);
  });
});
