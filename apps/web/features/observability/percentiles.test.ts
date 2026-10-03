/*
 * Tests del cálculo de percentiles RUM (features/observability/percentiles.ts).
 * Vectores de referencia: PERCENTILE_CONT (Postgres) / PERCENTILE.INC (Excel) /
 * numpy.percentile(method="linear") — los tres comparten la interpolación
 * lineal rank = p·(n−1) que implementa el módulo.
 */

import { describe, expect, it } from "vitest";
import { computePercentiles, percentileCont } from "./percentiles";

describe("percentileCont", () => {
  it("devuelve null con array vacío (métrica sin muestras → '—', nunca 0 falso)", () => {
    expect(percentileCont([], 0.75)).toBeNull();
  });

  it("devuelve null con p fuera de [0, 1]", () => {
    expect(percentileCont([1, 2, 3], -0.1)).toBeNull();
    expect(percentileCont([1, 2, 3], 1.1)).toBeNull();
  });

  it("con un solo valor, todo percentil es ese valor", () => {
    expect(percentileCont([7], 0.5)).toBe(7);
    expect(percentileCont([7], 0.95)).toBe(7);
  });

  it("p0 = mínimo y p1 = máximo", () => {
    expect(percentileCont([10, 20, 30, 40], 0)).toBe(10);
    expect(percentileCont([10, 20, 30, 40], 1)).toBe(40);
  });

  it("mediana exacta con n impar; interpolada con n par", () => {
    expect(percentileCont([1, 2, 3, 4, 5], 0.5)).toBe(3);
    // n=4 → rank = 0.5·3 = 1.5 → entre 20 y 30
    expect(percentileCont([10, 20, 30, 40], 0.5)).toBe(25);
  });

  it("p75 interpola linealmente (rank = 0.75·(n−1))", () => {
    // [1,2,3,4,5]: rank = 3 → v[3] = 4 (coincide con PERCENTILE_CONT(0.75))
    expect(percentileCont([1, 2, 3, 4, 5], 0.75)).toBe(4);
    // [10,20,30,40]: rank = 2.25 → 30 + 0.25·(40−30) = 32.5
    expect(percentileCont([10, 20, 30, 40], 0.75)).toBe(32.5);
  });

  it("p95 se acerca al máximo sin salirse del rango", () => {
    // [1,2,3,4,5]: rank = 0.95·4 = 3.8 → 4 + 0.8·(5−4) = 4.8
    expect(percentileCont([1, 2, 3, 4, 5], 0.95)).toBeCloseTo(4.8, 10);
  });
});

describe("computePercentiles", () => {
  it("devuelve null sin valores", () => {
    expect(computePercentiles([])).toBeNull();
  });

  it("ordena una copia (no muta el input) y calcula p50/p75/p95", () => {
    const values = [5, 1, 4, 2, 3];
    const result = computePercentiles(values);
    expect(values).toEqual([5, 1, 4, 2, 3]); // input intacto
    expect(result).toEqual({ p50: 3, p75: 4, p95: 4.8 });
  });

  it("caso realista LCP: 20 muestras, la cola manda en p95", () => {
    // 19 muestras buenas (1000ms) + 1 pobre (9000ms): p50/p75 buenos, p95 salta.
    const values = [...Array(19).fill(1000), 9000];
    const result = computePercentiles(values);
    expect(result?.p50).toBe(1000);
    expect(result?.p75).toBe(1000);
    // rank = 0.95·19 = 18.05 → 1000 + 0.05·(9000−1000) = 1400
    expect(result?.p95).toBeCloseTo(1400, 6);
  });
});
