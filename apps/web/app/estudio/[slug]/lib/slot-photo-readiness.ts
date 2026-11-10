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
 *
 * 2026-11-07 (bug owner — preview/3D sin fotos en CELULAR REAL): los
 * navegadores móviles DESCARTAN los bitmaps decodificados bajo presión de
 * memoria (Chrome Android conserva solo los bytes codificados). El lienzo en
 * pantalla sigue mostrando el último frame compuesto (las fotos "se ven
 * bien"), pero el snapshot RE-DIBUJA la escena desde cero (Konva
 * `_toKonvaCanvas` → drawScene) y un `drawImage` sobre una imagen descartada
 * no pinta NADA → texturas vacías (antes negras; con el relleno crema de
 * buildMagnetTextures, blancas). Por eso, tras la espera de nodos, se fuerza
 * `image.decode()` de cada foto presente: si el bitmap fue descartado, se
 * re-decodifica desde los bytes en cache ANTES de rasterizar. Best-effort con
 * techo global: una foto que no decodifica no cuelga el click.
 */

/**
 * Vista estructural mínima del stage para la espera (los tests la implementan
 * con un fake). Konva.Stage la satisface: su findOne retorna ChildNode |
 * undefined — lo que importa acá es la veracidad del nodo encontrado.
 */
export type SlotPhotoReadinessStage = { findOne(selector: string): unknown };

/** Nodo Konva mínimo con la imagen rasterizable (Konva.Image la expone). */
type MaybeImageNode = { image?: () => { decode?: () => Promise<void> } | null | undefined };

/** Techo del re-decode forzado (2026-11-07 — todas las fotos a la vez). */
const FORCE_DECODE_BUDGET_MS = 3000;

/**
 * 2026-11-10 (bug STG bola navideña 5× = 10 fotos en celular real) — el techo
 * FIJO de 3 s se agotaba con muchas fotos: el re-decode tras bitmap-discard de
 * Chrome Android se serializa en el decodificador del dispositivo (~200-500 ms
 * por foto en gama media) y al vencer el presupuesto el bake salía con caras
 * vacías. Ahora el presupuesto escala por foto con un piso y un tope.
 */
export const FORCE_DECODE_BUDGET_BASE_MS = 1500;
export const FORCE_DECODE_BUDGET_PER_PHOTO_MS = 700;
export const FORCE_DECODE_BUDGET_MAX_MS = 12000;

/** Presupuesto del re-decode forzado según fotos presentes (puro — testeado). */
export function forceDecodeBudgetMs(photoCount: number): number {
  if (!Number.isFinite(photoCount) || photoCount <= 0) return FORCE_DECODE_BUDGET_MS;
  return Math.min(
    FORCE_DECODE_BUDGET_MAX_MS,
    FORCE_DECODE_BUDGET_BASE_MS + FORCE_DECODE_BUDGET_PER_PHOTO_MS * photoCount,
  );
}

/** Fuerza `decode()` de la imagen de un nodo si existe (no-op defensivo). */
function decodeNodeImage(node: unknown): Promise<void> {
  const img = (node as MaybeImageNode | null | undefined)?.image?.();
  if (!img || typeof img.decode !== "function") return Promise.resolve();
  return img.decode().catch(() => {
    // Una foto rota no bloquea el snapshot: se rasteriza lo que haya.
  });
}

export async function waitForSlotPhotosReady(
  slots: readonly {
    slotIndex: number;
    assetUrl?: string | null;
    profileAssetUrl?: string | null;
  }[],
  stages: Map<number, SlotPhotoReadinessStage | null>,
  timeoutMs = 8000,
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
  if (pending()) {
    const deadline = performance.now() + timeoutMs;
    await new Promise<void>((resolve) => {
      const tick = () => {
        if (!pending() || performance.now() > deadline) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }
  // 2026-11-07 — re-decode forzado (ver header): en celulares reales el nodo
  // `.slot-photo` ya EXISTE pero su bitmap pudo ser descartado por presión de
  // memoria; sin este decode el snapshot re-dibuja y pinta vacío.
  const decodeJobs: Promise<void>[] = [];
  for (const s of slots) {
    const stage = stages.get(s.slotIndex);
    if (!stage) continue;
    if (s.assetUrl) decodeJobs.push(decodeNodeImage(stage.findOne(".slot-photo")));
    if (s.profileAssetUrl) decodeJobs.push(decodeNodeImage(stage.findOne(".slot-profile-photo")));
  }
  if (decodeJobs.length > 0) {
    // 2026-11-10 — presupuesto escalado por foto (antes 3 s fijos: con 10 fotos
    // de una bola 5× en celular se agotaba y el bake salía vacío).
    await Promise.race([
      Promise.all(decodeJobs),
      new Promise<void>((resolve) => setTimeout(resolve, forceDecodeBudgetMs(decodeJobs.length))),
    ]);
  }
}
