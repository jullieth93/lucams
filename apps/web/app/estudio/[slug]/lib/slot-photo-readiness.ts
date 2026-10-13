/*
 * Espera de imágenes DECODIFICADAS antes de rasterizar stages Konva
 * (bug STG 2026-10-08 — texturas 3D / previews horneados con el placeholder
 * lila o en negro).
 *
 * El contador "N/N fotos" y `slot.assetUrl` se actualizan al terminar la
 * SUBIDA, pero el `<KonvaImage>` de la foto solo existe cuando el `useImage`
 * del slot resuelve (async: fetch + decode). Mientras tanto el stage dibuja
 * el placeholder `#F4ECFF` (lila pálido). Un snapshot tomado en esa ventana
 * hornea el placeholder en la textura — y peor: el cache de
 * `snapshotSlotForPreview` puede conservarlo, porque la carga de la imagen NO
 * cambia el estado del store (la referencia del slot —clave del cache— sigue
 * igual cuando la foto termina de decodificar).
 *
 * Los marcadores deterministas son los nodos `name="slot-photo"` (foto
 * principal) y `name="slot-profile-photo"` (avatar del header IG): las ramas
 * de carga renderizan el placeholder SIN esos nodos; con la imagen ya
 * decodificada el nodo siempre está (studio-slot.tsx). Se espera con rAF y un
 * deadline (best-effort, misma filosofía que ensureAllStagesMounted: si una
 * imagen falló de verdad, no colgamos el click — se rasteriza lo que haya).
 */

/**
 * Vista estructural mínima del stage para la espera (los tests la implementan
 * con un fake). Konva.Stage la satisface: su findOne retorna ChildNode |
 * undefined — lo que importa acá es la veracidad del nodo encontrado.
 */
export type SlotPhotoReadinessStage = { findOne(selector: string): unknown };

export async function waitForSlotPhotosReady(
  slots: readonly {
    slotIndex: number;
    assetUrl?: string | null;
    profileAssetUrl?: string | null;
  }[],
  stages: Map<number, SlotPhotoReadinessStage | null>,
  timeoutMs = 4000,
): Promise<void> {
  const pending = () =>
    slots.some((s) => {
      const stage = stages.get(s.slotIndex);
      // Stage aún no montado con foto asignada → pendiente (el caller ya forzó
      // el montaje con ensureAllStagesMounted; esto cubre el rezago de Konva).
      if (s.assetUrl && !stage?.findOne(".slot-photo")) return true;
      // Avatar IG: el stage existe pero la foto de perfil sigue decodificando.
      if (s.profileAssetUrl && stage && !stage.findOne(".slot-profile-photo")) return true;
      return false;
    });
  if (!pending()) return;
  const deadline = performance.now() + timeoutMs;
  await new Promise<void>((resolve) => {
    const tick = () => {
      if (!pending() || performance.now() > deadline) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
