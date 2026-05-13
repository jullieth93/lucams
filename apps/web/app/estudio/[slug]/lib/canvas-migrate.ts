/*
 * Helpers de migración entre versiones de `canvasData` del Estudio.
 *
 * - `migrateCanvasV1ToV2(v1Data, slotCount)`:
 *      Convierte un canvasData V1 (M.3 legacy, 1 image-placeholder) en un
 *      MultiSlotCanvasData V2 (M.3.b, slot-por-imán). Idempotente: si recibe
 *      V2 directamente, lo retorna sin cambios (defensa contra doble-migra-
 *      ción si se llama por error).
 *
 * - `ensureCanvasV2(data, slotCount)`:
 *      Helper de uso común: dado un `CanvasData` cualquiera (V1 o V2),
 *      garantiza retornar siempre V2. Usado por el editor al cargar un
 *      Design existente.
 *
 * - `extractAssetFromV1(v1Data)`:
 *      Si el design V1 tenía un assetId/assetUrl en su image-placeholder,
 *      lo extrae para preservarlo en slots[0] del V2 resultante. Si no
 *      había foto (DRAFT vacío), retorna null.
 *
 * Pure functions, sin side-effects, testeables sin mocks.
 */

import type {
  CanvasData,
  CanvasDataV1,
  ImagePlaceholderLayer,
  MultiSlotCanvasData,
  SlotState,
} from "../types";
import { isCanvasV2 } from "../types";
import { generateGridLayout } from "./grid-layout";

/**
 * Migra V1 → V2. Idempotente.
 *
 * Reglas:
 *   1. Si recibe V2 (version === 2), lo retorna tal cual.
 *   2. El V1 completo pasa a ser `unitTemplate` del V2 — pero limpiando los
 *      assetId/assetUrl del image-placeholder porque en V2 viven en slots.
 *   3. `slotCount` se setea según el parámetro (típicamente
 *      `product.personalizationSchema.photoSlots`). Si no se provee, default
 *      a 1 (single-slot V2).
 *   4. `slots[0]` recibe el assetId/assetUrl original (si existían).
 *   5. `slots[1..N-1]` quedan vacíos (`assetId: null, assetUrl: null`).
 *   6. `gridLayout` se calcula automáticamente con `generateGridLayout()`.
 *
 * @example
 *   const v1: CanvasDataV1 = {
 *     version: 1, stage: { width: 1080, height: 1080 },
 *     layers: [
 *       { id: 'bg', type: 'background', color: '#FFF' },
 *       { id: 'p1', type: 'image-placeholder', x: 540, y: 540, width: 1000, height: 1000, assetId: 'a1', assetUrl: 'https://...' }
 *     ]
 *   };
 *   const v2 = migrateCanvasV1ToV2(v1, 6);
 *   // → v2.slotCount === 6
 *   // → v2.slots[0] === { slotIndex: 0, assetId: 'a1', assetUrl: 'https://...' }
 *   // → v2.slots[1..5] vacíos
 *   // → v2.gridLayout === { cols: 3, rows: 2, gap: 16 }
 *   // → v2.unitTemplate === v1 sin los assetId/assetUrl del image-placeholder
 */
export function migrateCanvasV1ToV2(
  data: CanvasData,
  slotCount: number = 1,
): MultiSlotCanvasData {
  // Idempotencia: si ya es V2, retornar sin tocar.
  if (isCanvasV2(data)) {
    return data;
  }

  const v1 = data as CanvasDataV1;

  // Extraer asset original del primer image-placeholder (si existe).
  const originalAsset = extractAssetFromV1(v1);

  // Limpiar assetId/assetUrl de los image-placeholders del unitTemplate.
  // En V2 esa info vive en slots[], no en layers.
  const cleanedUnitTemplate: CanvasDataV1 = {
    ...v1,
    layers: v1.layers.map((layer) => {
      if (layer.type === "image-placeholder") {
        const img = layer as ImagePlaceholderLayer;
        const cleaned: ImagePlaceholderLayer = {
          id: img.id,
          type: "image-placeholder",
          x: img.x,
          y: img.y,
          width: img.width,
          height: img.height,
        };
        if (img.cornerRadius !== undefined) cleaned.cornerRadius = img.cornerRadius;
        if (img.rotation !== undefined) cleaned.rotation = img.rotation;
        if (img.label !== undefined) cleaned.label = img.label;
        return cleaned;
      }
      return layer;
    }),
  };

  // Validar slotCount
  const validSlotCount = Math.max(1, Math.floor(slotCount));

  // Generar slots[]: el primero con el asset original (si lo había), resto vacíos.
  const slots: SlotState[] = Array.from({ length: validSlotCount }, (_, idx) => ({
    slotIndex: idx,
    assetId: idx === 0 && originalAsset ? originalAsset.assetId : null,
    assetUrl: idx === 0 && originalAsset ? originalAsset.assetUrl : null,
  }));

  // Calcular grid layout según slotCount + stage del unit
  const gridLayout = generateGridLayout(validSlotCount, v1.stage);

  return {
    version: 2,
    unitTemplate: cleanedUnitTemplate,
    slotCount: validSlotCount,
    slots,
    gridLayout,
  };
}

/**
 * Garantiza V2 — el helper más usado por el editor al cargar.
 *
 * Si `data` es ya V2, lo retorna. Si es V1, lo migra.
 *
 * @param slotCount  La cantidad de slots requerida por el producto. Si data
 *                   es V2 y su `slotCount` difiere del parámetro, prevalece
 *                   el de `data` (no rehacer slots existentes). Si data es
 *                   V1, se usa el parámetro para construir V2.
 */
export function ensureCanvasV2(data: CanvasData, slotCount: number): MultiSlotCanvasData {
  if (isCanvasV2(data)) {
    return data;
  }
  return migrateCanvasV1ToV2(data, slotCount);
}

/**
 * Extrae assetId/assetUrl del primer image-placeholder del V1 que los tenga.
 * null si no hay ninguno con foto cargada (DRAFT vacío).
 *
 * Para V1 con múltiples image-placeholders raros, solo extrae el primero —
 * los otros se pierden en la migración. Pero en la práctica los seeds V1 de
 * M.3 solo tienen 1 image-placeholder por template.
 */
export function extractAssetFromV1(v1: CanvasDataV1): { assetId: string; assetUrl: string } | null {
  for (const layer of v1.layers) {
    if (layer.type === "image-placeholder") {
      const img = layer as ImagePlaceholderLayer;
      if (img.assetId && img.assetUrl) {
        return { assetId: img.assetId, assetUrl: img.assetUrl };
      }
    }
  }
  return null;
}

/**
 * Helper inverso (no usado por el editor productivo, pero útil para
 * admin/debugging): tomar un V2 y "aplanar" a V1 para preview retro-compat.
 *
 * Inyecta el assetUrl del slot[0] en el primer image-placeholder del unit
 * template. Útil para generar el preview compositado del grid completo en
 * el server-side (Capa 6 — usando sharp para apilar N snapshots V1).
 */
export function flattenSlotToV1(v2: MultiSlotCanvasData, slotIndex: number): CanvasDataV1 {
  const slot = v2.slots[slotIndex];
  if (!slot) {
    throw new Error(`flattenSlotToV1: slotIndex ${slotIndex} out of range (slotCount=${v2.slotCount})`);
  }

  const flattened: CanvasDataV1 = {
    ...v2.unitTemplate,
    layers: v2.unitTemplate.layers.map((layer) => {
      if (layer.type === "image-placeholder" && slot.assetUrl) {
        const img = layer as ImagePlaceholderLayer;
        return {
          ...img,
          assetId: slot.assetId ?? undefined,
          assetUrl: slot.assetUrl,
        };
      }
      return layer;
    }),
  };

  return flattened;
}
