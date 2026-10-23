/*
 * Boot del recover (?designId= — «Editar» desde el carrito / Mis diseños) —
 * re-mapeo de URLs de assets del canvasData (2026-10-12).
 *
 * Causa raíz del "lila translúcido eterno": las signed URLs de
 * customer-uploads caducan a 1 h (lib/storage) y `saveCanvas` persiste
 * `slot.assetUrl` VERBATIM. Al re-abrir, la página refresca las URLs en
 * `initialDesignAssets` y el boot hidrata el array `assets[]` del store
 * (addAsset), pero NADA reescribía el `assetUrl` de los slots del canvasData
 * — y el render usa la del slot → URL vencida → placeholder lila infinito.
 *
 * Este helper es el punto ÚNICO de re-mapeo: se aplica al construir el estado
 * inicial del canvas (antes de store.init), por assetId, tanto a la foto
 * principal como a la foto de perfil IG. Un asset que YA NO EXISTE en el
 * servidor (borrado/purgado) deja su slot vacío — el cliente ve el estado
 * "sube tu foto" en vez del lila eterno, y el boot lo avisa con un toast.
 *
 * ADR-166 (2026-10-22) — también re-mapea `canvasUrl`/`profileCanvasUrl` (los
 * derivados ≤800px del lienzo): son signed URLs con el mismo TTL de 1 h. Un
 * asset sin derivado (canvasUrl null) deja el slot SIN canvasUrl → el lienzo
 * cae al master de assetUrl.
 */

import type { CanvasDataV2, StudioAsset } from "../types";

export function remapCanvasAssetUrls(
  canvasData: CanvasDataV2,
  freshAssets: readonly StudioAsset[],
): { canvasData: CanvasDataV2; missingAssetIds: string[] } {
  const freshById = new Map(freshAssets.map((a) => [a.id, a]));
  const missing = new Set<string>();
  let changed = false;
  const slots = canvasData.slots.map((slot) => {
    let next = slot;
    if (slot.assetId) {
      const fresh = freshById.get(slot.assetId);
      if (fresh) {
        if (fresh.signedUrl !== slot.assetUrl) {
          next = { ...next, assetUrl: fresh.signedUrl };
          changed = true;
        }
        const freshCanvas = fresh.canvasUrl ?? null;
        if (freshCanvas !== (slot.canvasUrl ?? null)) {
          next = { ...next, canvasUrl: freshCanvas };
          changed = true;
        }
      } else {
        // El asset ya no está en el servidor: slot vacío (re-subida), no lila.
        next = { ...next, assetId: null, assetUrl: null, canvasUrl: null };
        missing.add(slot.assetId);
        changed = true;
      }
    }
    if (slot.profileAssetId) {
      const fresh = freshById.get(slot.profileAssetId);
      if (fresh) {
        if (fresh.signedUrl !== slot.profileAssetUrl) {
          next = { ...next, profileAssetUrl: fresh.signedUrl };
          changed = true;
        }
        const freshProfileCanvas = fresh.canvasUrl ?? undefined;
        if (freshProfileCanvas !== slot.profileCanvasUrl) {
          next = { ...next, profileCanvasUrl: freshProfileCanvas };
          changed = true;
        }
      } else {
        next = {
          ...next,
          profileAssetId: null,
          profileAssetUrl: undefined,
          profileCanvasUrl: undefined,
          profileTransform: undefined,
        };
        missing.add(slot.profileAssetId);
        changed = true;
      }
    }
    return next;
  });
  if (!changed) return { canvasData, missingAssetIds: [] };
  return { canvasData: { ...canvasData, slots }, missingAssetIds: [...missing] };
}
