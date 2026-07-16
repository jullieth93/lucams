/*
 * Remapeo PURO de assetId del canvasData (edición desde el carrito). Sin deps de servidor →
 * testeable sin cargar el service completo. Usado por cloneDesignForEdit.
 */

/**
 * Remapea recursivamente los `assetId` del canvasData usando un mapa old→new. No conoce el shape
 * exacto: reemplaza cualquier propiedad "assetId" con valor string presente en el mapa → cubre V2
 * (slots[].assetId) y V1 (assetId a nivel slot) sin acoplarse a la estructura. Devuelve una COPIA
 * (no muta el input).
 */
export function remapCanvasAssetIds(node: unknown, idMap: Map<string, string>): unknown {
  if (Array.isArray(node)) return node.map((n) => remapCanvasAssetIds(n, idMap));
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      out[k] =
        k === "assetId" && typeof v === "string" && idMap.has(v)
          ? idMap.get(v)
          : remapCanvasAssetIds(v, idMap);
    }
    return out;
  }
  return node;
}
