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
 */

import type { StoreApi } from "zustand";
import { assignPredesignedToDesignAction } from "@/features/personalization/actions";
import type { StudioStoreState } from "./store";
import type { StudioAsset } from "../types";
import type { PredesignedItem } from "../studio-asset-picker-modal";

/** MIME del drag HTML5 de un diseño prediseñado (sidebar → slot del lienzo). */
export const PREDESIGNED_DRAG_MIME = "application/lucams-predesigned";

/** Payload mínimo que viaja en el drag (la imagen la resuelve el servidor). */
export type PredesignedDragPayload = Pick<PredesignedItem, "id" | "name">;

export async function applyPredesignedToSlot(opts: {
  store: StoreApi<StudioStoreState>;
  item: PredesignedDragPayload;
  targetSlot: number;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const state = opts.store.getState();
  if (!state.designId) return { ok: false, message: "" }; // imposible tras boot; el caller pone el texto CMS
  const res = await assignPredesignedToDesignAction({
    designId: state.designId,
    galleryImageId: opts.item.id,
  });
  if (!res.ok) return { ok: false, message: res.message };
  const assetA: StudioAsset = {
    id: res.assetId,
    signedUrl: res.signedUrl,
    width: res.width,
    height: res.height,
  };
  state.addAsset(assetA);
  state.assignAssetToSlot(opts.targetSlot, assetA);
  if (res.assetB) {
    const assetB: StudioAsset = {
      id: res.assetB.assetId,
      signedUrl: res.assetB.signedUrl,
      width: res.assetB.width,
      height: res.assetB.height,
    };
    state.addAsset(assetB);
    // Cara B al slot siguiente vacío (convención separadores 2 caras: 2k/2k+1).
    const nextSlot = state.canvasData?.slots.find(
      (s) => s.slotIndex === opts.targetSlot + 1 && !s.assetUrl,
    );
    if (nextSlot) state.assignAssetToSlot(nextSlot.slotIndex, assetB);
  }
  return { ok: true };
}
