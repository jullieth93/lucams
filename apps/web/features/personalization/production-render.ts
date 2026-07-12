/*
 * ADR-057 Fase A1a — Render de PRODUCCIÓN en el servidor (packs solo-foto), con sharp.
 *
 * Reconstruye el PNG de impresión de cada slot a partir del `canvasData` (fuente de verdad:
 * geometría del placeholder + `photoTransform` del usuario + `filter`), en vez de confiar en
 * el PNG que rasteriza el celular del cliente. Replica EXACTO la matemática de Konva del editor
 * (studio-slot.tsx `ImagePlaceholder`): cover-scale, escala del usuario acotada a [0.5,3], offset
 * directo, clip al rect del placeholder. Para heart/circle la foto cubre TODO el stage
 * (`useFullStage`), igual que el editor.
 *
 * Archivo LIMPIO para imprenta: NO hornea los adornos de realismo (sombra/glossy/borde) que el
 * editor sí dibuja en el preview; la forma final (círculo/corazón) la troquela la imprenta.
 *
 * Alcance A1a: solo plantillas de FOTO (background + image-placeholder). Si el unitTemplate trae
 * capas de texto/marco con contenido (Polaroid, marcos), este módulo lanza NEEDS_KONVA y el caller
 * conserva el PNG del cliente hasta la Fase A1b (Konva-on-node).
 */

import "server-only";
import sharp from "sharp";
import { FILTER_PRESETS } from "@/app/estudio/[slug]/lib/photo-filters";
import type { PhotoFilterPreset } from "@/app/estudio/[slug]/types";

/** Escala de salida = pixelRatio del cliente (stage.toDataURL({pixelRatio:3})) → paridad de px. */
const PRODUCTION_SCALE = 3;

type Stage = { width: number; height: number };
type PlaceholderLayer = {
  id: string;
  type: "image-placeholder";
  x: number;
  y: number;
  width: number;
  height: number;
  cornerRadius?: number;
  rotation?: number;
};
type BackgroundLayer = { id: string; type: "background"; color?: string };
type AnyLayer = { id: string; type: string; [k: string]: unknown };
type UnitTemplate = { version: 1; stage: Stage; layers: AnyLayer[] };
type PhotoTransform = { offsetX: number; offsetY: number; scale: number };
type Slot = {
  slotIndex: number;
  assetId: string | null;
  photoTransform?: PhotoTransform;
  filter?: PhotoFilterPreset | null;
};

export class RenderNeedsKonvaError extends Error {
  constructor(reason: string) {
    super(`NEEDS_KONVA: ${reason}`);
    this.name = "RenderNeedsKonvaError";
  }
}

/** Bytes de la foto original de un slot (descargados de storage por el caller). null = sin foto. */
export type LoadAssetBytes = (assetId: string) => Promise<Buffer | null>;

/** #RRGGBB → objeto sharp; default blanco. */
function parseColor(color: string | undefined): { r: number; g: number; b: number; alpha: number } {
  const hex = (color ?? "#FFFFFF").replace("#", "");
  if (hex.length !== 6) return { r: 255, g: 255, b: 255, alpha: 1 };
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
    alpha: 1,
  };
}

/** Aproxima el preset de filtro de Konva con operaciones de sharp (paridad "look", no pixel). */
function applyFilter(input: sharp.Sharp, filter: PhotoFilterPreset | null | undefined): sharp.Sharp {
  if (!filter) return input;
  const p = FILTER_PRESETS[filter];
  if (!p) return input;
  let out = input;
  if (p.grayscale) out = out.grayscale();
  const mod: { brightness?: number; saturation?: number; hue?: number } = {};
  if (p.brightness !== 0) mod.brightness = 1 + p.brightness; // Konva Brighten (aditivo) ≈ multiplicativo
  if (!p.grayscale && p.saturation !== 0) mod.saturation = 1 + p.saturation;
  if (!p.grayscale && p.hue !== 0) mod.hue = p.hue;
  if (Object.keys(mod).length > 0) out = out.modulate(mod);
  if (p.contrast !== 0) {
    const mult = Math.max(0, 1 + p.contrast / 100); // -100..100 → factor alrededor de 128
    out = out.linear(mult, 128 * (1 - mult));
  }
  return out;
}

/**
 * Detecta si el unitTemplate es "solo-foto" (background + image-placeholder). Cualquier capa de
 * texto con contenido o marco (asset/shape) → requiere Konva-on-node (A1b).
 */
function assertPhotoOnly(layers: AnyLayer[]): void {
  for (const l of layers) {
    if (l.type === "background" || l.type === "image-placeholder") continue;
    if (l.type === "text") {
      const t = typeof l.text === "string" ? l.text.trim() : "";
      if (t.length > 0) throw new RenderNeedsKonvaError("text layer con contenido");
      continue; // texto vacío → ignorable
    }
    if (l.type === "asset" || l.type === "shape") {
      throw new RenderNeedsKonvaError(`capa ${l.type} (marco)`);
    }
  }
}

const clampInt = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));

/**
 * Renderiza el PNG de producción de UN slot. Devuelve el Buffer o lanza RenderNeedsKonvaError si
 * la plantilla no es solo-foto.
 */
async function renderSlot(
  unit: UnitTemplate,
  slot: Slot,
  shape: string | undefined,
  loadAsset: LoadAssetBytes,
): Promise<Buffer> {
  assertPhotoOnly(unit.layers);

  const S = PRODUCTION_SCALE;
  const outW = clampInt(unit.stage.width * S, 1, 100000);
  const outH = clampInt(unit.stage.height * S, 1, 100000);

  const bgLayer = unit.layers.find((l) => l.type === "background") as BackgroundLayer | undefined;
  const base = sharp({
    create: { width: outW, height: outH, channels: 4, background: parseColor(bgLayer?.color) },
  });

  const composites: sharp.OverlayOptions[] = [];

  const placeholderRaw = unit.layers.find((l) => l.type === "image-placeholder") as
    | PlaceholderLayer
    | undefined;

  if (placeholderRaw && slot.assetId) {
    const assetBytes = await loadAsset(slot.assetId);
    if (assetBytes) {
      // heart/circle → la foto cubre TODO el stage (igual que el editor, useFullStage).
      const useFullStage = shape === "heart" || shape === "circle";
      const ph = useFullStage
        ? { x: 0, y: 0, width: unit.stage.width, height: unit.stage.height }
        : {
            x: placeholderRaw.x,
            y: placeholderRaw.y,
            width: placeholderRaw.width,
            height: placeholderRaw.height,
          };

      const meta = await sharp(assetBytes).metadata();
      const imgW = meta.width ?? 0;
      const imgH = meta.height ?? 0;
      if (imgW > 0 && imgH > 0) {
        // Matemática EXACTA del editor (studio-slot.tsx ImagePlaceholder).
        const coverScaleBase = Math.max(ph.width / imgW, ph.height / imgH);
        const userScale = slot.photoTransform?.scale ?? 1;
        const effectiveScale = Math.max(0.5, Math.min(3, userScale));
        const finalScale = coverScaleBase * effectiveScale;
        const renderedW = imgW * finalScale;
        const renderedH = imgH * finalScale;
        const offX = slot.photoTransform?.offsetX ?? 0;
        const offY = slot.photoTransform?.offsetY ?? 0;
        // Centro de la imagen en coords del stage (× S para px de salida).
        const cx = (ph.x + ph.width / 2 + offX) * S;
        const cy = (ph.y + ph.height / 2 + offY) * S;
        const IW = renderedW * S;
        const IH = renderedH * S;
        const IX = cx - IW / 2;
        const IY = cy - IH / 2;
        // Rect del placeholder en px de salida.
        const PX = ph.x * S;
        const PY = ph.y * S;
        const PW = ph.width * S;
        const PH = ph.height * S;

        // Intersección imagen ∩ placeholder (clip).
        const left = Math.max(PX, IX);
        const top = Math.max(PY, IY);
        const right = Math.min(PX + PW, IX + IW);
        const bottom = Math.min(PY + PH, IY + IH);

        if (right > left && bottom > top) {
          const resizedW = clampInt(IW, 1, 100000);
          const resizedH = clampInt(IH, 1, 100000);
          const resized = await applyFilter(
            sharp(assetBytes, { failOn: "none" }).rotate(), // auto-orient defensivo
            slot.filter,
          )
            .resize(resizedW, resizedH, { fit: "fill" })
            .png()
            .toBuffer();

          // Región de la imagen redimensionada que cae dentro del placeholder.
          const exLeft = clampInt(left - IX, 0, resizedW - 1);
          const exTop = clampInt(top - IY, 0, resizedH - 1);
          const exW = clampInt(right - left, 1, resizedW - exLeft);
          const exH = clampInt(bottom - top, 1, resizedH - exTop);
          const crop = await sharp(resized)
            .extract({ left: exLeft, top: exTop, width: exW, height: exH })
            .toBuffer();

          composites.push({ input: crop, left: clampInt(left, 0, outW - 1), top: clampInt(top, 0, outH - 1) });
        }
      }
    }
  }

  return base.composite(composites).png().toBuffer();
}

/**
 * Renderiza el PNG de producción de TODOS los slots de un canvasData V2. Lanza
 * RenderNeedsKonvaError si la plantilla no es solo-foto (el caller conserva los PNG del cliente).
 */
export async function renderProductionSlots(opts: {
  unitTemplate: UnitTemplate;
  slots: Slot[];
  shape?: string;
  loadAsset: LoadAssetBytes;
}): Promise<Buffer[]> {
  const out: Buffer[] = [];
  // Orden por slotIndex (defensivo).
  const slots = [...opts.slots].sort((a, b) => a.slotIndex - b.slotIndex);
  for (const slot of slots) {
    out.push(await renderSlot(opts.unitTemplate, slot, opts.shape, opts.loadAsset));
  }
  return out;
}
