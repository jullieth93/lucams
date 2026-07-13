/*
 * ADR-057 Fase A1b — Render de PRODUCCIÓN server-side con @napi-rs/canvas (canvas 2D, binarios
 * precompilados, compatible con Vercel sin libs del sistema). Cubre lo que A1a (sharp) dejaba en
 * fallback por PLANTILLA: TEXTO (Polaroid) con las fuentes de marca + MARCOS (asset layers) +
 * rotación/esquinas. Replica el render de Konva del editor (studio-slot.tsx): fondo, foto con
 * encuadre + clip, texto con stroke/shadow, marcos.
 *
 * Los FILTROS siguen en fallback al PNG del cliente (que aplica el filtro EXACTO de Konva) — no se
 * re-implementan aquí para no divergir (hallazgo de la revisión adversarial A1a).
 *
 * SEGURIDAD: si las fuentes no cargan (tracing de Vercel) o algo falla, se lanza y el caller
 * conserva el PNG del cliente. Nunca rompe producción; solo mejora donde puede.
 */

import "server-only";
import path from "node:path";
import fs from "node:fs";
import { createCanvas, GlobalFonts, Image, type SKRSContext2D } from "@napi-rs/canvas";
import { RenderNeedsKonvaError, type LoadAssetBytes } from "./production-render";

const PRODUCTION_SCALE = 3;
const MAX_STAGE_DIM = 3000;

// ── Fuentes de marca (una vez por proceso) ──────────────────────────────────
let fontsReady: boolean | null = null;
function ensureFonts(): boolean {
  if (fontsReady !== null) return fontsReady;
  try {
    const dir = path.join(process.cwd(), "assets", "fonts");
    const ok =
      GlobalFonts.registerFromPath(path.join(dir, "Fredoka.ttf"), "Fredoka") &&
      GlobalFonts.registerFromPath(path.join(dir, "Inter.ttf"), "Inter");
    fontsReady = Boolean(ok);
  } catch {
    fontsReady = false;
  }
  return fontsReady;
}

// ── Tipos (mismos que production-render.ts, minimal) ────────────────────────
type Stage = { width: number; height: number };
type AnyLayer = { id: string; type: string; [k: string]: unknown };
type UnitTemplate = { version: 1; stage: Stage; layers: AnyLayer[] };
type PhotoTransform = { offsetX: number; offsetY: number; scale: number };
type TextOverride = { text?: string; fontFamily?: string; fontSize?: number; fill?: string; fontWeight?: string };
type Slot = {
  slotIndex: number;
  assetId: string | null;
  photoTransform?: PhotoTransform;
  filter?: string | null;
  textOverrides?: Record<string, TextOverride>;
};

const clampInt = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));

function roundRectPath(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

async function decodeImage(bytes: Buffer): Promise<Image> {
  const img = new Image();
  img.src = bytes;
  return img;
}

/** Carga un asset de marco desde /public (asset layer src = "/templates/..."). */
function loadPublicAsset(src: string): Buffer | null {
  if (!src.startsWith("/")) return null;
  try {
    const p = path.join(process.cwd(), "public", src.replace(/^\//, ""));
    return fs.existsSync(p) ? fs.readFileSync(p) : null;
  } catch {
    return null;
  }
}

/**
 * Renderiza un slot con canvas 2D. Lanza RenderNeedsKonvaError si tiene FILTRO (→ cliente) o si
 * no puede (fuente/asset/foto). El caller conserva el PNG del cliente en ese caso.
 */
async function renderSlotCanvas(
  unit: UnitTemplate,
  slot: Slot,
  shape: string | undefined,
  loadAsset: LoadAssetBytes,
): Promise<Buffer> {
  if (unit.stage.width > MAX_STAGE_DIM || unit.stage.height > MAX_STAGE_DIM) {
    throw new RenderNeedsKonvaError(`stage ${unit.stage.width}×${unit.stage.height} > ${MAX_STAGE_DIM}`);
  }
  // Filtro → el cliente tiene el exacto de Konva (no divergimos).
  if (slot.filter) throw new RenderNeedsKonvaError("slot con filtro (fidelidad → cliente)");

  // Guards conservadores (como A1a): rotación del placeholder + múltiples placeholders → fallback.
  const placeholders = unit.layers.filter((l) => l.type === "image-placeholder");
  if (placeholders.length > 1) throw new RenderNeedsKonvaError("múltiples image-placeholder");
  if (placeholders[0] && Number(placeholders[0].rotation) !== 0 && placeholders[0].rotation != null) {
    throw new RenderNeedsKonvaError("placeholder con rotación");
  }

  const hasText = unit.layers.some(
    (l) => l.type === "text" && ((typeof l.text === "string" && l.text.trim()) || slot.textOverrides?.[l.id]?.text),
  );
  if (hasText && !ensureFonts()) {
    throw new RenderNeedsKonvaError("fuentes no disponibles server-side");
  }

  const S = PRODUCTION_SCALE;
  const W = clampInt(unit.stage.width * S, 1, MAX_STAGE_DIM * S);
  const H = clampInt(unit.stage.height * S, 1, MAX_STAGE_DIM * S);
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.scale(S, S); // trabajar en coords lógicas del stage; el canvas es ×S

  const useFullStage = shape === "heart" || shape === "circle";

  for (const layer of unit.layers) {
    if (layer.type === "background") {
      ctx.fillStyle = typeof layer.color === "string" ? layer.color : "#FFFFFF";
      ctx.fillRect(0, 0, unit.stage.width, unit.stage.height);
    } else if (layer.type === "image-placeholder") {
      if (!slot.assetId) throw new RenderNeedsKonvaError(`slot ${slot.slotIndex} sin assetId`);
      const bytes = await loadAsset(slot.assetId);
      if (!bytes) throw new RenderNeedsKonvaError(`no se pudo cargar la foto del slot ${slot.slotIndex}`);
      const img = await decodeImage(bytes);
      const imgW = img.width;
      const imgH = img.height;
      if (!imgW || !imgH) throw new RenderNeedsKonvaError(`foto inválida slot ${slot.slotIndex}`);

      const ph = useFullStage
        ? { x: 0, y: 0, width: unit.stage.width, height: unit.stage.height, cornerRadius: 0 }
        : {
            x: Number(layer.x) || 0,
            y: Number(layer.y) || 0,
            width: Number(layer.width) || unit.stage.width,
            height: Number(layer.height) || unit.stage.height,
            cornerRadius: Number(layer.cornerRadius) || 0,
          };

      const coverScaleBase = Math.max(ph.width / imgW, ph.height / imgH);
      const effectiveScale = Math.max(0.5, Math.min(3, slot.photoTransform?.scale ?? 1));
      const finalScale = coverScaleBase * effectiveScale;
      const renderedW = imgW * finalScale;
      const renderedH = imgH * finalScale;
      const offX = slot.photoTransform?.offsetX ?? 0;
      const offY = slot.photoTransform?.offsetY ?? 0;

      ctx.save();
      // Clip al rect del placeholder (o rounded-rect). Para heart/circle el troquel lo hace la
      // imprenta → clip al rect completo (limpio).
      if (ph.cornerRadius > 0) roundRectPath(ctx, ph.x, ph.y, ph.width, ph.height, ph.cornerRadius);
      else {
        ctx.beginPath();
        ctx.rect(ph.x, ph.y, ph.width, ph.height);
      }
      ctx.clip();
      // Centro de la imagen en coords del stage (idéntico a Konva ImagePlaceholder).
      const cx = ph.x + ph.width / 2 + offX;
      const cy = ph.y + ph.height / 2 + offY;
      ctx.drawImage(img, cx - renderedW / 2, cy - renderedH / 2, renderedW, renderedH);
      ctx.restore();
    } else if (layer.type === "asset") {
      // Marco desde /public/templates.
      const src = typeof layer.src === "string" ? layer.src : "";
      const bytes = loadPublicAsset(src);
      if (!bytes) throw new RenderNeedsKonvaError(`marco no encontrado: ${src}`);
      const frame = await decodeImage(bytes);
      ctx.save();
      ctx.globalAlpha = Number(layer.opacity ?? 1);
      const fx = Number(layer.x) || 0;
      const fy = Number(layer.y) || 0;
      const fw = Number(layer.width) || unit.stage.width;
      const fh = Number(layer.height) || unit.stage.height;
      const rot = Number(layer.rotation) || 0;
      if (rot !== 0) {
        ctx.translate(fx + fw / 2, fy + fh / 2);
        ctx.rotate((rot * Math.PI) / 180);
        ctx.drawImage(frame, -fw / 2, -fh / 2, fw, fh);
      } else {
        ctx.drawImage(frame, fx, fy, fw, fh);
      }
      ctx.restore();
    } else if (layer.type === "text") {
      // heart/circle omiten texto (igual que el editor).
      if (useFullStage) continue;
      renderTextLayer(ctx, layer, unit.stage, slot.textOverrides?.[layer.id]);
    }
    // 'shape' u otras → ignoradas (raras; si aparecen, el resultado es fiel salvo esa capa).
  }

  return canvas.toBuffer("image/png");
}

/** Replica renderText de studio-slot.tsx: fontSize/family/fill/weight/align + stroke/shadow. */
function renderTextLayer(
  ctx: SKRSContext2D,
  layer: AnyLayer,
  stage: Stage,
  override: TextOverride | undefined,
) {
  const finalText = override?.text ?? (typeof layer.text === "string" ? layer.text : "");
  if (!finalText.trim()) return;
  const fontSize = override?.fontSize ?? (Number(layer.fontSize) || 48);
  const family = override?.fontFamily ?? (typeof layer.fontFamily === "string" ? layer.fontFamily : "Fredoka, Inter, sans-serif");
  const fill = override?.fill ?? (typeof layer.fill === "string" ? layer.fill : "#3D2E5C");
  const weight = override?.fontWeight ?? (typeof layer.fontWeight === "string" ? layer.fontWeight : "600");
  const align = (layer.align as CanvasTextAlign) ?? "center";

  ctx.save();
  ctx.font = `${weight} ${fontSize}px ${family}`;
  ctx.textBaseline = "top";
  ctx.textAlign = align === "center" ? "center" : align === "right" ? "right" : "left";
  const x = align === "center" ? stage.width / 2 : Number(layer.x) || 0;
  const y = (Number(layer.y) || 0) - fontSize / 2; // Konva textY = layer.y - fontSize/2

  // Legibilidad sobre foto: stroke blanco + shadow (igual que onPhoto del editor).
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;
  ctx.lineWidth = Math.max(2, fontSize * 0.08);
  ctx.strokeStyle = "rgba(255,255,255,0.92)";
  ctx.strokeText(finalText, x, y);
  ctx.shadowColor = "transparent"; // el fill no lleva shadow (Konva: fillAfterStroke)
  ctx.fillStyle = fill;
  ctx.fillText(finalText, x, y);
  ctx.restore();
}

/**
 * Renderiza todos los slots de un canvasData V2 con canvas 2D. Lanza RenderNeedsKonvaError si algún
 * slot no es renderizable server-side (filtro, fuente ausente, asset faltante) → el caller conserva
 * los PNG del cliente.
 */
export async function renderProductionSlotsCanvas(opts: {
  unitTemplate: UnitTemplate;
  slots: Slot[];
  shape?: string;
  loadAsset: LoadAssetBytes;
}): Promise<Buffer[]> {
  const out: Buffer[] = [];
  const slots = [...opts.slots].sort((a, b) => a.slotIndex - b.slotIndex);
  for (const slot of slots) {
    out.push(await renderSlotCanvas(opts.unitTemplate, slot, opts.shape, opts.loadAsset));
  }
  return out;
}
