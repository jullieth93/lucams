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

/**
 * Error tipado fail-closed ([STU-01], auditoría 2026-11): impide que un PNG 300 DPI
 * de imprenta se exporte con el placeholder lila `#F4ECFF` cuando una signed URL
 * maestra caducó (>1 h) o falló por red incluso tras el intento de auto-renovación.
 */
export class MasterPhotoLoadError extends Error {
  readonly failedUrls: readonly string[];

  constructor(
    failedUrls: readonly string[],
    message = "Necesitamos refrescar tus fotos en alta definición antes de enviarlas a taller. Toca «Reintentar ahora» — tu diseño y tus ajustes siguen guardados.",
  ) {
    super(message);
    this.name = "MasterPhotoLoadError";
    this.failedUrls = failedUrls;
  }
}

async function preloadImages(
  urls: readonly string[],
  timeoutMs: number,
): Promise<{ failedUrls: string[] }> {
  const failedUrls: string[] = [];
  await Promise.all(
    urls.map(
      (url) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          let settled = false;
          const finish = (ok: boolean) => {
            if (settled) return;
            settled = true;
            if (!ok) failedUrls.push(url);
            resolve();
          };
          const timer = setTimeout(() => finish(false), timeoutMs);
          img.onload = () => {
            clearTimeout(timer);
            finish(true);
          };
          img.onerror = () => {
            clearTimeout(timer);
            finish(false);
          };
          img.src = url;
        }),
    ),
  );
  return { failedUrls };
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

function collectPendingMasterUrls(
  slots: readonly PrintMasterSlot[],
  stages: Map<number, PrintMasterStage | null>,
): string[] {
  const missing: string[] = [];
  for (const s of slots) {
    const stage = stages.get(s.slotIndex);
    if (s.assetUrl) {
      const node = stage?.findOne(".slot-photo");
      if (!node || nodeImageSrc(node) !== s.assetUrl) missing.push(s.assetUrl);
    }
    if (s.profileAssetUrl) {
      const node = stage?.findOne(".slot-profile-photo");
      if (!node || nodeImageSrc(node) !== s.profileAssetUrl) missing.push(s.profileAssetUrl);
    }
  }
  return missing;
}

/**
 * Espera a que TODOS los slots con foto muestren el MASTER decodificado en su
 * stage (no basta "hay nodo": debe ser la imagen del master).
 * Con `opts.strict = true` (activo en `runWithPrintMasters`), lanza
 * `MasterPhotoLoadError` si al vencer el deadline algún slot sigue sin su master.
 */
export async function waitForMasterPhotosReady(
  slots: readonly PrintMasterSlot[],
  stages: Map<number, PrintMasterStage | null>,
  timeoutMs = 15000,
  opts?: { strict?: boolean },
): Promise<void> {
  if (collectPendingMasterUrls(slots, stages).length === 0) return;
  const deadline = performance.now() + timeoutMs;
  await new Promise<void>((resolve) => {
    const tick = () => {
      if (collectPendingMasterUrls(slots, stages).length === 0 || performance.now() > deadline) {
        resolve();
      } else {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  });
  if (opts?.strict) {
    const stillMissing = collectPendingMasterUrls(slots, stages);
    if (stillMissing.length > 0) {
      throw new MasterPhotoLoadError(stillMissing);
    }
  }
}

export type RunWithPrintMastersOptions = {
  /** Por defecto `true`: jamás permite exportar placeholders `#F4ECFF` a imprenta ([STU-01]). */
  strict?: boolean;
  /** Timeout de precarga/montaje por pasada (default 15 s). */
  timeoutMs?: number;
  /** Si la sesión lleva ≥40 min abierta, renueva proactivamente antes del primer intento. */
  forceRefreshFirst?: boolean;
  /** Callback que pide nuevas signed URLs al servidor, actualiza el store y devuelve los slots nuevos. */
  refreshMasters?: () => Promise<readonly PrintMasterSlot[] | null>;
};

function collectMasterUrlSet(slots: readonly PrintMasterSlot[]): string[] {
  const masters = new Set<string>();
  for (const s of slots) {
    if (s.assetUrl) masters.add(s.assetUrl);
    if (s.profileAssetUrl) masters.add(s.profileAssetUrl);
  }
  return [...masters];
}

/**
 * Corre `fn` (los snapshots de imprenta del finalize, ADR-081) con los stages
 * cargando los MASTERS de las fotos en vez de los derivados de lienzo.
 *
 * [STU-01]: Si la sesión superó el umbral preventivo o una URL firmada caducó
 * (>1 h), invoca `refreshMasters()` automáticamente una vez; si aun así alguna
 * foto maestra falla, aborta en modo fail-closed con `MasterPhotoLoadError`.
 */
export async function runWithPrintMasters<T>(
  slots: readonly PrintMasterSlot[],
  stages: Map<number, PrintMasterStage | null>,
  fn: () => Promise<T>,
  opts?: RunWithPrintMastersOptions,
): Promise<T> {
  const strict = opts?.strict !== false;
  const timeoutMs = opts?.timeoutMs ?? 15000;
  let activeSlots = slots;
  let refreshedAlready = false;

  if (opts?.forceRefreshFirst && opts.refreshMasters) {
    const refreshed = await opts.refreshMasters().catch(() => null);
    if (refreshed) {
      activeSlots = refreshed;
      refreshedAlready = true;
    }
  }

  let preload = await preloadImages(collectMasterUrlSet(activeSlots), timeoutMs);
  if (preload.failedUrls.length > 0 && !refreshedAlready && opts?.refreshMasters) {
    const refreshed = await opts.refreshMasters().catch(() => null);
    if (refreshed) {
      activeSlots = refreshed;
      refreshedAlready = true;
      preload = await preloadImages(collectMasterUrlSet(activeSlots), timeoutMs);
    }
  }

  if (strict && preload.failedUrls.length > 0) {
    throw new MasterPhotoLoadError(preload.failedUrls);
  }

  setPrintMasterMode(true);
  try {
    await waitForMasterPhotosReady(activeSlots, stages, timeoutMs, { strict });
    return await fn();
  } finally {
    setPrintMasterMode(false);
  }
}
