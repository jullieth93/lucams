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
 * slot destino; con par A/B (separadores 2 caras, imageUrlB) la cara B va a la
 * hermana del ancla, misma convención que el clic.
 *
 * Paridad Cara A/B (2026-10-05): con `facesPerUnit = 2` el ancla se resuelve
 * con resolveFaceAAnchor — un prediseñado con Cara A SIEMPRE cae en una cara A
 * (slot par de su unidad) y la B en su hermana, sin cruzar unidades (antes la
 * A iba al slot destino aunque fuera una cara B y la B cruzaba a la cara A de
 * la unidad siguiente). Regla de ancla: destino par → ese slot; destino impar
 * → la A de su par si está libre; si está ocupada, el siguiente par con la A
 * libre (hacia adelante, retomando desde el inicio); sin ninguna A libre la
 * aplicación falla ANTES de subir el asset (el caller muestra el error).
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

/**
 * Ancla de CARA A para aplicar un prediseñado (paridad 2026-10-05). Con 1 cara
 * o destino par el ancla es el propio destino. Con destino impar (cara B):
 * la A de su par si está libre (la B del diseño cae entonces exactamente donde
 * apuntó el usuario); si está ocupada, el siguiente par con la A libre buscando
 * hacia adelante y retomando desde el inicio. null = no queda ninguna cara A
 * libre (nunca se pisa contenido del usuario para abrir sitio).
 */
function resolveFaceAAnchor(
  slots: ReadonlyArray<{ slotIndex: number; assetUrl?: string | null }>,
  targetSlot: number,
  facesPerUnit: number | undefined,
): number | null {
  if (facesPerUnit !== 2 || targetSlot % 2 === 0) return targetSlot;
  const isFreeA = (slotIndex: number) => {
    const s = slots.find((sl) => sl.slotIndex === slotIndex);
    return !!s && !s.assetUrl;
  };
  if (isFreeA(targetSlot - 1)) return targetSlot - 1;
  const unitCount = Math.ceil(slots.length / 2);
  const startUnit = Math.floor(targetSlot / 2);
  for (let step = 1; step < unitCount; step++) {
    const a = ((startUnit + step) % unitCount) * 2;
    if (isFreeA(a)) return a;
  }
  return null;
}

export async function applyPredesignedToSlot(opts: {
  store: StoreApi<StudioStoreState>;
  item: PredesignedDragPayload;
  targetSlot: number;
  facesPerUnit?: number;
}): Promise<{ ok: true; bBlocked?: boolean } | { ok: false; message: string }> {
  const slots = opts.store.getState().canvasData?.slots ?? [];
  const anchor = resolveFaceAAnchor(slots, opts.targetSlot, opts.facesPerUnit);
  // Sin cara A libre no hay dónde anclar sin pisar contenido: se reporta y no
  // se sube nada al servidor.
  if (anchor === null) return { ok: false, message: "" };
  const resolved = await resolvePredesignedAssets(opts.store, opts.item.id);
  if (!resolved.ok) return { ok: false, message: resolved.message };
  const state = opts.store.getState();
  state.assignAssetToSlot(anchor, resolved.a);
  let bBlocked = false;
  if (resolved.b) {
    // Cara B a la hermana del ancla (convención separadores 2 caras: 2k/2k+1)
    // SOLO si está vacía — Paquete A: si está ocupada NO se pisa el contenido
    // del usuario ni se descarta en silencio: se reporta (bBlocked) para que
    // la UI avise. Slot inexistente (producto de 1 cara) = no aplica, sin aviso.
    const nextSlot = slots.find((s) => s.slotIndex === anchor + 1);
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
      facesPerUnit,
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
