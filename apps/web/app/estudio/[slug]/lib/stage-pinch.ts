/*
 * Fase 2 · item 2.1 (2026-10-07) — matemática del PINCH-TO-ZOOM del LIENZO
 * (stage) en dispositivos táctiles.
 *
 * Hoy el zoom del lienzo solo tiene botones (− / % / + / reset,
 * StudioStageZoomControl); el gesto de pellizco existía solo sobre la FOTO
 * (photoTransform, modal de edición). Acá el gesto de 2 dedos sobre el
 * contenedor del grid escala `stageZoom` (display-only — la exportación de
 * producción es inmune, ver studio-canvas-grid-size.ts) con ANCLAJE al punto
 * medio del gesto: el punto del contenido bajo los dedos queda fijo mientras
 * cambia la escala (misma idea que zoomPanTowardPoint del lightbox del
 * carrito, app/carrito/preview-zoom.ts, pero expresada como ratio de contenido
 * porque el zoom del stage se implementa REDIMENSIONANDO los slots —no con una
 * transform CSS— así que el anclaje se aplica corrigiendo el scroll tras el
 * re-render).
 *
 * DECISIÓN DE PAN (documentada, item 2.1): NO hay desplazamiento con 2 dedos.
 * El anclaje mantiene el punto del gesto estable y el pan se hace con UN dedo
 * por las vías nativas ya existentes: el wrapper del grid scrollea horizontal
 * cuando el zoom desborda el ancho (Ola 33) y la página scrollea vertical.
 * Un pan de 2 dedos competiría con el propio pinch (mismo gesto) y duplicaría
 * esas vías sin ganancia real.
 *
 * Módulo PURO → testeable sin DOM ni Konva.
 */

import { STAGE_ZOOM_MIN } from "../studio-canvas-grid-size";

/** Distancia euclídea entre los 2 dedos del gesto. */
export function pinchDistance(
  a: { clientX: number; clientY: number },
  b: { clientX: number; clientY: number },
): number {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

/** Punto medio del gesto (el ancla visual del zoom). */
export function pinchMidpoint(
  a: { clientX: number; clientY: number },
  b: { clientX: number; clientY: number },
): { clientX: number; clientY: number } {
  return { clientX: (a.clientX + b.clientX) / 2, clientY: (a.clientY + b.clientY) / 2 };
}

/**
 * Zoom resultante del gesto: escala al INICIO del gesto × ratio de distancia,
 * clampado a [STAGE_ZOOM_MIN, cap] (cap = tope de acercar del stage,
 * STAGE_ZOOM_MAX — misma regla de los botones). Distancia inicial inválida
 * (≤ 0, gesto degenerado) → el zoom no cambia.
 */
export function pinchStageZoom(
  initialZoom: number,
  initialDistance: number,
  currentDistance: number,
  cap: number,
): number {
  if (initialDistance <= 0) {
    return Math.max(STAGE_ZOOM_MIN, Math.min(cap, initialZoom));
  }
  const next = initialZoom * (currentDistance / initialDistance);
  return Math.max(STAGE_ZOOM_MIN, Math.min(cap, next));
}

/**
 * Ratio de contenido bajo el ancla en UN eje: fracción [0..1] del contenido
 * (scrollOffset + punto-de-ancla-relativo-al-viewport) / tamaño-del-contenido.
 * Con el ancla fuera del viewport se clampea al borde correspondiente.
 */
export function pinchAnchorRatio(
  scrollOffset: number,
  anchorPoint: number,
  contentSize: number,
): number {
  if (contentSize <= 0) return 0;
  const ratio = (scrollOffset + anchorPoint) / contentSize;
  return Math.max(0, Math.min(1, ratio));
}

/**
 * Scroll (en un eje) que deja el MISMO punto del contenido bajo el ancla tras
 * el zoom: con el contenido escalado a `contentSizeAfter`, el punto que estaba
 * en ratio·contentSizeBefore ahora está en ratio·contentSizeAfter; el scroll
 * compensa la diferencia para que vuelva a coincidir con `anchorPoint`.
 * Nunca negativo (sin scroll más allá del inicio del contenido).
 */
export function anchoredScrollOffset(
  ratio: number,
  anchorPoint: number,
  contentSizeAfter: number,
): number {
  return Math.max(0, ratio * contentSizeAfter - anchorPoint);
}
