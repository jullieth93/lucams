/*
 * Unit — buildDailySummaryEmail: arma el email del resumen diario a partir de un
 * DailySummary. Determinista (sin DB). Cubre: subject con pedidos+ingresos, filas de
 * "necesitan atención" condicionales, caso "nada pendiente", y formato de pesos.
 */

import { describe, expect, it } from "vitest";
import { buildDailySummaryEmail, type DailySummary } from "./daily-summary";

const base: DailySummary = {
  windowHours: 24,
  ordersLast24h: 0,
  revenueLast24hCop: 0,
  codToCollectCop: 0,
  paidOrdersLast24h: 0,
  pendingPayment: 0,
  toShip: 0,
  lowStock: 0,
  pendingReviews: 0,
  abandonedCarts24h: 0,
  recoveredCarts24h: 0,
  errors24h: 0,
  topErrorRoute: null,
  needsReconciliation: 0,
};

// Fecha fija para asertar el label sin depender del reloj.
const NOW = new Date("2026-07-11T13:30:00Z"); // 8:30am Bogotá

describe("buildDailySummaryEmail", () => {
  it("subject resume pedidos + ingresos (centavos → pesos)", () => {
    const { subject } = buildDailySummaryEmail(
      { ...base, ordersLast24h: 3, revenueLast24hCop: 16500000 },
      NOW,
    );
    expect(subject).toContain("3 pedido");
    expect(subject).toContain("$165.000"); // 16.500.000 centavos → $165.000
  });

  it("lista SOLO las filas de atención que aplican, con la acción", () => {
    const { html, text } = buildDailySummaryEmail(
      {
        ...base,
        needsReconciliation: 2,
        toShip: 4,
        pendingReviews: 1,
        lowStock: 3,
        errors24h: 7,
        topErrorRoute: "/checkout/envio",
      },
      NOW,
    );
    expect(html).toContain("2</strong> orden(es) necesitan reconciliación");
    expect(html).toContain("4</strong> pagada(s) por despachar");
    expect(html).toContain("1</strong> reseña(s) por aprobar");
    expect(html).toContain("3</strong> variante(s) con stock bajo");
    expect(html).toContain("7</strong> error(es) del servidor");
    expect(html).toContain("/checkout/envio");
    expect(text).toContain("2 orden(es) a reconciliar");
  });

  it("cuando NO hay nada pendiente, muestra el mensaje verde", () => {
    const { html } = buildDailySummaryEmail(
      { ...base, ordersLast24h: 5, revenueLast24hCop: 25000000 },
      NOW,
    );
    expect(html).toContain("Nada pendiente de atención");
    expect(html).not.toContain("necesitan reconciliación");
  });

  it("calcula el % de recuperación de carritos", () => {
    const { html } = buildDailySummaryEmail(
      { ...base, abandonedCarts24h: 4, recoveredCarts24h: 1 },
      NOW,
    );
    expect(html).toContain("25% rec."); // 1/4
  });

  it("no rompe con 0 carritos abandonados (sin división por cero)", () => {
    const { html } = buildDailySummaryEmail({ ...base }, NOW);
    expect(html).toContain("Carritos abandon.");
    expect(html).not.toContain("NaN");
  });

  it("muestra 'COD por cobrar' aparte, sin mezclarlo con Ingresos", () => {
    const { html, text } = buildDailySummaryEmail(
      { ...base, revenueLast24hCop: 5000000, codToCollectCop: 9000000 },
      NOW,
    );
    // Ingresos = solo lo cobrado ($50.000), NO incluye el COD por cobrar ($90.000).
    expect(html).toContain("$50.000");
    expect(html).toContain("por cobrar");
    expect(html).toContain("$90.000");
    expect(text).toContain("COD por cobrar (al entregar): $90.000");
  });

  it("sin COD por cobrar, no muestra esa línea", () => {
    const { html } = buildDailySummaryEmail({ ...base, revenueLast24hCop: 5000000 }, NOW);
    expect(html).not.toContain("por cobrar");
  });
});
