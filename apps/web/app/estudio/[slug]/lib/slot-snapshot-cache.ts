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
 *      tamaño DE SALIDA del snapshot (ver abajo) y document.fonts.status (un
 *      snapshot tomado antes de que cargue la fuente de una capa de texto no
 *      debe quedar pegado).
 *   2. yieldToMain — entre rasterizaciones el builder cede al event loop
 *      (scheduler.yield si existe, setTimeout 0 si no): el click responde y
 *      los frames largos se trocean aun con cache frío.
 *
 * Tamaño DE SALIDA fijo (fix STG 2026-10-05): el snapshot se rasterizaba a
 * pixelRatio 1 al tamaño DISPLAY del stage — con zoom de lienzo 2.5× o slots
 * desktop de ~600px salían PNG de 1500px de ancho que TODOS los consumidores
 * reducían de inmediato (celdas de 360px del preview compositado, caras de
 * 300px de separadores, texturas de 512px del 3D). Ahora el snapshot se toma
 * a un tamaño objetivo acorde al consumidor: SNAPSHOT_TARGET_WIDTH (720px =
 * 2× la celda de 360px del preview, nitidez retina; también cubre la cara de
 * 300 a ~2.4× y la textura de 512 a ~1.4×, sin upscale en ningún caso). Un
 * UNICO tamaño para todos los consumidores mantiene el cache compartido entre
 * Vista previa / 3D / galería (si cada uno pidiera su tamaño se invalidarían
 * entre sí). El pixelRatio resultante se topa a 2: con stages muy pequeños no
 * se rasteriza más allá de lo que el diseño puede aportar.
 * Consecuencia buscada: cambiar el ZOOM del lienzo ya NO invalida el cache —
 * la salida es idéntica (mismo diseño lógico al mismo tamaño de salida).
 *
 * Memoria: tope SLOT_SNAPSHOT_CACHE_LIMIT entradas con desalojo FIFO (los
 * dataURLs PNG de ~720px pesan ~0.5-1.5 MB c/u; 32 cubre el calendario de 20
 * slots con holgura y acota el peor caso).
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
  /** Tamaño DE SALIDA del snapshot rasterizado (no el tamaño display del stage). */
  outW: number;
  outH: number;
  fontsStatus: string;
  dataUrl: string;
  /**
   * true si al rasterizar el slot tenía assetUrl pero el stage AÚN no montaba el
   * nodo de la foto (`name="slot-photo"` — la rama "cargando" dibuja el placeholder
   * #F4ECFF). Una entrada así es PROVISIONAL: la carga de la imagen no cambia el
   * estado del store, así que la clave (referencia del slot) no se invalida sola
   * cuando la foto termina de decodificar — si se sirviera tal cual, el placeholder
   * lila quedaría horneado en previews/3D para siempre (bug STG 2026-10-08). En el
   * hit se re-valida: si el stage YA tiene la foto, la entrada se descarta y se
   * re-rasteriza.
   */
  photoPending: boolean;
};

export const SLOT_SNAPSHOT_CACHE_LIMIT = 32;

/**
 * Ancho objetivo del snapshot: 2× la celda de 360px del preview compositado
 * (retina). Todos los consumidores comparten este tamaño para no invalidar el
 * cache entre Vista previa / 3D / galería (ver doc del módulo).
 */
export const SNAPSHOT_TARGET_WIDTH = 720;

/** Tope del pixelRatio del raster (stages muy pequeños no se sobremuestrean). */
export const SNAPSHOT_MAX_PIXEL_RATIO = 2;

/**
 * pixelRatio y tamaño de salida para rasterizar un stage de `stageW`×`stageH`
 * al ancho objetivo. Puro — testeado.
 */
export function snapshotRasterPlan(
  stageW: number,
  stageH: number,
  targetWidth = SNAPSHOT_TARGET_WIDTH,
): { pixelRatio: number; outW: number; outH: number } {
  if (stageW <= 0 || stageH <= 0) return { pixelRatio: 1, outW: stageW, outH: stageH };
  const pixelRatio = Math.min(SNAPSHOT_MAX_PIXEL_RATIO, targetWidth / stageW);
  return {
    pixelRatio,
    outW: Math.round(stageW * pixelRatio),
    outH: Math.round(stageH * pixelRatio),
  };
}

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
 * El snapshot sale al ancho objetivo (`opts.targetWidth`, default
 * SNAPSHOT_TARGET_WIDTH), NO al tamaño display del stage — ver doc del módulo.
 */
export function snapshotSlotForPreview(
  stage: SnapshotStageSource,
  slot: SlotState,
  ctx: SnapshotRenderContext,
  opts?: { targetWidth?: number },
): string {
  const { pixelRatio, outW, outH } = snapshotRasterPlan(
    stage.width(),
    stage.height(),
    opts?.targetWidth,
  );
  const borderColor = ctx.borderColor ?? null;
  const fontsStatus = currentFontsStatus();
  // ¿El slot quiere foto pero el stage aún la está cargando? (rama placeholder —
  // ver CacheEntry.photoPending). El nodo `slot-photo` solo existe con la foto
  // ya decodificada y renderizada (studio-slot.tsx).
  const photoPending = !!slot.assetUrl && stage.find(".slot-photo").length === 0;

  const hit = cache.get(slot.slotIndex);
  if (
    hit &&
    hit.slot === slot &&
    hit.unitTemplate === ctx.unitTemplate &&
    hit.borderColor === borderColor &&
    hit.outW === outW &&
    hit.outH === outH &&
    hit.fontsStatus === fontsStatus &&
    // Auto-cura: una entrada rasterizada a medio cargar se desecha en cuanto el
    // stage ya muestra la foto (si sigue cargando, se sirve — re-rasterizar
    // produciría el mismo placeholder).
    !(hit.photoPending && !photoPending)
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
    dataUrl = stage.toDataURL({ pixelRatio, mimeType: "image/png" });
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
    outW,
    outH,
    fontsStatus,
    dataUrl,
    photoPending,
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
