/*
 * Paquete C (2026-10-02) — avisos de calidad de las fotos que el diseño USA.
 *
 * collectQualityWarnings() cruza los assets subidos (store.assets, con el
 * resultado de la validación sharp server-side) contra los slots del canvas:
 * solo importan las fotos ASIGNADAS — una foto con aviso que el cliente subió
 * pero no usó no debe bloquear la compra ni aparecer en la Vista Previa.
 *
 * Lo consumen:
 *   - StudioPreviewModal (sección "Calidad de tus fotos" + checkbox de
 *     aceptación obligatorio).
 *   - El chip resumen del toolbar ("N por revisar" junto a «Vista previa»).
 *
 * qualityWarningsKey() devuelve un string primitivo para suscripción ATÓMICA
 * (patrón selectMissingSlotIndexesKey del store — evita re-renders en cascada
 * por referencias nuevas de array).
 */

import type { CanvasDataV2, StudioAsset, StudioQualityWarning } from "../types";

const WARNING_LEVELS = new Set(["warning-soft", "warning-strong", "error"]);

function toWarning(asset: StudioAsset): StudioQualityWarning | null {
  if (!asset.validationLevel || !WARNING_LEVELS.has(asset.validationLevel)) return null;
  return {
    assetId: asset.id,
    signedUrl: asset.signedUrl,
    level: asset.validationLevel as StudioQualityWarning["level"],
    message: asset.validationMessage,
    recommendation: asset.validationRecommendation,
  };
}

/**
 * Fotos con aviso de calidad ASIGNADAS a slots del diseño, en orden de slot
 * y sin repetir (una foto usada en 2 slots aparece una sola vez).
 */
export function collectQualityWarnings(
  assets: StudioAsset[],
  canvasData: CanvasDataV2 | null,
): StudioQualityWarning[] {
  if (!canvasData) return [];
  const byId = new Map(assets.map((a) => [a.id, a]));
  const seen = new Set<string>();
  const warnings: StudioQualityWarning[] = [];
  for (const slot of canvasData.slots) {
    if (!slot.assetId || seen.has(slot.assetId)) continue;
    seen.add(slot.assetId);
    const asset = byId.get(slot.assetId);
    if (!asset) continue;
    const warning = toWarning(asset);
    if (warning) warnings.push(warning);
  }
  return warnings;
}

/**
 * Clave primitiva de los avisos ("assetId:level,...") — suscripción atómica
 * en zustand sin re-render por referencias nuevas.
 */
export function qualityWarningsKey(assets: StudioAsset[], canvasData: CanvasDataV2 | null): string {
  return collectQualityWarnings(assets, canvasData)
    .map((w) => `${w.assetId}:${w.level}`)
    .join(",");
}
