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
import { CALENDAR_PAGE, scalePhotoTransformToPage } from "./calendar-layout";
import { drawCalendarPage } from "./calendar-draw";
import {
  isDarkColor,
  frameBleedMargin,
  insetToMinMargin,
  isSimpleCardTemplate,
  simpleCardPhotoRect,
  isStripTemplate,
  stripPhotoRect,
  stripPositionOf,
  isInstagramTemplate,
  instagramBackgroundHex,
  type StripPosition,
} from "./frame-palette";

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
type UnitTemplate = {
  version: 1;
  stage: Stage;
  layers: AnyLayer[];
  /** Ola 2A — marcadores de tira photobooth (gridCols=1 + gridGap=0 → pieza continua). */
  gridCols?: unknown;
  gridGap?: unknown;
};
type PhotoTransform = { offsetX: number; offsetY: number; scale: number; rotation?: number };
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

/**
 * FOTO1 (ADR-063) — traza la SILUETA de la forma (heart/círculo) en coords del stage, para clipear
 * la foto de producción de modo que quede transparente FUERA de la forma (la imprenta troquela por
 * el borde visible = lo que el cliente encuadró). El path del corazón es el mismo que el editor
 * (studio-slot.tsx, normalizado 0..1) escalado al stage.
 */
function shapeSilhouettePath(ctx: SKRSContext2D, shape: string, w: number, h: number) {
  ctx.beginPath();
  if (shape === "circle") {
    ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  } else {
    const x = (v: number) => v * w;
    const y = (v: number) => v * h;
    ctx.moveTo(x(0.5), y(0.82));
    ctx.bezierCurveTo(x(0.28), y(0.68), x(0.06), y(0.52), x(0.06), y(0.32));
    ctx.bezierCurveTo(x(0.06), y(0.18), x(0.16), y(0.08), x(0.28), y(0.08));
    ctx.bezierCurveTo(x(0.38), y(0.08), x(0.44), y(0.12), x(0.5), y(0.22));
    ctx.bezierCurveTo(x(0.56), y(0.12), x(0.62), y(0.08), x(0.72), y(0.08));
    ctx.bezierCurveTo(x(0.84), y(0.08), x(0.94), y(0.18), x(0.94), y(0.32));
    ctx.bezierCurveTo(x(0.94), y(0.52), x(0.72), y(0.68), x(0.5), y(0.82));
  }
  ctx.closePath();
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
  borderColor?: string | null,
  /** Ola 3 — false cuando el producto NO admite texto (Fotoimanes Cuadrados): las
   *  capas de texto de la plantilla se omiten, igual que en el editor (WYSIWYG). */
  includeText: boolean = true,
  /** Ola 3b — el producto ofrece marcos de color (frameOptions): con borderColor la
   *  tarjeta completa se pinta del color y la foto va inserta (frame-card full-bleed,
   *  "el fin del papel"), igual que en el editor. Sin él se conserva el stroke viejo. */
  frameFullBleed: boolean = false,
  /** Ola 4 — posición del slot dentro de una TIRA photobooth (borde exterior first/last). */
  stripPosition: StripPosition | null = null,
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
  // Ola 3 — "frame-card" (tarjeta de color de la Polaroid Clásica) sí se soporta acá.
  const KNOWN = new Set(["background", "image-placeholder", "text", "asset", "frame-card"]);
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

  const hasText =
    includeText &&
    unit.layers.some((l) => {
      if (l.type !== "text") return false;
      const overrideText = slot.textOverrides?.[l.id]?.text;
      // Ola 4 (texto opcional): una capa EDITABLE solo imprime su override — el texto
      // base de la plantilla es una GUÍA del editor ("Escribe tu mensaje"), no se imprime.
      if (l.editable === true)
        return typeof overrideText === "string" && overrideText.trim() !== "";
      return (typeof l.text === "string" && l.text.trim() !== "") || !!overrideText;
    });
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
  // Ola 3 — la plantilla Polaroid Clásica trae una capa "frame-card": la tarjeta entera
  // toma el color del borde elegido (borderColor) con fallback al fill de la capa. Con
  // tarjeta oscura, el texto por defecto sale claro (el override del cliente manda).
  const hasFrameCard = unit.layers.some((l) => l.type === "frame-card");
  // Ola 3b — full-bleed: plantillas SIN frame-card de productos con frameOptions pintan
  // la tarjeta entera de borderColor y la foto va inserta (misma regla que el editor).
  const fullBleed =
    frameFullBleed && typeof borderColor === "string" && !hasFrameCard && !useFullStage;
  const bleedMargin = fullBleed ? frameBleedMargin(unit.stage) : 0;
  // Ola 4 — reglas nuevas por tipo de tarjeta (Lucy 2026-07-23):
  //  - "tarjeta simple" (Cuadrados: fondo + foto, sin chrome ni texto visible):
  //    borderColor null → foto a sangre TOTAL; borderColor set → franja UNIFORME.
  //  - Instagram (chrome SVG): fondo BINARIO blanco/negro (un pastel residual cae a blanco).
  //  - Tira photobooth (gridCols=1+gridGap=0): borde exterior solo en first/last.
  const textVisible = includeText && unit.layers.some((l) => l.type === "text");
  const simpleCard = isSimpleCardTemplate(unit.layers, {
    hasFrameCard,
    textIsVisible: textVisible,
  });
  const isIg = isInstagramTemplate(unit.layers);
  const strip = isStripTemplate(unit) && stripPosition !== null;
  const bgLayerHex = (() => {
    const bg = unit.layers.find((l) => l.type === "background");
    return typeof bg?.color === "string" ? bg.color : "#FFFFFF";
  })();
  const frameCardFillHex = (() => {
    const fc = unit.layers.find((l) => l.type === "frame-card");
    return typeof fc?.fill === "string" ? fc.fill : "#FFFFFF";
  })();
  // Fondo efectivo de la tarjeta → contraste automático del texto (blanco si es oscuro).
  const cardBgHex = isIg
    ? instagramBackgroundHex(borderColor, bgLayerHex)
    : fullBleed && borderColor
      ? borderColor
      : hasFrameCard
        ? (borderColor ?? frameCardFillHex)
        : bgLayerHex;
  const darkCard = isDarkColor(cardBgHex);

  for (const layer of unit.layers) {
    if (layer.type === "frame-card") {
      // Tarjeta de color a todo el stage (debajo de foto y texto), esquinas suaves.
      // El color lo manda canvasData.borderColor (paleta del Estudio); `fill` es el
      // fallback blanco-clásico cuando el cliente no eligió color.
      const fill = borderColor ?? (typeof layer.fill === "string" ? layer.fill : "#FFFFFF");
      const radius = Number(layer.cornerRadius) || 0;
      ctx.save();
      roundRectPath(ctx, 0, 0, unit.stage.width, unit.stage.height, radius);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.restore();
    } else if (layer.type === "background") {
      const bgColor = isIg
        ? cardBgHex // Ola 4 — Instagram: fondo binario blanco/negro (no cualquier hex)
        : fullBleed && borderColor
          ? borderColor // Ola 3b — la tarjeta entera toma el color ("fin del papel")
          : bgLayerHex;
      if (useFullStage) {
        // #1 (FOTO1) — heart/circle pintan el fondo SOLO dentro de la silueta (troquel), transparente
        // afuera. Omitirlo por completo dejaba los huecos DENTRO del corazón (foto con zoom-out o pan)
        // transparentes = blanco al imprimir, divergiendo del editor y del fallback con filtro que sí
        // hornean el crema. Clip a la silueta = WYSIWYG; la foto se dibuja encima y solo asoma el
        // fondo en los huecos.
        ctx.save();
        shapeSilhouettePath(ctx, shape, unit.stage.width, unit.stage.height);
        ctx.clip();
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, unit.stage.width, unit.stage.height);
        ctx.restore();
        continue;
      }
      ctx.fillStyle = bgColor;
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

      const phRaw = useFullStage
        ? { x: 0, y: 0, width: unit.stage.width, height: unit.stage.height, cornerRadius: 0 }
        : {
            x: Number(layer.x) || 0,
            y: Number(layer.y) || 0,
            width: Number(layer.width) || unit.stage.width,
            height: Number(layer.height) || unit.stage.height,
            cornerRadius: Number(layer.cornerRadius) || 0,
          };
      // Ola 4 — ventana de foto según el tipo de tarjeta:
      //  1. "tarjeta simple" (Cuadrados): borderColor null → foto a sangre TOTAL (0 margen);
      //     borderColor set → franja UNIFORME de color en los 4 lados.
      //  2. Ola 3b (resto de plantillas full-bleed): inserta respetando márgenes mayores.
      //     Instagram conserva la geometría de su chrome (sin inset).
      //  3. Tira photobooth: la ventana viene a sangre vertical (fotos que se tocan);
      //     el borde exterior lo pone la posición (first/last).
      let ph = phRaw;
      if (frameFullBleed && simpleCard && !useFullStage) {
        ph = {
          ...simpleCardPhotoRect(unit.stage, borderColor ?? null, frameBleedMargin(unit.stage)),
          cornerRadius: 0,
        };
      } else if (fullBleed && !isIg && !useFullStage) {
        ph = {
          ...insetToMinMargin(phRaw, unit.stage, bleedMargin),
          cornerRadius: phRaw.cornerRadius,
        };
      }
      if (strip && stripPosition) {
        ph = { ...stripPhotoRect(ph, unit.stage, stripPosition), cornerRadius: ph.cornerRadius };
      }

      // Ola 3c — rotación de la foto (pasos de 90° desde "Ajustar foto"): con 90/270
      // el cover se calcula con las dimensiones INTERCAMBIADAS (la foto girada cubre
      // la ventana igual que en el editor Konva). Pan y zoom no cambian de eje.
      const rot = (((slot.photoTransform?.rotation ?? 0) % 360) + 360) % 360;
      const swapDims = rot === 90 || rot === 270;
      const srcW = swapDims ? imgH : imgW;
      const srcH = swapDims ? imgW : imgH;

      const coverScaleBase = Math.max(ph.width / srcW, ph.height / srcH);
      const effectiveScale = Math.max(0.5, Math.min(3, slot.photoTransform?.scale ?? 1));
      const finalScale = coverScaleBase * effectiveScale;
      const renderedW = imgW * finalScale;
      const renderedH = imgH * finalScale;
      const offX = slot.photoTransform?.offsetX ?? 0;
      const offY = slot.photoTransform?.offsetY ?? 0;

      ctx.save();
      // FOTO1 (ADR-063): heart/circle → clip a la SILUETA (elipse/corazón), transparente fuera →
      // la imprenta troquela por ese borde (idéntico a lo que el cliente encuadró en el editor).
      // Resto de formas → clip al rect del placeholder (o rounded-rect).
      if (useFullStage) {
        shapeSilhouettePath(ctx, shape, unit.stage.width, unit.stage.height);
      } else if (ph.cornerRadius > 0) {
        roundRectPath(ctx, ph.x, ph.y, ph.width, ph.height, ph.cornerRadius);
      } else {
        ctx.beginPath();
        ctx.rect(ph.x, ph.y, ph.width, ph.height);
      }
      ctx.clip();
      // Centro de la imagen en coords del stage (idéntico a Konva ImagePlaceholder).
      const cx = ph.x + ph.width / 2 + offX;
      const cy = ph.y + ph.height / 2 + offY;
      if (rot !== 0) {
        // Rotación alrededor del centro (pan ya aplicado), igual que el nodo Konva.
        ctx.translate(cx, cy);
        ctx.rotate((rot * Math.PI) / 180);
        ctx.drawImage(img, -renderedW / 2, -renderedH / 2, renderedW, renderedH);
      } else {
        ctx.drawImage(img, cx - renderedW / 2, cy - renderedH / 2, renderedW, renderedH);
      }
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
      // heart/circle omiten texto (igual que el editor). Ola 3 — también se omite
      // cuando el producto no admite texto (includeText=false, ej. Fotoimanes Cuadrados).
      if (useFullStage || !includeText) continue;
      renderTextLayer(ctx, layer, unit.stage, slot.textOverrides?.[layer.id], darkCard);
    }
    // 'shape' u otras → ignoradas (raras; si aparecen, el resultado es fiel salvo esa capa).
  }

  // Ola 2A — MARCO de color alrededor de la foto (canvasData.borderColor): mismo dibujo que el
  // editor (Rect de stroke centrado en el borde de la ventana de foto, encima de todo). Heart/
  // circle no llevan marco (la silueta troquelada manda). Ola 3 — con frame-card TAMPOCO: la
  // tarjeta entera ya es el marco de color (dibujar el stroke encima duplicaría el borde).
  // Ola 3b — con full-bleed tampoco: el fondo ya es borderColor y la foto va inserta.
  if (borderColor && !useFullStage && !hasFrameCard && !fullBleed) {
    const phLayer = unit.layers.find((l) => l.type === "image-placeholder");
    if (phLayer) {
      const ph = {
        x: Number(phLayer.x) || 0,
        y: Number(phLayer.y) || 0,
        width: Number(phLayer.width) || unit.stage.width,
        height: Number(phLayer.height) || unit.stage.height,
        cornerRadius: Number(phLayer.cornerRadius) || 0,
      };
      const w = Math.max(6, Math.round(unit.stage.width * 0.04));
      ctx.save();
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = w;
      roundRectPath(
        ctx,
        ph.x + w / 2,
        ph.y + w / 2,
        Math.max(0, ph.width - w),
        Math.max(0, ph.height - w),
        Math.max(0, ph.cornerRadius - w / 2),
      );
      ctx.stroke();
      ctx.restore();
    }
  }

  return canvas.toBuffer("image/png");
}

/** Replica renderText de studio-slot.tsx: fontSize/family/fill/weight/align + stroke/shadow.
 *  Ola 3 — `darkCard`: la tarjeta del borde es oscura → el texto POR DEFECTO sale claro
 *  (el override de color del cliente siempre manda).
 *  Ola 4 — texto OPCIONAL (Lucy 2026-07-23): una capa EDITABLE imprime solo su override;
 *  el texto base de la plantilla es una guía del editor ("Escribe tu mensaje") y NO se
 *  imprime. Las capas NO editables (decorativas de la plantilla) imprimen su texto base. */
function renderTextLayer(
  ctx: SKRSContext2D,
  layer: AnyLayer,
  stage: Stage,
  override: TextOverride | undefined,
  darkCard: boolean = false,
) {
  const baseText = layer.editable === true ? "" : typeof layer.text === "string" ? layer.text : "";
  const finalText = override?.text ?? baseText;
  if (!finalText.trim()) return;
  const fontSize = override?.fontSize ?? (Number(layer.fontSize) || 48);
  const family =
    override?.fontFamily ??
    (typeof layer.fontFamily === "string" ? layer.fontFamily : "Fredoka, Inter, sans-serif");
  const fill =
    override?.fill ??
    (darkCard ? "#FFFFFF" : typeof layer.fill === "string" ? layer.fill : "#3D2E5C");
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
  // #2 — @napi-rs/canvas ignora el eje `wght` del font-string en las fuentes variables de marca
  // (Fredoka/Inter) → usaría la instancia default y divergiría del bold/regular que ve el cliente.
  // Forzamos el eje (Konva: normal→400, bold→700, numérico→tal cual). Antes del measureText para que
  // la decisión de envolver use métricas del peso real.
  const numericWeight =
    weight === "bold" ? 700 : weight === "normal" ? 400 : Number.parseInt(weight, 10) || 400;
  ctx.fontVariationSettings = `'wght' ${numericWeight}`;
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
  /** Ola 2A — color del marco alrededor de la foto (hex) o null = sin marco. */
  borderColor?: string | null;
  /** Ola 3 — false omite las capas de texto (producto sin texto, WYSIWYG con el editor). */
  includeText?: boolean;
  /** Ola 3b — producto con frameOptions: tarjeta full-bleed del color + foto inserta. */
  frameFullBleed?: boolean;
}): Promise<Buffer[]> {
  const mod = await loadCanvas(); // lazy: un binario faltante → NEEDS_KONVA (fallback), no crash.
  const out: Buffer[] = [];
  const slots = [...opts.slots].sort((a, b) => a.slotIndex - b.slotIndex);
  // Ola 4 — tira photobooth (gridCols=1 + gridGap=0): el borde exterior de la pieza
  // continua va solo en la primera/última celda; las fotos del medio se tocan.
  const strip = isStripTemplate(opts.unitTemplate);
  for (const [index, slot] of slots.entries()) {
    out.push(
      await renderSlotCanvas(
        mod,
        opts.unitTemplate,
        slot,
        opts.shape,
        opts.loadAsset,
        opts.borderColor,
        opts.includeText ?? true,
        opts.frameFullBleed ?? false,
        strip ? stripPositionOf(index, slots.length) : null,
      ),
    );
  }
  return out;
}

// ════════════════════════════════════════════════════════════════════════════
// ADR-063 CAL1 — Compositor de la TARJETA de un mes del calendario (set 12 tarjetas 7.5×10).
// Antes el calendario se producía como 12 FOTOS DESNUDAS (mes/año/grilla eran overlays DOM que
// NO entraban al PNG). Este compositor hornea, bajo la foto del cliente, el título del mes en
// lettering grande + año, los encabezados de día y la grilla real (calendar-grid). La región de
// foto = CALENDAR_PHOTO (1080×810 top, ratio 4:3) — proporcional a la ventana de la plantilla
// del editor (600×450) → el encuadre del cliente mapea 1:1 (WYSIWYG) reescalando ×1.8.
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
  templateStageWidth?: number,
): Promise<Buffer> {
  const S = PRODUCTION_SCALE;
  const W = clampInt(CALENDAR_PAGE.width * S, 1, MAX_STAGE_DIM * S);
  const H = clampInt(CALENDAR_PAGE.height * S, 1, MAX_STAGE_DIM * S);
  const canvas = mod.createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.scale(S, S);

  // Decodifica la foto del mes. loadImage (no `img.src=`) porque necesitamos los PÍXELES antes del
  // drawImage — `img.src=buffer` da dimensiones sync pero decodifica async → dibujaría vacío.
  const bytes = slot.assetId ? await loadAsset(slot.assetId) : null;
  let photo: InstanceType<CanvasMod["Image"]> | null = null;
  if (bytes) {
    try {
      photo = (await mod.loadImage(bytes)) as InstanceType<CanvasMod["Image"]>;
    } catch {
      photo = null; // decode falló → el helper dibuja un recuadro suave.
    }
  }

  // ADR-063 CAL4 — dibujo compartido (misma fuente que el preview inmersivo del cliente → WYSIWYG).
  // El photoTransform llega en unidades de la PLANTILLA del editor (600px) → se reescala a la
  // página (1080px) para que el encuadre impreso coincida con el de pantalla.
  drawCalendarPage(ctx, {
    photo,
    photoTransform: scalePhotoTransformToPage(slot.photoTransform, templateStageWidth),
    year,
    monthIndex0,
    fontsOk,
  });

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
  /** Ancho del stage de la plantilla del editor (para reescalar el encuadre). Default = página. */
  templateStageWidth?: number;
}): Promise<Buffer[]> {
  const mod = await loadCanvas();
  const fontsOk = ensureFonts(mod);
  const start = opts.startMonth ?? 0;
  const out: Buffer[] = [];
  const slots = [...opts.slots].sort((a, b) => a.slotIndex - b.slotIndex);
  for (const slot of slots) {
    const monthIndex0 = (((start + slot.slotIndex) % 12) + 12) % 12;
    out.push(
      await renderCalendarPage(
        mod,
        slot,
        monthIndex0,
        opts.year,
        fontsOk,
        opts.loadAsset,
        opts.templateStageWidth,
      ),
    );
  }
  return out;
}
