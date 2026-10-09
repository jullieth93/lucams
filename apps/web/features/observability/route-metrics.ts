/*
 * Paquete C (2026-10-09) — agregación por ruta de las métricas por pageview
 * LONGTASK y PAGEWEIGHT para /admin/performance.
 *
 * El reporter (components/web-vitals.tsx) emite UNA fila por pageview por
 * métrica: en LONGTASK value = duración total (ms) de long tasks y
 * delta = cantidad; en PAGEWEIGHT value = bytes transferidos y delta =
 * cantidad de recursos. Esta función agrupa por ruta: p50/p75/p95 del
 * value (misma función pura testeada de siempre) y promedio del delta
 * (cuántas long tasks / recursos por visita, en promedio).
 */

import { computePercentiles, type VitalPercentiles } from "./percentiles";

export type RouteMetricRow = {
  route: string;
  samples: number;
  percentiles: VitalPercentiles;
  /** Promedio de delta (long tasks o recursos por pageview). */
  avgCount: number;
};

/**
 * Agrupa filas (route, name, value, delta) por ruta quedándose solo con
 * `metricName`. Orden: peor p75 primero; desempate por ruta.
 */
export function buildRouteMetricTable(
  rows: Array<{ route: string; name: string; value: number; delta: number }>,
  metricName: string,
  opts?: { limit?: number },
): RouteMetricRow[] {
  const limit = opts?.limit ?? 25;

  const groups = new Map<string, { values: number[]; deltaSum: number }>();
  for (const r of rows) {
    if (r.name !== metricName) continue;
    let entry = groups.get(r.route);
    if (!entry) {
      entry = { values: [], deltaSum: 0 };
      groups.set(r.route, entry);
    }
    entry.values.push(r.value);
    entry.deltaSum += r.delta;
  }

  const table: RouteMetricRow[] = [];
  for (const [route, entry] of groups) {
    const percentiles = computePercentiles(entry.values);
    if (!percentiles) continue;
    table.push({
      route,
      samples: entry.values.length,
      percentiles,
      avgCount: entry.deltaSum / entry.values.length,
    });
  }
  return table
    .sort((a, b) => b.percentiles.p75 - a.percentiles.p75 || a.route.localeCompare(b.route))
    .slice(0, limit);
}
