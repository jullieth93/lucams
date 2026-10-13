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
 */

import type { CanvasDataV2, StudioAsset } from "../types";

export function remapCanvasAssetUrls(
  canvasData: CanvasDataV2,
  freshAssets: readonly StudioAsset[],
): { canvasData: CanvasDataV2; missingAssetIds: string[] } {
  const freshById = new Map(freshAssets.map((a) => [a.id, a.signedUrl]));
  const missing = new Set<string>();
  let changed = false;
  const slots = canvasData.slots.map((slot) => {
    let next = slot;
    if (slot.assetId) {
      const fresh = freshById.get(slot.assetId);
      if (fresh && fresh !== slot.assetUrl) {
        next = { ...next, assetUrl: fresh };
        changed = true;
      } else if (!fresh) {
        // El asset ya no está en el servidor: slot vacío (re-subida), no lila.
        next = { ...next, assetId: null, assetUrl: null };
        missing.add(slot.assetId);
        changed = true;
      }
    }
    if (slot.profileAssetId) {
      const fresh = freshById.get(slot.profileAssetId);
      if (fresh && fresh !== slot.profileAssetUrl) {
        next = { ...next, profileAssetUrl: fresh };
        changed = true;
      } else if (!fresh) {
        next = {
          ...next,
          profileAssetId: null,
          profileAssetUrl: undefined,
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
