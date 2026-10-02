/*
 * Paquete J (2026-10-02) — planificador del re-cache de filtros Konva.
 *
 * Problema (auditoría §E-4 candidato #3): ImagePlaceholder re-corre
 * node.cache({pixelRatio: 2}) — que re-aplica Brighten/Contrast/Grayscale/
 * HSL píxel a píxel — en CADA paso del wheel/pinch de zoom, porque el effect
 * depende de photoTransform.scale. Un gesto de zoom son decenas de pasos por
 * segundo → el main thread se satura dentro del propio gesto.
 *
 * Regla:
 *   - Cambió la IMAGEN o el PRESET (key distinta) → re-cache INMEDIATO: el
 *     bitmap cacheado es de otro contenido, no hay nada válido que estirar.
 *   - Misma key (solo cambió el zoom) → DEBOUNCE: Konva estira el cache
 *     anterior durante el gesto (su comportamiento estándar, calidad
 *     aceptable) y se re-cachea nítido UNA vez cuando el gesto termina.
 *
 * Es puro y sin DOM para testearlo con fake timers (filter-recache.test.ts).
 */

export const FILTER_RECACHE_DEBOUNCE_MS = 200;

export type FilterRecacher = {
  /**
   * `key` identifica (imagen, preset de filtro). `apply` ejecuta el
   * cache/clearCache + batchDraw sobre el nodo Konva.
   */
  request: (key: string, apply: () => void) => void;
  /** Cancela un re-cache pendiente (unmount del componente). */
  cancel: () => void;
};

export function createFilterRecacher(opts?: {
  debounceMs?: number;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
}): FilterRecacher {
  const debounceMs = opts?.debounceMs ?? FILTER_RECACHE_DEBOUNCE_MS;
  const setT = opts?.setTimeoutFn ?? setTimeout;
  const clearT = opts?.clearTimeoutFn ?? clearTimeout;
  let lastAppliedKey: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const cancelTimer = () => {
    if (timer !== null) {
      clearT(timer);
      timer = null;
    }
  };

  return {
    request(key, apply) {
      if (key !== lastAppliedKey) {
        cancelTimer();
        lastAppliedKey = key;
        apply();
        return;
      }
      cancelTimer();
      timer = setT(() => {
        timer = null;
        apply();
      }, debounceMs);
    },
    cancel() {
      cancelTimer();
    },
  };
}
