/*
 * Modo "master para imprenta" del lienzo (ADR-166, 2026-10-22).
 *
 * El lienzo carga el DERIVADO ≤800px de cada foto (slot.canvasUrl) para
 * ahorrar red/decodificación en la edición diaria. Pero el fallback ADR-081
 * del finalize (diseños que ningún tier server-side reproduce — hoy el marco
 * SVG de la Polaroid) rasteriza los stages Konva a 3× como PNG de IMPRENTA:
 * componerlos desde el derivado degradaría la impresión a ~800px.
 *
 * Este módulo es el interruptor: mientras `runWithPrintMasters` corre, los
 * useImage de los slots (studio-slot.tsx) cargan el MASTER (slot.assetUrl)
 * en vez del derivado; al terminar vuelven al derivado. Secuencia:
 *
 *   1. Preload de los masters (fetch + decode del navegador) — la espera de
 *      React/useImage posterior es casi inmediata.
 *   2. Flag ON (useSyncExternalStore → re-render de los slots).
 *   3. Espera DETERMINISTA: cada nodo `slot-photo`/`slot-profile-photo` debe
 *      existir y su imagen debe ser la del master (src === assetUrl). No
 *      basta waitForSlotPhotosReady: el nodo del derivado ya estaba montado y
 *      resolvería la espera en la carrera contra el re-render.
 *   4. fn() (los toDataURL de imprenta) → flag OFF en finally.
 *
 * Best-effort como el resto de esperas de rasterizado (deadline, nunca
 * cuelga el click): si un master no carga, el snapshot sale con lo que haya —
 * igual que antes de este mecanismo cuando una imagen fallaba.
 */

import { useSyncExternalStore } from "react";

let printMasterMode = false;
const listeners = new Set<() => void>();

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function setPrintMasterMode(next: boolean): void {
  if (printMasterMode === next) return;
  printMasterMode = next;
  for (const fn of listeners) fn();
}

/** true mientras corre el snapshot de imprenta: los slots cargan el master. */
export function isPrintMasterMode(): boolean {
  return printMasterMode;
}

/** true mientras corre el snapshot de imprenta: los slots cargan el master. */
export function usePrintMasterMode(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => printMasterMode,
    () => false,
  );
}

/** Vista mínima del slot para la espera (compatible con SlotState). */
export type PrintMasterSlot = {
  slotIndex: number;
  assetUrl?: string | null;
  profileAssetUrl?: string | null;
};

/** Vista estructural mínima del stage (misma que slot-photo-readiness). */
export type PrintMasterStage = { findOne(selector: string): unknown };

function preloadImages(urls: readonly string[], timeoutMs: number): Promise<unknown> {
  return Promise.allSettled(
    urls.map(
      (url) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          const timer = setTimeout(() => resolve(), timeoutMs);
          img.onload = img.onerror = () => {
            clearTimeout(timer);
            resolve();
          };
          img.src = url;
        }),
    ),
  );
}

/** src de la imagen de un nodo Konva.Image (defensivo: cualquier nodo/falso). */
function nodeImageSrc(node: unknown): string | null {
  try {
    const img = (node as { image?: () => { src?: string } | undefined } | null)?.image?.();
    return typeof img?.src === "string" ? img.src : null;
  } catch {
    return null;
  }
}

/**
 * Espera a que TODOS los slots con foto muestren el MASTER decodificado en su
 * stage (no basta "hay nodo": debe ser la imagen del master). rAF + deadline,
 * mismo patrón que waitForSlotPhotosReady.
 */
export async function waitForMasterPhotosReady(
  slots: readonly PrintMasterSlot[],
  stages: Map<number, PrintMasterStage | null>,
  timeoutMs = 15000,
): Promise<void> {
  const pending = () =>
    slots.some((s) => {
      const stage = stages.get(s.slotIndex);
      if (s.assetUrl) {
        const node = stage?.findOne(".slot-photo");
        if (!node || nodeImageSrc(node) !== s.assetUrl) return true;
      }
      if (s.profileAssetUrl && stage) {
        const node = stage.findOne(".slot-profile-photo");
        if (!node || nodeImageSrc(node) !== s.profileAssetUrl) return true;
      }
      return false;
    });
  if (!pending()) return;
  const deadline = performance.now() + timeoutMs;
  await new Promise<void>((resolve) => {
    const tick = () => {
      if (!pending() || performance.now() > deadline) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/**
 * Corre `fn` (los snapshots de imprenta del finalize, ADR-081) con los stages
 * cargando los MASTERS de las fotos en vez de los derivados de lienzo.
 */
export async function runWithPrintMasters<T>(
  slots: readonly PrintMasterSlot[],
  stages: Map<number, PrintMasterStage | null>,
  fn: () => Promise<T>,
): Promise<T> {
  const masters = new Set<string>();
  for (const s of slots) {
    if (s.assetUrl) masters.add(s.assetUrl);
    if (s.profileAssetUrl) masters.add(s.profileAssetUrl);
  }
  await preloadImages([...masters], 15000);
  setPrintMasterMode(true);
  try {
    await waitForMasterPhotosReady(slots, stages);
    return await fn();
  } finally {
    setPrintMasterMode(false);
  }
}
