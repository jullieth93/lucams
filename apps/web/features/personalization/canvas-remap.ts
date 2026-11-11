/*
 * Remapeo PURO de assetId del canvasData (edición desde el carrito). Sin deps de servidor →
 * testeable sin cargar el service completo. Usado por cloneDesignForEdit.
 */

/**
 * Remapea recursivamente los `assetId` del canvasData usando un mapa old→new. No conoce el shape
 * exacto: reemplaza cualquier propiedad "assetId" (o "profileAssetId", Ola 17 — foto de perfil
 * por slot) con valor string presente en el mapa → cubre V2 (slots[].assetId y
 * slots[].profileAssetId) y V1 (assetId a nivel slot) sin acoplarse a la estructura. Devuelve una
 * COPIA (no muta el input).
 */
export function remapCanvasAssetIds(node: unknown, idMap: Map<string, string>): unknown {
  if (Array.isArray(node)) return node.map((n) => remapCanvasAssetIds(n, idMap));
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      out[k] =
        (k === "assetId" || k === "profileAssetId") && typeof v === "string" && idMap.has(v)
          ? idMap.get(v)
          : remapCanvasAssetIds(v, idMap);
    }
    return out;
  }
  return node;
}

/**
 * Extrae recursivamente todos los IDs de `DesignAsset` referenciados en un `canvasData`
 * (`assetId` y `profileAssetId` en V1 o V2), deduplicados y en orden de aparición.
 */
export function extractCanvasReferencedAssetIds(node: unknown): string[] {
  const seen = new Set<string>();
  const visit = (cur: unknown): void => {
    if (Array.isArray(cur)) {
      for (const item of cur) visit(item);
      return;
    }
    if (cur && typeof cur === "object") {
      for (const [k, v] of Object.entries(cur as Record<string, unknown>)) {
        if ((k === "assetId" || k === "profileAssetId") && typeof v === "string" && v.trim()) {
          seen.add(v);
        } else {
          visit(v);
        }
      }
    }
  };
  visit(node);
  return [...seen];
}
