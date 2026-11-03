/*
 * Render de PRODUCCIÓN por FICHA para los sets de letras (Abecedario Completo /
 * Pack Vocales / Nombre Personalizado) — owner 2026-11-03.
 *
 * Antes: el Estudio dibujaba TODAS las fichas del set en UN solo canvas y subía
 * UNA lámina PNG por set (a ~180 DPI por ficha, con fondo crema y separaciones
 * de grilla) — imprenta recibía "1 lámina para recortar en N fichas". Ahora el
 * SERVIDOR renderiza UN PNG por ficha a 300 DPI reales y a la medida de corte de
 * la VARIANTE (sizeCm), como ya hacía el calendario con sus 12 meses
 * (renderCalendarMonthPagesCanvas). La lámina del cliente queda como FALLBACK
 * (si el render no es posible — fuente o imagen del tema ilegible — el job
 * cierra NEEDS_KONVA y las láminas subidas siguen vigentes, patrón ADR-131).
 *
 * El dibujo de la ficha es el MISMO módulo puro del editor/3D/preview admin
 * (letter-tile-draw.ts → drawLetterTile) sobre un lienzo BLANCO a sangre
 * (W3, owner 2026-11-03: PNG rectangular completo — el redondeo de esquinas lo
 * hace el troquel en el corte físico).
 *
 * Motores nativos LAZY (misma razón que production-render-canvas): un binario
 * faltante se convierte en RenderNeedsKonvaError → fallback a la lámina del
 * cliente, nunca tumba el finalize.
 */

import "server-only";
import path from "node:path";
import { RenderNeedsKonvaError } from "./production-render";
import { LETTER_TILE_RATIO, drawLetterTile, type LetterTileImage } from "./letter-tile-draw";

/** DPI de imprenta (misma densidad que el resto de la línea de producción). */
const PRODUCTION_DPI = 300;
const PX_PER_CM = PRODUCTION_DPI / 2.54;

// ── @napi-rs/canvas LAZY ────────────────────────────────────────────────────
type CanvasMod = typeof import("@napi-rs/canvas");
let _mod: CanvasMod | null = null;
async function loadCanvas(): Promise<CanvasMod> {
  if (_mod) return _mod;
  try {
    _mod = await import("@napi-rs/canvas");
    return _mod;
  } catch {
    throw new RenderNeedsKonvaError("@napi-rs/canvas no disponible en runtime");
  }
}

/** Fuentes del modo «Solo letra» (misma pila que drawLetterTile: Baloo 2 → Fredoka). */
let fontsReady: boolean | null = null;
function ensureTileFonts(mod: CanvasMod): boolean {
  if (fontsReady !== null) return fontsReady;
  try {
    const dir = path.join(process.cwd(), "assets", "fonts");
    fontsReady =
      mod.GlobalFonts.registerFromPath(path.join(dir, "Baloo2.ttf"), "Baloo 2") !== null &&
      mod.GlobalFonts.registerFromPath(path.join(dir, "Fredoka.ttf"), "Fredoka") !== null;
  } catch {
    fontsReady = false;
  }
  return fontsReady;
}

/** Parsea sizeCm "5×7" / "5x6.5" → cm (misma gramática que lib/photo-validation). */
export function parseTileSizeCm(sizeCm: unknown): { wCm: number; hCm: number } | null {
  if (typeof sizeCm !== "string") return null;
  const match = sizeCm.trim().match(/^(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)$/i);
  if (!match) return null;
  return { wCm: Number.parseFloat(match[1]!), hCm: Number.parseFloat(match[2]!) };
}

/**
 * Renderiza UNA ficha como PNG de imprenta (300 DPI, rectangular a sangre con
 * fondo blanco — W3). `tileImage` = bytes del dibujo del tema ya descargado
 * (null = «Solo letra»). `sizeCm` = medida de corte de la VARIANTE; sin ella
 * cae al aspecto histórico de la ficha (LETTER_TILE_RATIO, 5×6.5 cm).
 *
 * Lanza RenderNeedsKonvaError cuando no puede reproducir la ficha con fidelidad
 * (motor ausente, fuente sin registrar en modo solo-letra, imagen ilegible) —
 * el caller conserva la lámina del cliente.
 */
export async function renderLetterTileProduction(opts: {
  letter: string;
  color: string;
  withBorder: boolean;
  tileImage: Buffer | null;
  sizeCm: { wCm: number; hCm: number } | null;
}): Promise<Buffer> {
  const mod = await loadCanvas();
  const wCm = opts.sizeCm?.wCm ?? LETTER_TILE_RATIO.w;
  const hCm = opts.sizeCm?.hCm ?? LETTER_TILE_RATIO.h;
  const W = Math.max(1, Math.round(wCm * PX_PER_CM));
  const H = Math.max(1, Math.round(hCm * PX_PER_CM));

  let img: LetterTileImage | null = null;
  if (opts.tileImage) {
    try {
      img = (await mod.loadImage(opts.tileImage)) as unknown as LetterTileImage;
    } catch {
      throw new RenderNeedsKonvaError(`imagen del tema ilegible para la ficha ${opts.letter}`);
    }
    if (!img.width || !img.height) {
      throw new RenderNeedsKonvaError(`imagen del tema inválida para la ficha ${opts.letter}`);
    }
  } else if (!ensureTileFonts(mod)) {
    // «Solo letra» sin las fuentes de marca → la lámina del cliente es más fiel.
    throw new RenderNeedsKonvaError("fuentes de marca no disponibles para ficha solo-letra");
  }

  const canvas = mod.createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  // W3 (owner 2026-11-03): lienzo BLANCO a sangre — el PNG es rectangular
  // completo; el redondeo de esquinas lo hace el troquel en el corte físico.
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, W, H);
  drawLetterTile(
    ctx as unknown as CanvasRenderingContext2D,
    opts.letter,
    opts.color,
    img,
    W,
    H,
    opts.withBorder,
  );
  const png = canvas.toBuffer("image/png");

  // La densidad (DPI) la fija sharp: @napi-rs/canvas no escribe metadatos.
  const sharp = (await import("./sharp-safe")).default;
  return sharp(png).withMetadata({ density: PRODUCTION_DPI }).toBuffer();
}
