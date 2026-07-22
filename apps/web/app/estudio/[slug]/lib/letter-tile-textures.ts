/*
 * Texturas de las FICHAS DE LETRAS (Abecedario Completo / Pack Vocales) para la vista 3D del
 * tablero memo (RoomBoardView3D style="memo", abierta desde letter-set-editor con "Ver en 3D").
 *
 * MISMO dibujo por ficha que el preview 2D del editor y que el compositor de producción
 * (renderLetterSetBlob en letter-set-editor): ficha VERTICAL 5:6.5 blanca (espeja el imán
 * físico rectangular), borde de color y la letra — o el dibujo del tema si el LetterTileSet
 * trae imagen. WYSIWYG: lo que el cliente configuró (tema + color por ficha) es lo que ve en 3D.
 *
 * La textura sale con transparencia fuera del roundRect → MagnetMesh extruye el cuerpo de la
 * ficha con esa silueta (shape "rectangle", MISMO radio que la textura vía cornerRadiusRatio).
 *
 * 2026-07-22 (ola 2C — foto SARA de Lucy: las fichas reales tienen esquinas REDONDAS):
 * el radio queda en ~10% del ancho Y —lo importante— el EXTRUIDO 3D usa el mismo ratio
 * (antes el mesh heredaba el radio por defecto 8/512 ≈ 1.6%: casi en punta, y la esquina
 * afilada del cuerpo asomaba por la esquina transparente de la textura → "terminadas en punta").
 * OJO: el compositor de producción (letter-set-editor) sigue en r=18/120 (15%); si se ajusta
 * allá, alinear LETTER_TILE_CORNER_RATIO al mismo valor (WYSIWYG).
 *
 * Estructura testeable:
 *  - `letterTileMetrics` y `drawLetterTile` son puras (dibujan sobre cualquier ctx 2D, incluido
 *    @napi-rs/canvas en tests de node).
 *  - `buildLetterTileTextures` es el orquestador de navegador (carga imágenes del tema + canvas
 *    DOM) — queda cubierto por typecheck y por el uso real en el editor.
 */

import type { LetterTileMap } from "@/features/personalization/letter-tiles";
import type { Magnet3D } from "../fridge-3d-view";

/** Aspecto físico de la ficha: vertical ~5×6.5 cm (espeja el preview `aspect-[5/6.5]`). */
export const LETTER_TILE_RATIO = { w: 5, h: 6.5 } as const;
export const LETTER_TILE_TEX_W = 300;
export const LETTER_TILE_TEX_H = Math.round(
  (LETTER_TILE_TEX_W * LETTER_TILE_RATIO.h) / LETTER_TILE_RATIO.w,
); // 390

/** Radio de esquina REDONDA de la ficha como fracción del ancho (textura y extruido 3D). */
export const LETTER_TILE_CORNER_RATIO = 0.1;

/** Color de respaldo si la paleta viene corta (morado de marca). */
const FALLBACK_COLOR = "#7C6AAD";

/**
 * Geometría de la ficha escalada al lienzo w×h. Misma estructura del tile de 120×154 del
 * compositor (borde 6, inset 4, glifo a 60px) con el radio en 10% del ancho (12px en 120) —
 * mismo dibujo, otra escala.
 */
export function letterTileMetrics(
  w: number,
  _h: number,
): {
  radius: number;
  borderWidth: number;
  inset: number;
  fontPx: number;
} {
  const u = w / 120;
  return {
    radius: LETTER_TILE_CORNER_RATIO * w,
    borderWidth: 6 * u,
    inset: 4 * u,
    fontPx: Math.round(60 * u),
  };
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Dibuja UNA ficha en el ctx (lienzo w×h ya creado, fondo transparente). Si `img` viene (dibujo
 * del tema), va contenida dentro del marco; si no, la letra en el color de la ficha.
 */
export function drawLetterTile(
  ctx: CanvasRenderingContext2D,
  ch: string,
  color: string,
  img: HTMLImageElement | null,
  w = LETTER_TILE_TEX_W,
  h = LETTER_TILE_TEX_H,
): void {
  const m = letterTileMetrics(w, h);
  roundRect(ctx, 0, 0, w, h, m.radius);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.lineWidth = m.borderWidth;
  ctx.strokeStyle = color;
  ctx.stroke();
  if (img) {
    ctx.save();
    roundRect(ctx, m.inset, m.inset, w - 2 * m.inset, h - 2 * m.inset, m.radius - m.inset);
    ctx.clip();
    const s = Math.min((w - 3 * m.inset) / img.width, (h - 3 * m.inset) / img.height);
    ctx.drawImage(
      img,
      (w - img.width * s) / 2,
      (h - img.height * s) / 2,
      img.width * s,
      img.height * s,
    );
    ctx.restore();
  } else {
    ctx.fillStyle = color;
    ctx.font = `800 ${m.fontPx}px "Baloo 2", "Fredoka", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(ch, w / 2, h / 2 + 2 * (w / 120));
  }
}

function loadTileImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * Una textura Magnet3D por ficha del set (letra o dibujo del tema), listas para RoomBoardView3D.
 * El canvas por ficha nace y muere acá (solo viaja el dataURL) — MagnetMesh clona y dispone su
 * textura GPU al desmontar la escena.
 */
export async function buildLetterTileTextures(
  letters: readonly string[],
  tiles: LetterTileMap,
  colors: readonly string[],
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
    drawLetterTile(ctx, ch, colors[i % colors.length] ?? FALLBACK_COLOR, imgs[i] ?? null);
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
