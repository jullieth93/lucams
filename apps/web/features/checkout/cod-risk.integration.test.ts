/*
 * Integración — Anti-abuso COD (ADR-065). Ejerce assessCodRisk contra la DB real: caso permitido y
 * las 4 señales de bloqueo (velocidad, en-vuelo, cliente nuevo de alto valor, devolución previa).
 *
 * Requiere DATABASE_URL (skipIf). Aislamiento: cada identidad lleva el prefijo RUN; cleanup SCOPED
 * por prefijo. La identidad se comparte por-test (mismo phone/email) para que el historial matchee.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { assessCodRisk } from "./cod-risk";

const hasDb = Boolean(process.env.DATABASE_URL);
const RUN = `codrisk${Date.now()}${Math.floor(Math.random() * 1e6)}`.toLowerCase();
const T = 30_000;

type Mk = {
  ident: string; // sufijo de identidad (mismo → misma persona)
  paymentMethod?: "COD" | "WOMPI";
  status?: "PENDING_PAYMENT" | "PAID" | "SHIPPED" | "DELIVERED";
  total?: number;
  ageHours?: number; // antigüedad de createdAt (para separar velocidad de en-vuelo)
  returnedReason?: string;
};

async function makeOrder(m: Mk): Promise<string> {
  const createdAt = new Date(Date.now() - (m.ageHours ?? 0) * 3600 * 1000);
  const o = await prisma.order.create({
    data: {
      number: `${RUN}-${m.ident}-${Math.floor(Math.random() * 1e6)}`.toUpperCase().slice(0, 40),
      email: `${RUN}-${m.ident}@test.local`,
      phone: `${RUN}-${m.ident}`,
      shippingAddress: { city: "Cali", department: "Valle" },
      subtotal: m.total ?? 50_000_00,
      shipping: 0,
      total: m.total ?? 50_000_00,
      paymentMethod: m.paymentMethod ?? "COD",
      status: m.status ?? "PENDING_PAYMENT",
      createdAt,
      needsReconciliation: Boolean(m.returnedReason),
      reconciliationReason: m.returnedReason ?? null,
    },
    select: { id: true },
  });
  return o.id;
}

async function cleanup() {
  await prisma.order.deleteMany({ where: { email: { startsWith: RUN } } });
}

describe.skipIf(!hasDb)("assessCodRisk — anti-abuso COD (integración)", { timeout: T }, () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  it("permite un COD normal (identidad nueva, valor moderado, sin historial malo)", async () => {
    const id = await makeOrder({ ident: "ok", total: 60_000_00 });
    expect(await assessCodRisk(id)).toEqual({ allowed: true });
  });

  it("bloquea por VELOCIDAD (demasiados COD de la misma identidad en 24h)", async () => {
    // 3 COD recientes de la misma identidad + el actual = 4º → supera el tope (3).
    for (let i = 0; i < 3; i++) await makeOrder({ ident: "vel", ageHours: 1 });
    const current = await makeOrder({ ident: "vel" });
    const res = await assessCodRisk(current);
    expect(res.allowed).toBe(false);
    if (!res.allowed) expect(res.code).toBe("velocity");
  });

  it("bloquea por EN-VUELO (muchos COD confirmados sin entregar)", async () => {
    // 3 COD viejos (no cuentan a velocidad) pero SHIPPED (en vuelo) → supera el tope.
    for (let i = 0; i < 3; i++) await makeOrder({ ident: "out", status: "SHIPPED", ageHours: 100 });
    const current = await makeOrder({ ident: "out" });
    const res = await assessCodRisk(current);
    expect(res.allowed).toBe(false);
    if (!res.allowed) expect(res.code).toBe("outstanding");
  });

  it("bloquea a un CLIENTE NUEVO con un COD de alto valor (> tope)", async () => {
    const id = await makeOrder({ ident: "new", total: 40_000_00 * 10 }); // $400.000 > $300.000
    const res = await assessCodRisk(id);
    expect(res.allowed).toBe(false);
    if (!res.allowed) expect(res.code).toBe("new_high_value");
  });

  it("PERMITE un COD de alto valor a un cliente CON entrega previa (conocido)", async () => {
    await makeOrder({ ident: "known", status: "DELIVERED", paymentMethod: "WOMPI", ageHours: 200 });
    const id = await makeOrder({ ident: "known", total: 40_000_00 * 10 });
    expect(await assessCodRisk(id)).toEqual({ allowed: true });
  });

  it("bloquea si la identidad tuvo una DEVOLUCIÓN previa de un COD", async () => {
    await makeOrder({
      ident: "ret",
      status: "DELIVERED",
      ageHours: 100,
      returnedReason: "Envío DEVUELTO (novedad) — revisar stock y reembolso",
    });
    const id = await makeOrder({ ident: "ret" });
    const res = await assessCodRisk(id);
    expect(res.allowed).toBe(false);
    if (!res.allowed) expect(res.code).toBe("prior_return");
  });
});
