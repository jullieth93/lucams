/*
 * Texturas de las FICHAS DE LETRAS para la vista 3D del tablero memo (RoomBoardView3D
 * style="memo"): Abecedario Completo / Pack Vocales (abierta desde letter-set-editor con
 * "Ver en 3D") y el editor de NOMBRE (name-editor "Ver en un tablero 3D", ola 4 — un solo
 * path: antes el nombre dibujaba su propia textura sin cornerRadiusRatio y el extruido en
 * punta asomaba por la esquina transparente → "fichas en punta negra").
 *
 * El DIBUJO de la ficha vive en el módulo puro compartido
 * `@/features/personalization/letter-tile-draw` (re-exportado acá por compat):
 * MISMO dibujo que el preview 2D del editor, que este 3D y que el render de
 * producción por ficha (letter-tile-render.ts) — WYSIWYG en las cuatro superficies.
 *
 * La textura sale con transparencia fuera del roundRect → MagnetMesh extruye el cuerpo de la
 * ficha con esa silueta (shape "rectangle", MISMO radio que la textura vía cornerRadiusRatio).
 *
 * Estructura testeable:
 *  - `letterTileMetrics` y `drawLetterTile` son puras (módulo letter-tile-draw).
 *  - `buildLetterTileTextures` es el orquestador de navegador (carga imágenes del tema + canvas
 *    DOM) — queda cubierto por typecheck y por el uso real en el editor.
 */

import type { LetterTileMap } from "@/features/personalization/letter-tiles";
import type { Magnet3D } from "../fridge-3d-view";
import { loadCanvasImage } from "./canvas-image";
import {
  LETTER_TILE_CORNER_RATIO,
  LETTER_TILE_FALLBACK_COLOR,
  LETTER_TILE_RATIO,
  LETTER_TILE_TEX_H,
  LETTER_TILE_TEX_W,
  drawLetterTile,
} from "@/features/personalization/letter-tile-draw";

export {
  LETTER_TILE_RATIO,
  LETTER_TILE_TEX_W,
  LETTER_TILE_TEX_H,
  LETTER_TILE_CORNER_RATIO,
  LETTER_TILE_FALLBACK_COLOR,
  letterTileMetrics,
  drawLetterTile,
} from "@/features/personalization/letter-tile-draw";

function loadTileImage(url: string): Promise<HTMLImageElement | null> {
  // 2026-09-25 — la carga pasa por el optimizador de Next (mismo origen): las
  // URLs del bucket que no responden CORS al origen actual (bug STG: fichas
  // solo-letra en 3D) así cargan igual; fallback a la URL directa dentro.
  return loadCanvasImage(url);
}

/**
 * Una textura Magnet3D por ficha del set (letra o dibujo del tema), listas para RoomBoardView3D.
 * El canvas por ficha nace y muere acá (solo viaja el dataURL) — MagnetMesh clona y dispone su
 * textura GPU al desmontar la escena. `withBorder` fluye al dibujo de cada ficha (default true).
 */
export async function buildLetterTileTextures(
  letters: readonly string[],
  tiles: LetterTileMap,
  colors: readonly string[],
  withBorder = true,
): Promise<Magnet3D[]> {
  const imgs = await Promise.all(
    letters.map((ch) =>
      tiles[ch]?.imageUrl ? loadTileImage(tiles[ch]!.imageUrl) : Promise.resolve(null),
    ),
  );
  return letters.map((ch, i) => {
    const canvas = document.createElement("canvas");
    canvas.width = LETTER_TILE_TEX_W;
    canvas.height = LETTER_TILE_TEX_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No se pudo crear el contexto 2D para la ficha 3D");
    drawLetterTile(
      ctx,
      ch,
      colors[i % colors.length] ?? LETTER_TILE_FALLBACK_COLOR,
      imgs[i] ?? null,
      LETTER_TILE_TEX_W,
      LETTER_TILE_TEX_H,
      withBorder,
    );
    return {
      dataUrl: canvas.toDataURL("image/png"),
      wRatio: LETTER_TILE_RATIO.w,
      hRatio: LETTER_TILE_RATIO.h,
      shape: "rectangle" as const,
      // El extruido 3D redondea con el MISMO radio que la textura (esquinas redondas, ola 2C).
      cornerRadiusRatio: LETTER_TILE_CORNER_RATIO,
    };
  });
}
