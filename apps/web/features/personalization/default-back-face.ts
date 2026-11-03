/*
 * Cara B POR DEFECTO de los separadores de 2 caras (productos backOptional:
 * magnéticos 2×6/4×4.2 y alargados planos 4×12/4×15) — decisión owner
 * 2026-11-03: cuando el cliente no diseña la cara B, se imprime el PATRÓN DE
 * MARCA «Lucams» (wordmark script tileado en diagonal sobre blanco), ya no un
 * blanco puro. SUPERSEDE para estos productos la regla «cara B vacía = EN
 * BLANCO» (ADR-128, owner 2026-10-07); el blanco siguió vigente entre
 * 2026-10-07 y 2026-11-03.
 *
 * Lo que imprenta recibe es un PNG con las dimensiones y densidad (DPI)
 * EXACTAS de la cara A de su pareja, pintado con el patrón — así la tira
 * desplegada (composeFaceStrips) queda A | patrón con la geometría correcta
 * del corte (no un hueco ni un slot faltante).
 *
 * El MISMO dibujo (brand-back-pattern.ts, módulo puro) es el que muestran la
 * Vista Previa del Estudio (production-preview-render.ts) y el libro 3D
 * (book-view-3d.tsx) — una sola regla visual en los tres renders.
 *
 * El dibujo corre con @napi-rs/canvas (fuente script TTF vendorizada
 * registrada vía GlobalFonts — la misma línea que production-render-canvas).
 * sharp y @napi-rs/canvas son nativos: imports PEREZOSOS (ver la nota de
 * imports de service.ts) igual que los demás motores de render.
 */

import "server-only";
import path from "node:path";
import {
  BRAND_BACK_FONT_FAMILY,
  drawBrandBackFace,
  type BrandPatternContext2D,
} from "./brand-back-pattern";

/** DPI por defecto del PNG si la cara A de referencia no declara densidad. */
const PRODUCTION_DPI = 300;

// ── @napi-rs/canvas LAZY (mismo motivo que production-render-canvas: módulo
//    nativo — un binario faltante no debe tumbar rutas que nunca renderizan) ──
type CanvasMod = typeof import("@napi-rs/canvas");
let _mod: CanvasMod | null = null;
async function loadCanvas(): Promise<CanvasMod> {
  if (_mod) return _mod;
  _mod = await import("@napi-rs/canvas");
  return _mod;
}

/** Registra la fuente script del patrón (una vez por proceso). */
let fontReady: boolean | null = null;
function ensurePatternFont(mod: CanvasMod): boolean {
  if (fontReady !== null) return fontReady;
  try {
    // registerFromPath devuelve el FontKey registrado o null si falla.
    fontReady =
      mod.GlobalFonts.registerFromPath(
        path.join(process.cwd(), "assets", "fonts", "DancingScript.ttf"),
        BRAND_BACK_FONT_FAMILY,
      ) !== null;
  } catch {
    fontReady = false;
  }
  return fontReady;
}

/**
 * PNG con el patrón de marca «Lucams» (fondo blanco + wordmark tileado) con
 * las dimensiones y densidad (DPI) del buffer de referencia — la cara A de la
 * pareja. Es la cara B que imprenta imprime cuando el cliente no la diseñó.
 *
 * Si la fuente script no registra, el patrón sale con la fuente fallback del
 * motor (degradación aceptable: la geometría tiling se conserva) — NUNCA se
 * lanza por fuente: una cara B faltante rompería la tira entera.
 */
export async function defaultBackFacePng(reference: Buffer): Promise<Buffer> {
  const sharp = (await import("./sharp-safe")).default;
  const meta = await sharp(reference).metadata();
  if (!meta.width || !meta.height) {
    throw new Error("No se pudieron leer las dimensiones de la cara A para la B por defecto");
  }
  const mod = await loadCanvas();
  ensurePatternFont(mod);
  const canvas = mod.createCanvas(meta.width, meta.height);
  const ctx = canvas.getContext("2d");
  drawBrandBackFace(ctx as unknown as BrandPatternContext2D, meta.width, meta.height);
  const png = canvas.toBuffer("image/png");
  // La densidad (DPI) la fija sharp: @napi-rs/canvas no escribe metadatos.
  return sharp(png)
    .withMetadata({ density: meta.density ?? PRODUCTION_DPI })
    .toBuffer();
}

/**
 * Cara B opcional (backOptional, 2026-09-22; patrón de marca desde 2026-11-03):
 * expande un array de buffers que solo cubre los slots REQUERIDOS a uno con un
 * buffer por slot del canvas, generando la cara B por defecto (patrón «Lucams»
 * del tamaño/DPI de la cara A de su pareja, slot i−1) en cada cara B vacía
 * (2k+1). Sin caras B vacías es identidad.
 */
export async function expandMissingBackFaces(
  buffers: Buffer[],
  requiredSlotIndexes: number[],
  slotCount: number,
): Promise<Buffer[]> {
  if (requiredSlotIndexes.length === slotCount) return buffers;
  const byIndex = new Map(requiredSlotIndexes.map((slotIndex, k) => [slotIndex, buffers[k]!]));
  const out: Buffer[] = [];
  for (let i = 0; i < slotCount; i++) {
    const own = byIndex.get(i);
    if (own) {
      out.push(own);
      continue;
    }
    const faceA = byIndex.get(i - 1);
    if (!faceA) {
      // No debería: el guard de finalización exige TODAS las caras A.
      throw new Error(
        `INCOMPLETE_SLOTS: la cara B vacía del slot ${i + 1} no tiene su cara A de referencia`,
      );
    }
    out.push(await defaultBackFacePng(faceA));
  }
  return out;
}

/**
 * Sustituye, en un array COMPLETO de buffers por slot, las caras B vacías por
 * la cara por defecto (patrón «Lucams» del tamaño/DPI de su cara A, slot i−1).
 * Se usa tras el render server-side: el motor exige un asset por slot, así la
 * B vacía llega como una copia de trabajo de la A (ver canvasForRender en
 * finalizeDesign) que acá se descarta y se reemplaza por la cara real que
 * imprenta debe recibir.
 */
export async function fillEmptyBackFaces(
  buffers: Buffer[],
  emptyBackSlots: ReadonlySet<number>,
): Promise<Buffer[]> {
  if (emptyBackSlots.size === 0) return buffers;
  const out = buffers.slice();
  for (const i of emptyBackSlots) {
    const faceA = out[i - 1];
    if (!faceA) {
      throw new Error(
        `INCOMPLETE_SLOTS: la cara B vacía del slot ${i + 1} no tiene su cara A de referencia`,
      );
    }
    out[i] = await defaultBackFacePng(faceA);
  }
  return out;
}
