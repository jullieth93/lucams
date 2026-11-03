/*
 * Dibujo PURO de la FICHA de letra (Abecedario / Vocales / Nombre) — extraído de
 * app/estudio/[slug]/lib/letter-tile-textures.ts (2026-11-03) para compartirlo con
 * el render de PRODUCCIÓN por ficha (letter-tile-render.ts, ADR nuevo: un PNG por
 * ficha para imprenta en vez de la lámina única por set).
 *
 * MISMO dibujo en las cuatro superficies: editor 2D (letter-set-editor), textura 3D
 * (letter-tile-textures/buildLetterTileTextures), preview admin de fichas
 * (components/admin/letter-set-preview) y ahora el PNG 300 DPI de imprenta.
 *
 * Módulo PURO a propósito (sin server-only, sin DOM, sin Prisma): dibuja sobre
 * cualquier ctx 2D — el DOM canvas del navegador y el @napi-rs/canvas del servidor
 * (patrón de calendar-draw.ts / brand-back-pattern.ts). La imagen de la ficha
 * ilustrada llega ya decodificada por el caller (HTMLImageElement en navegador,
 * Image de @napi-rs/canvas en server — estructuralmente compatibles).
 *
 * Geometría (fuente única, LETTER_TILE_CORNER_RATIO desde 2026-09-05): ficha
 * VERTICAL ~5×6.5 cm, radio de esquina 10 % del ancho, borde opcional (withBorder)
 * de color y la letra — o el dibujo del tema si el LetterTileSet trae imagen.
 *
 * NOTA de transparencia: la ficha se dibuja sobre el fondo que el CALLER haya
 * pintado — el 3D la quiere con esquinas TRANSPARENTES (silueta del extruido);
 * producción (W3, owner 2026-11-03) pinta primero el lienzo BLANCO completo
 * (PNG rectangular a sangre; el redondeo lo hace el corte físico).
 */

/** Aspecto físico de la ficha: vertical ~5×6.5 cm (espeja el preview `aspect-[5/6.5]`). */
export const LETTER_TILE_RATIO = { w: 5, h: 6.5 } as const;
export const LETTER_TILE_TEX_W = 300;
export const LETTER_TILE_TEX_H = Math.round(
  (LETTER_TILE_TEX_W * LETTER_TILE_RATIO.h) / LETTER_TILE_RATIO.w,
); // 390

/** Radio de esquina REDONDA de la ficha como fracción del ancho (textura y extruido 3D). */
export const LETTER_TILE_CORNER_RATIO = 0.1;

/** Color de respaldo si la paleta viene corta (morado de marca). */
export const LETTER_TILE_FALLBACK_COLOR = "#7C6AAD";

/**
 * Geometría de la ficha escalada al lienzo w×h. Misma estructura del tile de 120×154 del
 * compositor de lámina del editor (borde 6, inset 4, glifo a 60px) con el radio en 10% del
 * ancho (12px en 120) — mismo dibujo, otra escala.
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

/** Imagen decodificada de la ficha ilustrada (DOM Image o @napi-rs/canvas Image). */
export type LetterTileImage = { width: number; height: number };

/**
 * Dibuja UNA ficha en el ctx (lienzo w×h ya creado; el fondo lo define el caller —
 * transparente para el 3D, blanco a sangre para producción). Si `img` viene (dibujo
 * del tema), va contenida dentro del marco; si no, la letra en el color de la ficha.
 * `withBorder` = borde de color alrededor de la ficha (default true, el histórico);
 * sin borde, la ficha es blanca a ras y se recorta por el contorno redondeado.
 */
export function drawLetterTile(
  ctx: CanvasRenderingContext2D,
  ch: string,
  color: string,
  img: LetterTileImage | null,
  w = LETTER_TILE_TEX_W,
  h = LETTER_TILE_TEX_H,
  withBorder = true,
): void {
  const m = letterTileMetrics(w, h);
  roundRect(ctx, 0, 0, w, h, m.radius);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  if (withBorder) {
    ctx.lineWidth = m.borderWidth;
    ctx.strokeStyle = color;
    ctx.stroke();
  }
  if (img) {
    ctx.save();
    roundRect(ctx, m.inset, m.inset, w - 2 * m.inset, h - 2 * m.inset, m.radius - m.inset);
    ctx.clip();
    const s = Math.min((w - 3 * m.inset) / img.width, (h - 3 * m.inset) / img.height);
    ctx.drawImage(
      img as HTMLImageElement,
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
