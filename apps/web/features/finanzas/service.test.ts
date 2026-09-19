/*
 * Test puro de las agregaciones de features/finanzas/service.ts.
 *
 * Sin DB: las funciones reciben filas (RevenueRow) y el rango ya resuelto.
 * Lo que se fija acá es el criterio de la ventana (Nd vs mes), el relleno
 * de buckets vacíos (días sin ventas = barra en cero) y la matemática de
 * AOV / participación por método de pago.
 */

import { describe, expect, it } from "vitest";
import type { RevenueRow } from "./service";
import {
  aggregateByPaymentMethod,
  aggregateRevenueBuckets,
  computeAov,
  pctChange,
  resolvePeriodRange,
} from "./service";

const NOW = new Date(2026, 8, 18, 15, 30); // 18 sep 2026, 15:30 local

function row(total: number, createdAt: Date, paymentMethod: "WOMPI" | "COD" = "WOMPI"): RevenueRow {
  return { total, paymentMethod, createdAt };
}

describe("resolvePeriodRange", () => {
  it("7d arranca hace 6 días a las 00:00 (7 buckets incluyendo hoy)", () => {
    const range = resolvePeriodRange("7d", NOW);
    expect(range.from).toEqual(new Date(2026, 8, 12));
    expect(range.to).toBe(NOW);
    expect(range.bucket).toBe("day");
    // Ventana anterior: los 7 días previos, pegada a la actual.
    expect(range.previousTo).toEqual(range.from);
    expect(range.previousFrom).toEqual(new Date(2026, 8, 5));
  });

  it("90d usa buckets semanales", () => {
    expect(resolvePeriodRange("90d", NOW).bucket).toBe("week");
  });

  it("mes va del 1.º a hoy y el anterior es el mes calendario completo", () => {
    const range = resolvePeriodRange("mes", NOW);
    expect(range.from).toEqual(new Date(2026, 8, 1));
    expect(range.previousFrom).toEqual(new Date(2026, 7, 1));
    expect(range.previousTo).toEqual(new Date(2026, 8, 1));
  });
});

describe("aggregateRevenueBuckets", () => {
  it("suma por día y rellena con cero los días sin ventas", () => {
    const range = resolvePeriodRange("7d", NOW);
    const buckets = aggregateRevenueBuckets(
      [
        row(100_00, new Date(2026, 8, 12, 10)),
        row(50_00, new Date(2026, 8, 12, 20)),
        row(200_00, new Date(2026, 8, 18, 9)),
      ],
      range,
    );
    expect(buckets).toHaveLength(7);
    expect(buckets[0]).toMatchObject({ totalCents: 150_00, count: 2 });
    // Días intermedios sin ventas quedan presentes en cero.
    expect(buckets.slice(1, 6).every((b) => b.totalCents === 0 && b.count === 0)).toBe(true);
    expect(buckets[6]).toMatchObject({ totalCents: 200_00, count: 1 });
  });

  it("ignora filas fuera de la ventana (anteriores al from)", () => {
    const range = resolvePeriodRange("7d", NOW);
    const buckets = aggregateRevenueBuckets([row(999_00, new Date(2026, 8, 1))], range);
    expect(buckets.reduce((acc, b) => acc + b.totalCents, 0)).toBe(0);
  });

  it("90d produce buckets semanales contiguos (~13)", () => {
    const range = resolvePeriodRange("90d", NOW);
    const buckets = aggregateRevenueBuckets([], range);
    expect(buckets.length).toBeGreaterThanOrEqual(13);
    expect(buckets.length).toBeLessThanOrEqual(14);
    const first = buckets[0].start;
    expect(buckets[1].start.getTime() - first.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe("aggregateByPaymentMethod", () => {
  it("totales, conteos y porcentajes por método, ordenados por monto", () => {
    const aggs = aggregateByPaymentMethod([
      row(300_00, new Date(), "WOMPI"),
      row(100_00, new Date(), "COD"),
      row(100_00, new Date(), "COD"),
    ]);
    expect(aggs).toEqual([
      { method: "WOMPI", totalCents: 300_00, count: 1, pct: 60 },
      { method: "COD", totalCents: 200_00, count: 2, pct: 40 },
    ]);
  });

  it("sin filas devuelve lista vacía (la página muestra estado vacío)", () => {
    expect(aggregateByPaymentMethod([])).toEqual([]);
  });
});

describe("computeAov / pctChange", () => {
  it("AOV = promedio redondeado en centavos; 0 sin pedidos", () => {
    expect(computeAov([])).toBe(0);
    expect(computeAov([row(100_00, NOW), row(200_01, NOW)])).toBe(150_01);
  });

  it("pctChange calcula la variación y devuelve null sin base anterior", () => {
    expect(pctChange(110, 100)).toBe(10);
    expect(pctChange(90, 100)).toBe(-10);
    expect(pctChange(100, 0)).toBeNull();
  });
});
