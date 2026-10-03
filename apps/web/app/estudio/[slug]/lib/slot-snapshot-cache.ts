/*
 * Paquete J (2026-10-02) — cache de snapshots Konva por slot + cedencia al
 * event loop.
 *
 * Problema (auditoría §E-4 candidato #2): "Vista previa", "3D" y la galería
 * de escenas rasterizan N stages con stage.toDataURL() (síncrono, ~decenas de
 * ms c/u en móvil) y decodifican N dataURLs SECUENCIALMENTE dentro del MISMO
 * click. Con 6-20 slots eso solo ya supera el budget de INP (<200 ms móvil),
 * y se repetía íntegro en cada click aunque nada hubiera cambiado.
 *
 * Solución en dos patas:
 *   1. snapshotSlotForPreview — cache por slotIndex. La invalidación es por
 *      REFERENCIA: el store del estudio es inmutable (cada update hace
 *      {...slot}), así que cualquier cambio de foto/encuadre/filtro/texto del
 *      slot produce un objeto SlotState NUEVO y el cache falla solo. Lo mismo
 *      con unitTemplate (aplicar plantilla lo reemplaza). Además entran en la
 *      clave: borderColor (estilo canvas-level que pinta la tarjeta), el
 *      tamaño en px del stage (cambia con el zoom de lienzo y con
 *      resize/whiteCardTray — toDataURL(pixelRatio:1) sale a ese tamaño) y
 *      document.fonts.status (un snapshot tomado antes de que cargue la
 *      fuente de una capa de texto no debe quedar pegado).
 *   2. yieldToMain — entre rasterizaciones el builder cede al event loop
 *      (scheduler.yield si existe, setTimeout 0 si no): el click responde y
 *      los frames largos se trocean aun con cache frío.
 *
 * Memoria: tope SLOT_SNAPSHOT_CACHE_LIMIT entradas con desalojo FIFO (los
 * dataURLs PNG de slots zoomados pueden pesar ~1-3 MB c/u; 32 cubre el
 * calendario de 20 slots con holgura y acota el peor caso).
 */

import type { CanvasDataV1, SlotState } from "../types";

/**
 * Vista estructural mínima de un Konva.Stage para el snapshot. Konva.Stage la
 * satisface tal cual; los tests la implementan con un fake sin canvas real.
 */
export type SnapshotStageSource = {
  width(): number;
  height(): number;
  find(selector: string): Array<{ hide(): void; show(): void }>;
  toDataURL(config: { pixelRatio: number; mimeType: string }): string;
};

export type SnapshotRenderContext = {
  /** Referencia — cambia al aplicar otra plantilla al diseño. */
  unitTemplate: CanvasDataV1;
  /** Estilo canvas-level que afecta el render del slot (tarjeta de color). */
  borderColor?: string | null;
};

type CacheEntry = {
  slot: SlotState;
  unitTemplate: CanvasDataV1;
  borderColor: string | null;
  stageW: number;
  stageH: number;
  fontsStatus: string;
  dataUrl: string;
};

export const SLOT_SNAPSHOT_CACHE_LIMIT = 32;

const cache = new Map<number, CacheEntry>();
// Contadores de diagnóstico (harness tmp/inp-audit y tests): permiten verificar
// que el cache PEGA en la práctica, no solo en unit tests.
let cacheHits = 0;
let cacheMisses = 0;

function currentFontsStatus(): string {
  if (typeof document === "undefined") return "loaded";
  return document.fonts?.status ?? "loaded";
}

/**
 * Devuelve el dataURL PNG del stage del slot, usando el cache si nada de lo
 * que afecta el render cambió desde la última rasterización. Los indicadores
 * de edición (.edit-indicator) se ocultan SOLO cuando se rasteriza de verdad.
 */
export function snapshotSlotForPreview(
  stage: SnapshotStageSource,
  slot: SlotState,
  ctx: SnapshotRenderContext,
): string {
  const stageW = stage.width();
  const stageH = stage.height();
  const borderColor = ctx.borderColor ?? null;
  const fontsStatus = currentFontsStatus();

  const hit = cache.get(slot.slotIndex);
  if (
    hit &&
    hit.slot === slot &&
    hit.unitTemplate === ctx.unitTemplate &&
    hit.borderColor === borderColor &&
    hit.stageW === stageW &&
    hit.stageH === stageH &&
    hit.fontsStatus === fontsStatus
  ) {
    // LRU liviano: refrescar la posición para que el desalojo FIFO saque lo
    // realmente más viejo.
    cache.delete(slot.slotIndex);
    cache.set(slot.slotIndex, hit);
    cacheHits++;
    return hit.dataUrl;
  }
  cacheMisses++;

  // H6 (auditoría v3): los indicadores de edición (recuadro punteado + dot)
  // nunca salen en previews/texturas — se ocultan durante la rasterización.
  const indicators = stage.find(".edit-indicator");
  indicators.forEach((l) => l.hide());
  let dataUrl: string;
  try {
    dataUrl = stage.toDataURL({ pixelRatio: 1, mimeType: "image/png" });
  } finally {
    indicators.forEach((l) => l.show());
  }

  if (cache.size >= SLOT_SNAPSHOT_CACHE_LIMIT && !cache.has(slot.slotIndex)) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(slot.slotIndex, {
    slot,
    unitTemplate: ctx.unitTemplate,
    borderColor,
    stageW,
    stageH,
    fontsStatus,
    dataUrl,
  });
  return dataUrl;
}

/** Vacía el cache (tests; el editor no lo necesita: la clave se auto-invalida). */
export function clearSlotSnapshotCache(): void {
  cache.clear();
  cacheHits = 0;
  cacheMisses = 0;
}

/** Entradas vivas — diagnóstico y tests. */
export function slotSnapshotCacheSize(): number {
  return cache.size;
}

/** Hits/misses acumulados desde el último clear — diagnóstico y tests. */
export function slotSnapshotCacheStats(): { hits: number; misses: number; size: number } {
  return { hits: cacheHits, misses: cacheMisses, size: cache.size };
}

// El harness de INP (tmp/inp-audit) lee estos contadores desde la página en dev.
if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
  (
    window as unknown as { __slotSnapshotCacheStats?: typeof slotSnapshotCacheStats }
  ).__slotSnapshotCacheStats = slotSnapshotCacheStats;
}

/**
 * Cede al event loop para trocear ráfagas de trabajo síncrono (N snapshots
 * con cache frío) en tareas < frame. scheduler.yield() conserva prioridad de
 * "continuación de interacción"; setTimeout 0 es el fallback universal.
 */
export function yieldToMain(): Promise<void> {
  const scheduler = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (scheduler?.yield) return scheduler.yield();
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}
