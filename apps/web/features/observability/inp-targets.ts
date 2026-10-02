/*
 * Paquete J (2026-10-02) — INP p75 agrupado por ELEMENTO (WebVital.target).
 *
 * Desde 2026-09-18 el RUM propio persiste attribution.interactionTarget (el
 * selector CSS del elemento que produjo la interacción lenta). La tabla por
 * ruta de /admin/performance dice QUÉ página duele; esta tabla dice QUÉ
 * elemento — es el cierre del ciclo de medición de la auditoría §E-4 (los
 * sospechosos rankeados se confirman o descartan con esta vista, sin correr
 * el SQL de scripts/diag-stg/04-inp-webvitals.sql a mano).
 *
 * Función pura sobre las mismas filas crudas de la ventana (el fetch ya las
 * trae para la tabla por ruta — no es una query extra).
 */

import { computePercentiles, type VitalPercentiles } from "./percentiles";

export type InpTargetRow = {
  route: string;
  /** Selector CSS del elemento (WebVital.target). */
  target: string;
  samples: number;
  percentiles: VitalPercentiles;
  max: number;
};

/**
 * Agrupa filas (route, name, value, target) por (route, target) quedándose
 * solo con INP y calculando p50/p75/p95 + max. Mínimo `minSamples` muestras
 * por grupo (como el HAVING del SQL de diagnóstico: con 1-2 muestras el p75
 * no dice nada). Orden: peor p75 primero, tope `limit` filas.
 */
export function buildInpTargetTable(
  rows: Array<{ route: string; name: string; value: number; target: string | null }>,
  opts?: { minSamples?: number; limit?: number },
): InpTargetRow[] {
  const minSamples = opts?.minSamples ?? 3;
  const limit = opts?.limit ?? 15;

  const groups = new Map<string, { route: string; target: string; values: number[] }>();
  for (const r of rows) {
    if (r.name !== "INP" || !r.target) continue;
    const key = `${r.route}${r.target}`;
    let entry = groups.get(key);
    if (!entry) {
      entry = { route: r.route, target: r.target, values: [] };
      groups.set(key, entry);
    }
    entry.values.push(r.value);
  }

  const table: InpTargetRow[] = [];
  for (const entry of groups.values()) {
    if (entry.values.length < minSamples) continue;
    const percentiles = computePercentiles(entry.values);
    if (!percentiles) continue;
    table.push({
      route: entry.route,
      target: entry.target,
      samples: entry.values.length,
      percentiles,
      max: Math.max(...entry.values),
    });
  }
  return table
    .sort(
      (a, b) =>
        b.percentiles.p75 - a.percentiles.p75 ||
        a.route.localeCompare(b.route) ||
        a.target.localeCompare(b.target),
    )
    .slice(0, limit);
}
