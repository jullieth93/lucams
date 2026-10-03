/*
 * Aplicar un diseño PREDISEÑADO a un slot — lógica compartida (2026-09-22).
 *
 * Hasta ahora el prediseñado se aplicaba solo por CLIC (sidebar: slot
 * seleccionado o primer vacío; picker modal: el slot que la abrió). El QA de
 * STG pidió ARRASTRAR la tarjeta del diseño desde la lista del sidebar hasta
 * un slot del lienzo (HTML5 drag & drop, desktop — el picker es modal y cierra
 * al elegir, así que el drag vive en el panel del sidebar).
 *
 * Este helper es la ÚNICA vía de aplicación (clic y drop convergen): sube la
 * imagen de la galería como asset del diseño (server action) y la asigna al
 * slot destino; con par A/B (separadores 2 caras, imageUrlB) la cara B va al
 * slot siguiente vacío, misma convención que el clic.
 *
 * El MIME del drag viaja como constante para que el origen (sidebar) y el
 * destino (slot) no se desacoplen.
 *
 * Paquete A (2026-10-02):
 *  - DEDUPE: el mismo galleryImageId se sube UNA vez por sesión/diseño
 *    (cache del store, predesignedAssetsByGalleryId); aplicarlo a otro slot
 *    reusa el asset en vez de duplicarlo en el servidor.
 *  - CARA B OCUPADA: si el slot de la cara B ya tiene contenido NO se pisa;
 *    la B no se aplica y el caller lo informa (bBlocked → toast CMS). Regla:
 *    nunca descartar la B en silencio ni pisar contenido del usuario.
 *  - VARIEDAD (applyPredesignedVarietyToEmptySlots): llenar los slots vacíos
 *    recorre el catálogo en round-robin sin repetir diseño mientras haya
 *    variedad (bug: 20 slots con el mismo diseño).
 */

import type { StoreApi } from "zustand";
import { assignPredesignedToDesignAction } from "@/features/personalization/actions";
import type { StudioStoreState } from "./store";
import type { StudioAsset } from "../types";
import type { PredesignedItem } from "../studio-asset-picker-modal";
import { roundRobinPredesigned } from "./predesigned-variety";

/** MIME del drag HTML5 de un diseño prediseñado (sidebar → slot del lienzo). */
export const PREDESIGNED_DRAG_MIME = "application/lucams-predesigned";

/** Payload mínimo que viaja en el drag (la imagen la resuelve el servidor). */
export type PredesignedDragPayload = Pick<PredesignedItem, "id" | "name">;

/**
 * Resuelve los assets (A y, si hay, B) de un prediseñado: cache de sesión
 * primero; en miss, server action + registro en cache. No toca el canvas.
 */
async function resolvePredesignedAssets(
  store: StoreApi<StudioStoreState>,
  galleryImageId: string,
): Promise<{ ok: true; a: StudioAsset; b?: StudioAsset } | { ok: false; message: string }> {
  const state = store.getState();
  const cached = state.predesignedAssetsByGalleryId[galleryImageId];
  if (cached) return { ok: true, a: cached.a, b: cached.b };
  if (!state.designId) return { ok: false, message: "" }; // imposible tras boot; el caller pone el texto CMS
  const res = await assignPredesignedToDesignAction({
    designId: state.designId,
    galleryImageId,
  });
  if (!res.ok) return { ok: false, message: res.message };
  const a: StudioAsset = {
    id: res.assetId,
    signedUrl: res.signedUrl,
    width: res.width,
    height: res.height,
  };
  const b: StudioAsset | undefined = res.assetB
    ? {
        id: res.assetB.assetId,
        signedUrl: res.assetB.signedUrl,
        width: res.assetB.width,
        height: res.assetB.height,
      }
    : undefined;
  const after = store.getState();
  after.addAsset(a);
  if (b) after.addAsset(b);
  after.rememberPredesignedAssets(galleryImageId, b ? { a, b } : { a });
  return { ok: true, a, b };
}

export async function applyPredesignedToSlot(opts: {
  store: StoreApi<StudioStoreState>;
  item: PredesignedDragPayload;
  targetSlot: number;
}): Promise<{ ok: true; bBlocked?: boolean } | { ok: false; message: string }> {
  const resolved = await resolvePredesignedAssets(opts.store, opts.item.id);
  if (!resolved.ok) return { ok: false, message: resolved.message };
  const state = opts.store.getState();
  state.assignAssetToSlot(opts.targetSlot, resolved.a);
  let bBlocked = false;
  if (resolved.b) {
    // Cara B al slot siguiente (convención separadores 2 caras: 2k/2k+1) SOLO
    // si está vacío — Paquete A: si está ocupado NO se pisa el contenido del
    // usuario ni se descarta en silencio: se reporta (bBlocked) para que la UI
    // avise. Slot inexistente (producto de 1 cara o drop sobre una cara B) =
    // no aplica, sin aviso.
    const nextSlot = state.canvasData?.slots.find((s) => s.slotIndex === opts.targetSlot + 1);
    if (nextSlot) {
      if (!nextSlot.assetUrl) state.assignAssetToSlot(nextSlot.slotIndex, resolved.b);
      else bBlocked = true;
    }
  }
  return { ok: true, bBlocked };
}

/**
 * Paquete A — llena los slots vacíos con prediseñados VARIADOS (round-robin
 * sobre el catálogo del tag): nunca N slots con el mismo diseño habiendo
 * variedad; solo al agotarse el catálogo se repite desde el inicio. Con
 * `facesPerUnit = 2` los anchors son las caras A (slots pares) y cada diseño
 * con imageUrlB llena su cara B (si está libre — las ocupadas se respetan y
 * se cuentan en `bBlockedCount`). El offset de inicio deriva de los diseños
 * ya aplicados en la sesión: un segundo "llenar" continúa la variedad.
 * Secuencial a propósito (una server action a la vez; los diseños nuevos se
 * suben una sola vez vía dedupe).
 */
export async function applyPredesignedVarietyToEmptySlots(opts: {
  store: StoreApi<StudioStoreState>;
  items: readonly PredesignedItem[];
  facesPerUnit?: number;
}): Promise<{ applied: number; bBlockedCount: number; failed: boolean }> {
  const { store, items } = opts;
  const facesPerUnit = opts.facesPerUnit === 2 ? 2 : 1;
  const slots = store.getState().canvasData?.slots ?? [];
  const anchors = slots.filter((s) => !s.assetUrl && s.slotIndex % facesPerUnit === 0);
  const picked = roundRobinPredesigned(
    items,
    anchors.length,
    Object.keys(store.getState().predesignedAssetsByGalleryId).length,
  );
  let applied = 0;
  let bBlockedCount = 0;
  let failed = false;
  for (let i = 0; i < anchors.length; i++) {
    const item = picked[i];
    const slot = anchors[i]!;
    if (!item) break;
    const res = await applyPredesignedToSlot({
      store,
      item: { id: item.id, name: item.name },
      targetSlot: slot.slotIndex,
    });
    if (!res.ok) {
      failed = true;
      break; // un fallo de red/servidor no se repite N veces: se informa y se para
    }
    applied++;
    if (res.bBlocked) bBlockedCount++;
  }
  return { applied, bBlockedCount, failed };
}
