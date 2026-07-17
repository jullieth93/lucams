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
import type { SKRSContext2D } from "@napi-rs/canvas";
import { RenderNeedsKonvaError, type LoadAssetBytes } from "./production-render";
import { calendarMonthGrid, MONTH_NAMES_ES, WEEKDAY_HEADERS_ES } from "./calendar-grid";
import { CALENDAR_PAGE, CALENDAR_PHOTO, CALENDAR_LAYOUT } from "./calendar-layout";

const PRODUCTION_SCALE = 3;
const MAX_STAGE_DIM = 3000;

// ── @napi-rs/canvas se carga LAZY (revisión A1b) ────────────────────────────
// Es un módulo NATIVO. Importarlo en el top haría que un binario de plataforma faltante (ej. en
// un runtime de Vercel inesperado) tumbe TODO el módulo — y con él el Estudio. Cargándolo dentro
// del render, un fallo se convierte en RenderNeedsKonvaError → fallback al PNG del cliente.
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

// ── Fuentes de marca (una vez por proceso) ──────────────────────────────────
let fontsReady: boolean | null = null;
function ensureFonts(mod: CanvasMod): boolean {
  if (fontsReady !== null) return fontsReady;
  try {
    const dir = path.join(process.cwd(), "assets", "fonts");
    const ok =
      mod.GlobalFonts.registerFromPath(path.join(dir, "Fredoka.ttf"), "Fredoka") &&
      mod.GlobalFonts.registerFromPath(path.join(dir, "Inter.ttf"), "Inter");
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
type TextOverride = {
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  fill?: string;
  fontWeight?: string;
};
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

// loadImage (async) decodifica los PÍXELES antes de devolver — necesario para drawImage. `new
// Image(); img.src=buffer` daba dimensiones sync pero decodifica píxeles async → drawImage dibujaría
// vacío (bug real: fotos en blanco en el render server-side, ej. Polaroid). ADR-063 FOTO2.
async function decodeImage(
  mod: CanvasMod,
  bytes: Buffer,
): Promise<InstanceType<CanvasMod["Image"]>> {
  return (await mod.loadImage(bytes)) as InstanceType<CanvasMod["Image"]>;
}

/** Carga un asset de marco desde /public (asset layer src = "/templates/..."). Con contención
 *  de path: el resultado DEBE quedar dentro de /public (anti path-traversal). */
function loadPublicAsset(src: string): Buffer | null {
  if (!src.startsWith("/")) return null;
  try {
    const root = path.join(process.cwd(), "public");
    const p = path.normalize(path.join(root, src.replace(/^\//, "")));
    if (p !== root && !p.startsWith(root + path.sep)) return null; // fuera de /public → rechazar
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
  mod: CanvasMod,
  unit: UnitTemplate,
  slot: Slot,
  shape: string | undefined,
  loadAsset: LoadAssetBytes,
): Promise<Buffer> {
  if (unit.stage.width > MAX_STAGE_DIM || unit.stage.height > MAX_STAGE_DIM) {
    throw new RenderNeedsKonvaError(
      `stage ${unit.stage.width}×${unit.stage.height} > ${MAX_STAGE_DIM}`,
    );
  }
  // Filtro → el cliente tiene el exacto de Konva (no divergimos).
  if (slot.filter) throw new RenderNeedsKonvaError("slot con filtro (fidelidad → cliente)");

  // Guards conservadores: solo capas conocidas + un placeholder sin rotación. Capas raras
  // (shape/otras) → fallback al cliente, igual que A1a (no dibujar de menos silenciosamente).
  const KNOWN = new Set(["background", "image-placeholder", "text", "asset"]);
  for (const l of unit.layers) {
    if (!KNOWN.has(l.type)) throw new RenderNeedsKonvaError(`capa no soportada: ${l.type}`);
    // Marcos SVG con texto horneado (ej. Polaroid Instagram, Arial) → resvg divergiría en fuentes
    // → fallback al cliente (que rasteriza el SVG fiel en el navegador).
    if (l.type === "asset" && typeof l.src === "string" && /\.svg(\?|$)/i.test(l.src)) {
      throw new RenderNeedsKonvaError("marco SVG (fuentes horneadas → cliente)");
    }
  }
  const placeholders = unit.layers.filter((l) => l.type === "image-placeholder");
  if (placeholders.length > 1) throw new RenderNeedsKonvaError("múltiples image-placeholder");
  if (
    placeholders[0] &&
    Number(placeholders[0].rotation) !== 0 &&
    placeholders[0].rotation != null
  ) {
    throw new RenderNeedsKonvaError("placeholder con rotación");
  }

  const hasText = unit.layers.some(
    (l) =>
      l.type === "text" &&
      ((typeof l.text === "string" && l.text.trim()) || slot.textOverrides?.[l.id]?.text),
  );
  if (hasText && !ensureFonts(mod)) {
    throw new RenderNeedsKonvaError("fuentes no disponibles server-side");
  }

  const S = PRODUCTION_SCALE;
  const W = clampInt(unit.stage.width * S, 1, MAX_STAGE_DIM * S);
  const H = clampInt(unit.stage.height * S, 1, MAX_STAGE_DIM * S);
  const canvas = mod.createCanvas(W, H);
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
      if (!bytes)
        throw new RenderNeedsKonvaError(`no se pudo cargar la foto del slot ${slot.slotIndex}`);
      let img: InstanceType<CanvasMod["Image"]>;
      try {
        img = await decodeImage(mod, bytes);
      } catch {
        throw new RenderNeedsKonvaError(`foto ilegible slot ${slot.slotIndex}`);
      }
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
      // Marco (PNG) desde /public/templates.
      const src = typeof layer.src === "string" ? layer.src : "";
      const bytes = loadPublicAsset(src);
      if (!bytes) throw new RenderNeedsKonvaError(`marco no encontrado: ${src}`);
      let frame: InstanceType<CanvasMod["Image"]>;
      try {
        frame = await decodeImage(mod, bytes);
      } catch {
        throw new RenderNeedsKonvaError(`marco ilegible: ${src}`);
      }
      if (!frame.width || !frame.height) throw new RenderNeedsKonvaError(`marco inválido: ${src}`);
      ctx.save();
      ctx.globalAlpha = Number(layer.opacity ?? 1);
      const fx = Number(layer.x) || 0;
      const fy = Number(layer.y) || 0;
      const fw = Number(layer.width) || unit.stage.width;
      const fh = Number(layer.height) || unit.stage.height;
      const rot = Number(layer.rotation) || 0;
      if (rot !== 0) {
        // Konva rota alrededor del ORIGEN del nodo (x,y = top-left), no del centro.
        ctx.translate(fx, fy);
        ctx.rotate((rot * Math.PI) / 180);
        ctx.drawImage(frame, 0, 0, fw, fh);
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
  const family =
    override?.fontFamily ??
    (typeof layer.fontFamily === "string" ? layer.fontFamily : "Fredoka, Inter, sans-serif");
  const fill = override?.fill ?? (typeof layer.fill === "string" ? layer.fill : "#3D2E5C");
  // Konva default fontStyle = "normal" (400) cuando el layer no lo especifica (NO 600).
  const weight =
    override?.fontWeight ?? (typeof layer.fontWeight === "string" ? layer.fontWeight : "normal");
  const align = (layer.align as CanvasTextAlign) ?? "center";

  // Solo fuentes de MARCA registradas (Fredoka/Inter). Cualquier otra familia (Georgia,
  // Helvetica, mono…) renderizaría en un fallback distinto al del navegador → divergencia →
  // fallback al cliente (hallazgo revisión A1b). Itálica: los TTF de marca no tienen cara
  // itálica y @napi-rs no la sintetiza → también cae al cliente.
  const famLc = family.toLowerCase();
  if (!famLc.includes("fredoka") && !famLc.includes("inter")) {
    throw new RenderNeedsKonvaError(`fuente no-marca (${family}) → cliente`);
  }
  if (`${weight} ${layer.fontStyle ?? ""}`.toLowerCase().includes("italic")) {
    throw new RenderNeedsKonvaError("texto itálico → cliente");
  }

  // Konva envuelve el texto center-align al ancho del stage y respeta \n. Este render dibuja UNA
  // línea → si envolvería (o trae saltos), cae al cliente (fiel). Corto de una línea = fiel.
  if (finalText.includes("\n")) throw new RenderNeedsKonvaError("texto multilínea → cliente");

  ctx.save();
  ctx.font = `${weight} ${fontSize}px ${family}`;
  ctx.textBaseline = "top";
  // Solo center o left: Konva right-align (sin width) extiende a la derecha desde x = left.
  ctx.textAlign = align === "center" ? "center" : "left";
  if (align === "center" && ctx.measureText(finalText).width > stage.width) {
    ctx.restore();
    throw new RenderNeedsKonvaError("texto que envolvería (ancho > stage) → cliente");
  }
  // Konva right-align sobre un Text sin width extiende hacia la DERECHA desde x (el editor lo usa
  // como no-op); replicarlo con textAlign "right" invertiría. Para center usamos el centro del
  // stage (Konva width=stage.width). Para left/right anclamos en layer.x con align left.
  const x = align === "center" ? stage.width / 2 : Number(layer.x) || 0;
  const y = (Number(layer.y) || 0) - fontSize / 2; // Konva textY = layer.y - fontSize/2

  // El editor renderiza el texto de slot PLANO (renderText onPhoto=false, único call-site).
  // NADA de stroke/shadow — eso divergía del preview aprobado (hallazgo revisión A1b).
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
  const mod = await loadCanvas(); // lazy: un binario faltante → NEEDS_KONVA (fallback), no crash.
  const out: Buffer[] = [];
  const slots = [...opts.slots].sort((a, b) => a.slotIndex - b.slotIndex);
  for (const slot of slots) {
    out.push(await renderSlotCanvas(mod, opts.unitTemplate, slot, opts.shape, opts.loadAsset));
  }
  return out;
}

// ════════════════════════════════════════════════════════════════════════════
// ADR-063 CAL1 — Compositor de la PÁGINA de un mes del calendario.
// Antes el calendario se producía como 12 FOTOS DESNUDAS (mes/año/grilla eran overlays DOM que
// NO entraban al PNG). Este compositor hornea, sobre la foto del cliente, el título mes+año, los
// encabezados de día y la grilla real (calendar-grid). La región de foto = CALENDAR_PHOTO
// (1080×1080 top), idéntica al slot del editor → el encuadre del cliente mapea 1:1 (WYSIWYG).
// A diferencia del render genérico, NO cae al cliente: compone la página completa siempre.
// ════════════════════════════════════════════════════════════════════════════

export type CalendarSlotInput = {
  slotIndex: number;
  assetId: string | null;
  photoTransform?: PhotoTransform;
};

async function renderCalendarPage(
  mod: CanvasMod,
  slot: CalendarSlotInput,
  monthIndex0: number,
  year: number,
  fontsOk: boolean,
  loadAsset: LoadAssetBytes,
): Promise<Buffer> {
  const S = PRODUCTION_SCALE;
  const W = clampInt(CALENDAR_PAGE.width * S, 1, MAX_STAGE_DIM * S);
  const H = clampInt(CALENDAR_PAGE.height * S, 1, MAX_STAGE_DIM * S);
  const canvas = mod.createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.scale(S, S);

  // Fondo blanco.
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, CALENDAR_PAGE.width, CALENDAR_PAGE.height);

  // Foto del mes (cover + encuadre del cliente, misma matemática que renderSlotCanvas).
  // loadImage (no `img.src=`) porque necesitamos los PÍXELES decodificados antes del drawImage —
  // `img.src=buffer` da las dimensiones sync pero decodifica los píxeles async → dibujaría vacío.
  const ph = CALENDAR_PHOTO;
  const bytes = slot.assetId ? await loadAsset(slot.assetId) : null;
  let photoDrawn = false;
  if (bytes) {
    try {
      const img = await mod.loadImage(bytes);
      if (img.width && img.height) {
        const coverBase = Math.max(ph.width / img.width, ph.height / img.height);
        const eff = Math.max(0.5, Math.min(3, slot.photoTransform?.scale ?? 1));
        const finalScale = coverBase * eff;
        const rw = img.width * finalScale;
        const rh = img.height * finalScale;
        const offX = slot.photoTransform?.offsetX ?? 0;
        const offY = slot.photoTransform?.offsetY ?? 0;
        ctx.save();
        ctx.beginPath();
        ctx.rect(ph.x, ph.y, ph.width, ph.height);
        ctx.clip();
        const cx = ph.x + ph.width / 2 + offX;
        const cy = ph.y + ph.height / 2 + offY;
        ctx.drawImage(img, cx - rw / 2, cy - rh / 2, rw, rh);
        ctx.restore();
        photoDrawn = true;
      }
    } catch {
      // decode falló → recuadro suave abajo.
    }
  }
  if (!photoDrawn) {
    // Mes sin foto (o foto ilegible) → recuadro suave. Un calendario finalizado debería tener las 12.
    ctx.fillStyle = "#F3EFEA";
    ctx.fillRect(ph.x, ph.y, ph.width, ph.height);
  }

  const titleFont = fontsOk ? "Fredoka" : "sans-serif";
  const bodyFont = fontsOk ? "Inter" : "sans-serif";
  const L = CALENDAR_LAYOUT;

  // Título: "Enero 2027".
  ctx.fillStyle = "#3D2E5C";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = `700 ${L.titleFontSize}px ${titleFont}`;
  ctx.fillText(`${MONTH_NAMES_ES[monthIndex0] ?? ""} ${year}`, CALENDAR_PAGE.width / 2, L.titleY);

  // Encabezados de día (D L M M J V S).
  const gridW = L.gridRight - L.gridLeft;
  const colW = gridW / 7;
  ctx.font = `700 ${L.weekdayFontSize}px ${bodyFont}`;
  ctx.fillStyle = "#7C6AAD";
  for (let c = 0; c < 7; c++) {
    ctx.fillText(WEEKDAY_HEADERS_ES[c]!, L.gridLeft + colW * c + colW / 2, L.weekdayY);
  }

  // Grilla de días.
  const weeks = calendarMonthGrid(year, monthIndex0);
  const rows = Math.max(1, weeks.length);
  const rowH = (L.gridBottom - L.gridTop) / rows;
  const daySize = Math.min(32, rowH * 0.5);
  ctx.strokeStyle = "#E7DFD3";
  ctx.lineWidth = 1;
  ctx.textBaseline = "middle";
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < 7; c++) {
      const x = L.gridLeft + colW * c;
      const y = L.gridTop + rowH * r;
      ctx.strokeRect(x, y, colW, rowH);
      const day = weeks[r]?.[c];
      if (day != null) {
        ctx.fillStyle = "#2A2140";
        ctx.font = `400 ${daySize}px ${bodyFont}`;
        ctx.fillText(String(day), x + colW / 2, y + rowH / 2);
      }
    }
  }

  return canvas.toBuffer("image/png");
}

/**
 * Renderiza las N páginas de mes de un calendario. slotIndex 0 → startMonth (default Enero=0).
 * NO lanza RenderNeedsKonvaError: compone la página completa siempre (el PNG del cliente no tiene
 * la grilla). Si @napi-rs/canvas no está disponible, sí propaga (el caller decide el fallback).
 */
export async function renderCalendarMonthPagesCanvas(opts: {
  slots: CalendarSlotInput[];
  loadAsset: LoadAssetBytes;
  year: number;
  startMonth?: number;
}): Promise<Buffer[]> {
  const mod = await loadCanvas();
  const fontsOk = ensureFonts(mod);
  const start = opts.startMonth ?? 0;
  const out: Buffer[] = [];
  const slots = [...opts.slots].sort((a, b) => a.slotIndex - b.slotIndex);
  for (const slot of slots) {
    const monthIndex0 = (((start + slot.slotIndex) % 12) + 12) % 12;
    out.push(await renderCalendarPage(mod, slot, monthIndex0, opts.year, fontsOk, opts.loadAsset));
  }
  return out;
}
