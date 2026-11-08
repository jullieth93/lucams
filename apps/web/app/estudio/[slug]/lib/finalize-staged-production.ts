/*
 * Finalize con snapshots de producción por STORAGE (auditoría 2026-11-08).
 *
 * Los editores de fichas (nombre y sets de letras) ya NO mandan las láminas
 * 300 DPI en el body del finalize: un set de N láminas PNG supera el techo
 * real de la plataforma (~4.5 MB por request de función) y moría con el 413
 * genérico. El camino es el handshake ADR-081 que ya existía para la Polaroid:
 *
 *   1. finalizeDesignAction SIN production_i → el servidor no puede renderizar
 *      fichas sin los PNG del cliente y responde NEEDS_CLIENT_SLOTS con
 *      tickets firmados al área de paso (production-assets/<designId>/_client/).
 *   2. PUT directo a Storage por ticket (sin techo de función, con retry).
 *   3. Reintento del finalize con useStagedSlots=1 → el servidor recoge,
 *      normaliza y persiste las láminas; el RenderJob las reemplaza después
 *      con el render por ficha (ADR-188).
 *
 * Compartido por name-editor y letter-set-editor. Módulo aparte porque importa
 * la Server Action (los lib/* puros se mantienen testeables sin servidor).
 */

import { finalizeDesignAction } from "@/features/personalization/actions";
import { uploadAllWithRetry, type StoragePutRequest } from "./upload-with-retry";

type FinalizeResult = Awaited<ReturnType<typeof finalizeDesignAction>>;

export async function finalizeWithStagedProduction(opts: {
  /** FormData FRESCO por intento (el FormData no es reutilizable entre requests). */
  buildForm: () => FormData;
  /** Láminas 300 DPI en orden posicional: slot i ↔ productionBlobs[i]. */
  productionBlobs: Blob[];
}): Promise<FinalizeResult> {
  let result = await finalizeDesignAction(opts.buildForm());
  if (result.ok || result.code !== "NEEDS_CLIENT_SLOTS") return result;

  const requests: StoragePutRequest[] = result.uploads.map(({ slotIndex, url }) => {
    const blob = opts.productionBlobs[slotIndex];
    if (!blob) throw new Error(`falta la lámina del slot ${slotIndex + 1}`);
    return { url, body: blob, contentType: blob.type || "image/png" };
  });
  // Un PUT fallido lanza: el caller (editor) lo traduce a su mensaje genérico
  // — mismo contrato que el fallback de la Polaroid en studio-editor.
  await uploadAllWithRetry(requests);

  const retry = opts.buildForm();
  retry.set("useStagedSlots", "1");
  result = await finalizeDesignAction(retry);
  return result;
}
