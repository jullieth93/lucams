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
import type { PhotoFilterPreset } from "@/app/estudio/[slug]/types";

/** Escala de salida = pixelRatio del cliente (stage.toDataURL({pixelRatio:3})) → paridad de px. */
const PRODUCTION_SCALE = 3;
/** Cota del stage lógico. Un stage sano es ~720–1080; > esto → cae al PNG del cliente (anti-OOM). */
const MAX_STAGE_DIM = 3000;
/** Cota de la foto redimensionada (evita el pixel-limit de sharp y OOM en zoom extremo). */
const MAX_RESIZE_DIM = 12000;

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
  textOverrides?: Record<string, { text?: string }>;
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

/**
 * Guard conservador (post-revisión adversarial A1a): el render server-side SOLO corre en los
 * casos que reproduce con FIDELIDAD 100% (foto simple sin adornos). Cualquier otra cosa lanza
 * NEEDS_KONVA → el caller conserva el PNG del cliente (que para filtros ES el filtro exacto
 * aprobado). Esto elimina las divergencias reales que la revisión encontró:
 *   - filtros (sharp ≠ Konva Brighten/Contrast/HSL/Grayscale) → fallback al cliente.
 *   - rotación / esquinas redondeadas / múltiples placeholders → fallback.
 *   - texto/marco (asset/shape) → fallback (A1b, Konva-on-node).
 *   - stage gigante → fallback (anti-OOM).
 */
function assertServerRenderable(unit: UnitTemplate, slots: Slot[]): void {
  if (unit.stage.width > MAX_STAGE_DIM || unit.stage.height > MAX_STAGE_DIM) {
    throw new RenderNeedsKonvaError(
      `stage ${unit.stage.width}×${unit.stage.height} > ${MAX_STAGE_DIM}`,
    );
  }
  let placeholders = 0;
  for (const l of unit.layers) {
    if (l.type === "background") continue;
    if (l.type === "image-placeholder") {
      placeholders++;
      const ph = l as unknown as PlaceholderLayer;
      if (ph.rotation && ph.rotation !== 0)
        throw new RenderNeedsKonvaError("placeholder con rotación");
      if (ph.cornerRadius && ph.cornerRadius > 0)
        throw new RenderNeedsKonvaError("placeholder con cornerRadius");
      continue;
    }
    if (l.type === "text") {
      const base = typeof l.text === "string" ? l.text.trim() : "";
      // Un texto-base vacío PERO con override del cliente (caption editado) SÍ tiene contenido →
      // no es "solo-foto" (evita que sharp lo dibuje sin el caption; hallazgo revisión A1b).
      const overridden = slots.some((s) => (s.textOverrides?.[l.id]?.text ?? "").trim().length > 0);
      if (base.length > 0 || overridden)
        throw new RenderNeedsKonvaError("text layer con contenido");
      continue; // texto vacío y sin override → ignorable
    }
    throw new RenderNeedsKonvaError(`capa ${l.type} (marco)`);
  }
  if (placeholders > 1) throw new RenderNeedsKonvaError("múltiples image-placeholder");
  // Cualquier slot con FILTRO → el cliente tiene el filtro exacto de Konva (fidelidad) → fallback.
  if (slots.some((s) => s.filter))
    throw new RenderNeedsKonvaError("slot con filtro (fidelidad → cliente)");
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
  const S = PRODUCTION_SCALE;
  const outW = clampInt(unit.stage.width * S, 1, MAX_STAGE_DIM * S);
  const outH = clampInt(unit.stage.height * S, 1, MAX_STAGE_DIM * S);

  const bgLayer = unit.layers.find((l) => l.type === "background") as BackgroundLayer | undefined;
  const base = sharp({
    create: { width: outW, height: outH, channels: 4, background: parseColor(bgLayer?.color) },
  });

  // FIX crítico (revisión A1a): un pack de foto DEBE tener placeholder + foto. Si falta cualquiera
  // o la foto no se puede cargar, NO producir un PNG en blanco (pérdida de datos silenciosa):
  // lanzar → el caller conserva el PNG del cliente (que sí trae la foto).
  const placeholderRaw = unit.layers.find((l) => l.type === "image-placeholder") as
    | PlaceholderLayer
    | undefined;
  if (!placeholderRaw) throw new RenderNeedsKonvaError("sin image-placeholder");
  if (!slot.assetId) throw new RenderNeedsKonvaError(`slot ${slot.slotIndex} sin assetId`);
  const assetBytes = await loadAsset(slot.assetId);
  if (!assetBytes)
    throw new RenderNeedsKonvaError(`no se pudo cargar la foto del slot ${slot.slotIndex}`);

  // heart/circle → la foto cubre TODO el stage (igual que el editor, useFullStage).
  const useFullStage = shape === "heart" || shape === "circle";
  // FOTO1 (ADR-063): heart/circle necesitan CLIP a la silueta (transparente FUERA de la forma →
  // la imprenta troquela por el borde que el cliente vio en el editor). sharp no hace clip de path
  // arbitrario → delegamos al renderer de canvas (renderSlotCanvas), que sí clipa a la silueta.
  if (useFullStage) throw new RenderNeedsKonvaError("heart/circle → clip de silueta (canvas)");
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
  if (imgW <= 0 || imgH <= 0)
    throw new RenderNeedsKonvaError(`foto inválida en slot ${slot.slotIndex}`);

  // Matemática EXACTA del editor (studio-slot.tsx ImagePlaceholder).
  const coverScaleBase = Math.max(ph.width / imgW, ph.height / imgH);
  const userScale = slot.photoTransform?.scale ?? 1;
  const effectiveScale = Math.max(0.5, Math.min(3, userScale));
  const finalScale = coverScaleBase * effectiveScale;
  const offX = slot.photoTransform?.offsetX ?? 0;
  const offY = slot.photoTransform?.offsetY ?? 0;
  const IW = imgW * finalScale * S;
  const IH = imgH * finalScale * S;
  // Anti-OOM: zoom extremo sobre foto de alta resolución → cae al PNG del cliente.
  if (IW > MAX_RESIZE_DIM || IH > MAX_RESIZE_DIM) {
    throw new RenderNeedsKonvaError(
      `resize ${Math.round(IW)}×${Math.round(IH)} > ${MAX_RESIZE_DIM}`,
    );
  }
  // Centro de la imagen en coords del stage (× S para px de salida).
  const cx = (ph.x + ph.width / 2 + offX) * S;
  const cy = (ph.y + ph.height / 2 + offY) * S;
  const IX = cx - IW / 2;
  const IY = cy - IH / 2;
  const PX = ph.x * S;
  const PY = ph.y * S;
  const PW = ph.width * S;
  const PH = ph.height * S;

  // Intersección imagen ∩ placeholder (clip). Vacía = el usuario movió la foto fuera del slot
  // (zoom-out/drag extremo) → solo fondo, que es EXACTO lo que vio en el preview (WYSIWYG).
  const composites: sharp.OverlayOptions[] = [];
  const left = Math.max(PX, IX);
  const top = Math.max(PY, IY);
  const right = Math.min(PX + PW, IX + IW);
  const bottom = Math.min(PY + PH, IY + IH);
  if (right > left && bottom > top) {
    const resizedW = clampInt(IW, 1, MAX_RESIZE_DIM);
    const resizedH = clampInt(IH, 1, MAX_RESIZE_DIM);
    const resized = await sharp(assetBytes, { failOn: "none" })
      .rotate() // auto-orient defensivo (las fotos ya vienen orientadas del upload)
      .resize(resizedW, resizedH, { fit: "fill" })
      .png()
      .toBuffer();

    const exLeft = clampInt(left - IX, 0, resizedW - 1);
    const exTop = clampInt(top - IY, 0, resizedH - 1);
    const exW = clampInt(right - left, 1, resizedW - exLeft);
    const exH = clampInt(bottom - top, 1, resizedH - exTop);
    const crop = await sharp(resized)
      .extract({ left: exLeft, top: exTop, width: exW, height: exH })
      .toBuffer();
    composites.push({
      input: crop,
      left: clampInt(left, 0, outW - 1),
      top: clampInt(top, 0, outH - 1),
    });
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
  // Guard conservador: solo renderizamos server-side los casos que reproducimos con fidelidad
  // 100%. Cualquier otra cosa → NEEDS_KONVA → el caller conserva los PNG del cliente.
  assertServerRenderable(opts.unitTemplate, opts.slots);

  const out: Buffer[] = [];
  // Orden por slotIndex (defensivo).
  const slots = [...opts.slots].sort((a, b) => a.slotIndex - b.slotIndex);
  for (const slot of slots) {
    out.push(await renderSlot(opts.unitTemplate, slot, opts.shape, opts.loadAsset));
  }
  return out;
}
