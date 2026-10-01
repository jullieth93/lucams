/*
 * Percentiles para Web Vitals RUM — función pura, sin I/O.
 *
 * Método: interpolación lineal sobre los valores ORDENADOS asc, idéntica a
 * PERCENTILE_CONT de Postgres y a PERCENTILE.INC de Excel (el estándar que
 * usan los dashboards de RUM):
 *     rank = p · (n − 1)
 *     resultado = v[⌊rank⌋] + (rank − ⌊rank⌋) · (v[⌈rank⌉] − v[⌊rank⌋])
 *
 * ¿Por qué en JS y no `percentile_cont` en SQL? La ventana es corta (7 días,
 * índice (name, route, createdAt)) y el volumen real de RUM de la tienda es
 * bajo (retención 35 días, backstop de /api/vitals acota el peor caso);
 * traer (route, name, value) y calcular acá deja UNA sola implementación —
 * testeable — en vez de duplicar la semántica en SQL. La página
 * /admin/performance acota el fetch con un tope de seguridad (ver
 * MAX_VITAL_ROWS allá).
 */

export type VitalPercentiles = { p50: number; p75: number; p95: number };

/**
 * Percentil p (0..1) por interpolación lineal (PERCENTILE_CONT).
 * `sortedAsc` DEBE venir ordenado ascendente (se documenta en vez de re-ordenar
 * acá para no pagar un sort por llamada en loops por ruta/métrica).
 * Devuelve null con array vacío o p fuera de [0, 1] (métrica sin muestras →
 * el caller muestra "—", nunca un 0 falso).
 */
export function percentileCont(sortedAsc: number[], p: number): number | null {
  const n = sortedAsc.length;
  if (n === 0 || p < 0 || p > 1) return null;
  if (n === 1) return sortedAsc[0];
  const rank = p * (n - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (rank - lo) * (sortedAsc[hi] - sortedAsc[lo]);
}

/**
 * p50/p75/p95 de un array de valores en cualquier orden (ordena una copia).
 * null si no hay valores. p75 es el estándar de evaluación de web.dev; p95
 * muestra la cola; p50 da contexto de la mediana.
 */
export function computePercentiles(values: number[]): VitalPercentiles | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p50: percentileCont(sorted, 0.5) as number,
    p75: percentileCont(sorted, 0.75) as number,
    p95: percentileCont(sorted, 0.95) as number,
  };
}
