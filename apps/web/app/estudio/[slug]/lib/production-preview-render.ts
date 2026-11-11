/*
 * Render/composición de previews de producción y texturas 3D del Estudio.
 *
 * Arquitectura determinista (Canvas2D directo desde `CanvasDataV2`):
 *   - `renderSlotToDataUrl2D`: renderiza cualquier slot directamente desde el
 *     estado puro del diseño (`unitTemplate` + `SlotState`) sobre UN ÚNICO
 *     `<canvas>` reutilizado secuencialmente, con cache LRU por referencia.
 *     Elimina la dependencia de montar todos los `<Stage>` Konva ocultos en el
 *     DOM y evita agotar el presupuesto de memoria Canvas2D de Chrome móvil al
 *     editar diseños multi-unidad desde `/carrito`.
 *   - Los slots con filtro Konva (`slot.filter`) aprovechan `snapshotSlotForPreview`
 *     cuando el stage está montado y tiene píxeles visibles (`hasVisiblePixels`);
 *     si el stage no está disponible o devuelve un raster transparente por presión
 *     de memoria, degradan limpiamente al mismo motor Canvas2D con `ctx.filter`.
 *   - Si una URL firmada expiró (`loadCanvasImage` devuelve `null`), dispara un
 *     único refresco por lote (`refreshExpiredAssets`) y reintenta con URLs frescas.
 */

import type Konva from "konva";
import type { Magnet3D } from "../fridge-3d-view";
import type {
  AssetLayer,
  CanvasDataV1,
  CanvasDataV2,
  FrameCardLayer,
  ImagePlaceholderLayer,
  PhotoFilterPreset,
  ProfilePhotoLayer,
  ShapeLayer,
  SlotState,
  TextLayer,
} from "../types";
import { previewFacePairOfUnit } from "./faces";
import { loadImage } from "./image-utils";
import { loadCanvasImage } from "./canvas-image";
import { canvasToPreviewDataUrl } from "./preview-encode";
import type { PreviewUnitRange } from "./preview-units";
import { generateGridLayout } from "./grid-layout";
import { ensureStagePhotosDecoded, waitForSlotPhotosReady } from "./slot-photo-readiness";
import {
  evictSlotSnapshotCache,
  isValidRasterDataUrl,
  SLOT_SNAPSHOT_CACHE_LIMIT,
  SNAPSHOT_TARGET_WIDTH,
  snapshotSlotForPreview,
  yieldToMain,
} from "./slot-snapshot-cache";
import { MAGNET_TEXTURE_WIDTH_DEFAULT } from "./texture-resolution";
import { drawBrandBackFace } from "@/features/personalization/brand-back-pattern";
import { ensureCalendarTitleFontLoaded, resolveCalendarTitleFont } from "./calendar-card-preview";
import {
  defaultTextFillOnCard,
  frameBleedMargin,
  insetToMinMargin,
  instagramBackgroundHex,
  isDarkColor,
  isInstagramNoBorder,
  isInstagramTemplate,
  isSimpleCardTemplate,
  isStripBorderless,
  isStripTemplate,
  noBorderChromeSrc,
  photoBackingHexFor,
  simpleCardPhotoRect,
  stripPhotoRect,
  stripPositionOf,
} from "@/features/personalization/frame-palette";
import { igTextFill } from "@/features/personalization/instagram-template-spec";
import { clampPhotoScale, coverScaleBase } from "@/features/personalization/photo-fit";
import { getFilterParams } from "./photo-filters";
import type { CalendarFontKey } from "@/features/personalization/schemas";

export type SlotPreviewRenderOptions = {
  /** `true` si el producto admite capas de texto (ej. Polaroid). Default `true`. */
  allowText?: boolean;
  /** `true` cuando el producto ofrece `frameOptions` (tarjeta full-bleed con foto inserta). */
  frameFullBleed?: boolean;
  /**
   * 2026-11-10 (owner) — packs de fotoimanes: la página por pack (y el montaje
   * de un solo pack) usan la grilla BALANCEADA del preset por conteo
   * (generateGridLayout: 6 → 3×2), no el gridLayout crudo del canvas — un
   * modelo degenerado (unitSlots=1 por foto, legacy) dibujaba las 6 polaroids
   * apiladas en vertical o fuera del lienzo («solo se ve 1 de las 6»).
   * Nunca la pasa un producto tira (su grilla vertical continua manda).
   */
  packGrid?: boolean;
  /**
   * Refresco single-flight de URLs firmadas expiradas: si falla la carga de una
   * foto referenciada por `assetId`/`profileAssetId`, se invoca una sola vez y
   * se reintenta el slot con el `CanvasDataV2` actualizado.
   */
  refreshExpiredAssets?: () => Promise<CanvasDataV2 | null>;
};

type ProductShape = "rectangle" | "circle" | "heart" | "custom" | undefined;

/**
 * Traza la silueta física del producto (heart/circle/rectangle) directamente en
 * el contexto 2D (`beginPath`..`closePath`), sin depender de `Path2D` global
 * (compatible 1:1 en navegadores y en `@napi-rs/canvas` bajo Vitest).
 *
 * Coords del heart matchean el SVG clipPath inline de `studio-slot.tsx`
 * (M.3.b.UX.v13) y `production-render-canvas.ts`.
 */
function traceShapePath(
  ctx: CanvasRenderingContext2D,
  shape: ProductShape,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  ctx.beginPath();
  if (!shape || shape === "rectangle" || shape === "custom") {
    const r = Math.min(8, w / 12, h / 12);
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    return;
  }
  if (shape === "circle") {
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.closePath();
    return;
  }
  const sx = (n: number) => x + n * w;
  const sy = (n: number) => y + n * h;
  ctx.moveTo(sx(0.5), sy(0.82));
  ctx.bezierCurveTo(sx(0.28), sy(0.68), sx(0.06), sy(0.52), sx(0.06), sy(0.32));
  ctx.bezierCurveTo(sx(0.06), sy(0.18), sx(0.16), sy(0.08), sx(0.28), sy(0.08));
  ctx.bezierCurveTo(sx(0.38), sy(0.08), sx(0.44), sy(0.12), sx(0.5), sy(0.22));
  ctx.bezierCurveTo(sx(0.56), sy(0.12), sx(0.62), sy(0.08), sx(0.72), sy(0.08));
  ctx.bezierCurveTo(sx(0.84), sy(0.08), sx(0.94), sy(0.18), sx(0.94), sy(0.32));
  ctx.bezierCurveTo(sx(0.94), sy(0.52), sx(0.72), sy(0.68), sx(0.5), sy(0.82));
  ctx.closePath();
}

function traceRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  if (rr === 0) {
    ctx.rect(x, y, w, h);
    ctx.closePath();
    return;
  }
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// ──────────────────────────────────────────────────────────────────────────────
//  Motor Canvas2D por slot (1 solo <canvas> compartido + cache por referencia)
// ──────────────────────────────────────────────────────────────────────────────

type Slot2DCacheEntry = {
  slot: SlotState;
  unitTemplate: CanvasDataV1;
  borderColor: string | null;
  borderWidthFactor: number;
  shape: ProductShape;
  allowText: boolean;
  frameFullBleed: boolean;
  totalSlots: number;
  outW: number;
  outH: number;
  preferMaster: boolean;
  cssFilter: string | null;
  fontsStatus: string;
  dataUrl: string;
};

const slot2DCache = new Map<string, Slot2DCacheEntry>();
const templateAssetCache = new Map<string, Promise<HTMLImageElement | null>>();
let sharedSlotCanvas: HTMLCanvasElement | null = null;
let pixelProbeCanvas: HTMLCanvasElement | null = null;

/** Vacía los caches internos del renderer 2D (para tests). */
export function clearPreviewSlot2DCache(): void {
  slot2DCache.clear();
  templateAssetCache.clear();
}

function currentFontsStatus(): string {
  if (typeof document === "undefined") return "loaded";
  return document.fonts?.status ?? "loaded";
}

function loadTemplateAssetCached(src: string, width: number): Promise<HTMLImageElement | null> {
  const key = `${src}|${width}`;
  let pending = templateAssetCache.get(key);
  if (!pending) {
    pending = loadCanvasImage(src, width).then((img) => {
      if (!img) templateAssetCache.delete(key);
      return img;
    });
    templateAssetCache.set(key, pending);
  }
  return pending;
}

/** Convierte un preset de filtro Konva a cadena CSS `ctx.filter` equivalente (respaldo sin Konva). */
export function filterPresetToCss(filter: PhotoFilterPreset | null | undefined): string | null {
  const params = getFilterParams(filter);
  if (!params) return null;
  const parts: string[] = [];
  if (params.grayscale) parts.push("grayscale(1)");
  if (params.brightness !== 0) parts.push(`brightness(${Math.max(0, 1 + params.brightness)})`);
  if (params.contrast !== 0) parts.push(`contrast(${Math.max(0, 1 + params.contrast / 100)})`);
  if (params.saturation !== 0) parts.push(`saturate(${Math.max(0, 1 + params.saturation)})`);
  if (params.hue !== 0) parts.push(`hue-rotate(${params.hue}deg)`);
  return parts.length > 0 ? parts.join(" ") : null;
}

/**
 * Resuelve nombres de fuente cargados vía `next/font` (`--font-fredoka`, etc.)
 * para que `ctx.font` en el navegador dibuje la tipografía real de marca.
 */
function resolveCanvasFontStack(rawFamily: string): string {
  const lc = rawFamily.toLowerCase();
  const key: CalendarFontKey | null = lc.includes("fredoka")
    ? "fredoka"
    : lc.includes("caveat")
      ? "caveat"
      : lc.includes("baloo")
        ? "baloo2"
        : lc.includes("nunito")
          ? "nunito"
          : lc.includes("patrick")
            ? "patrick"
            : lc.includes("playfair")
              ? "playfair"
              : lc.includes("dancing")
                ? "dancing"
                : lc.includes("inter")
                  ? "inter"
                  : null;
  const resolved = key ? resolveCalendarTitleFont(key) : null;
  return resolved ? `"${resolved}", ${rawFamily}` : rawFamily;
}

function wrapCanvasTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const paragraphs = text.split("\n");
  if (!(maxWidth > 0)) return paragraphs;
  const lines: string[] = [];
  for (const para of paragraphs) {
    if (!para) {
      lines.push("");
      continue;
    }
    const words = para.split(/\s+/);
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (!current || ctx.measureText(candidate).width <= maxWidth) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }
  return lines.length > 0 ? lines : [text];
}

/**
 * Comprueba en una sonda 16×16 que un snapshot Konva tenga al menos un píxel
 * visible (`alpha > 0`). Detecta `toDataURL` transparentes cuando Chrome móvil
 * agota su presupuesto de memoria Canvas2D.
 */
function hasVisiblePixels(img: HTMLImageElement): boolean {
  if (typeof document === "undefined") return true;
  const w = 16;
  const h = 16;
  if (!pixelProbeCanvas) {
    pixelProbeCanvas = document.createElement("canvas");
    pixelProbeCanvas.width = w;
    pixelProbeCanvas.height = h;
  }
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = pixelProbeCanvas.getContext("2d", { willReadFrequently: true });
  } catch {
    return true;
  }
  if (!ctx || typeof ctx.getImageData !== "function") return true;
  try {
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    for (let i = 3; i < data.length; i += 4) {
      if ((data[i] ?? 0) > 0) return true;
    }
    return false;
  } catch {
    return true;
  }
}

export type RenderSlot2DInput = {
  unitTemplate: CanvasDataV1;
  slot: SlotState;
  totalSlots: number;
  shape?: ProductShape;
  borderColor?: string | null;
  borderWidthFactor?: number | null;
  allowText?: boolean;
  frameFullBleed?: boolean;
  targetWidth?: number;
  preferMaster?: boolean;
  cssFilter?: string | null;
};

/**
 * Renderiza un slot individual en Canvas2D puro (paridad 1:1 con `StudioSlot` y
 * `production-render-canvas.ts`), reutilizando un único `<canvas>` en fase
 * síncrona tras precargar los bitmaps necesarios.
 */
export async function renderSlotToDataUrl2D(
  input: RenderSlot2DInput,
): Promise<{ dataUrl: string; assetMissing: boolean }> {
  const {
    unitTemplate,
    slot,
    totalSlots,
    shape,
    borderColor = null,
    allowText = true,
    frameFullBleed = false,
    targetWidth = SNAPSHOT_TARGET_WIDTH,
    preferMaster = false,
    cssFilter = null,
  } = input;
  const borderWidthFactor = input.borderWidthFactor ?? 1;
  const stage = unitTemplate.stage;
  const maxDim = targetWidth > SNAPSHOT_TARGET_WIDTH ? 4096 : 1440;
  const scale = Math.min(
    targetWidth / Math.max(1, stage.width),
    maxDim / Math.max(1, stage.width, stage.height),
  );
  const outW = Math.max(1, Math.round(stage.width * scale));
  const outH = Math.max(1, Math.round(stage.height * scale));
  const fontsStatus = currentFontsStatus();
  const cacheKey = `${slot.slotIndex}:${outW}x${outH}:${preferMaster ? 1 : 0}`;

  const hit = slot2DCache.get(cacheKey);
  if (
    hit &&
    hit.slot === slot &&
    hit.unitTemplate === unitTemplate &&
    hit.borderColor === borderColor &&
    hit.borderWidthFactor === borderWidthFactor &&
    hit.shape === shape &&
    hit.allowText === allowText &&
    hit.frameFullBleed === frameFullBleed &&
    hit.totalSlots === totalSlots &&
    hit.preferMaster === preferMaster &&
    hit.cssFilter === cssFilter &&
    hit.fontsStatus === fontsStatus
  ) {
    slot2DCache.delete(cacheKey);
    slot2DCache.set(cacheKey, hit);
    return { dataUrl: hit.dataUrl, assetMissing: false };
  }

  const useFullStage = shape === "heart" || shape === "circle";
  const hasFrameCard = unitTemplate.layers.some((l) => l.type === "frame-card");
  const fullBleed = Boolean(borderColor) && frameFullBleed && !hasFrameCard && !useFullStage;
  const bleedMargin = fullBleed ? frameBleedMargin(stage, borderWidthFactor) : 0;
  const isIg = isInstagramTemplate(unitTemplate.layers);
  const simpleCard = isSimpleCardTemplate(unitTemplate.layers, {
    hasFrameCard,
    textIsVisible: allowText && unitTemplate.layers.some((l) => l.type === "text"),
  });
  const isStrip = isStripTemplate(unitTemplate as { gridCols?: unknown; gridGap?: unknown });
  const stripPosition = isStrip ? stripPositionOf(slot.slotIndex, totalSlots) : null;
  const bgLayerHex = (() => {
    const bg = unitTemplate.layers.find((l) => l.type === "background") as
      { color?: string } | undefined;
    return typeof bg?.color === "string" ? bg.color : "#FFFFFF";
  })();
  const frameCardFillHex = (() => {
    const fc = unitTemplate.layers.find((l) => l.type === "frame-card") as
      { fill?: string } | undefined;
    return typeof fc?.fill === "string" ? fc.fill : "#FFFFFF";
  })();
  const cardBgHex = isIg
    ? instagramBackgroundHex(borderColor ?? null, bgLayerHex)
    : fullBleed && borderColor
      ? borderColor
      : hasFrameCard
        ? (borderColor ?? frameCardFillHex)
        : bgLayerHex;
  const darkCardBg = isDarkColor(cardBgHex);
  const phForIg = unitTemplate.layers.find((l) => l.type === "image-placeholder") as
    ImagePlaceholderLayer | undefined;
  const noBorder = isIg ? isInstagramNoBorder(phForIg, stage) : false;
  const photoBackingHex = photoBackingHexFor({
    borderColor,
    backgroundHex: bgLayerHex,
    hasFrameCard,
    fullBleed,
    isIg,
    igNoBorder: noBorder,
    useFullStage,
  });

  // ── Fase 1 (async): precarga determinista de imágenes y fuentes ────────────
  const loadWidth = Math.max(outW, outH, 640);
  const loadSlotPhoto = async (
    primary: string | null | undefined,
    fallback: string | null | undefined,
  ): Promise<HTMLImageElement | null> => {
    if (primary) {
      const first = await loadCanvasImage(primary, loadWidth);
      if (first) return first;
    }
    if (fallback && fallback !== primary) {
      return loadCanvasImage(fallback, loadWidth);
    }
    return null;
  };

  const wantsMainPhoto = Boolean(slot.assetId || slot.assetUrl || slot.canvasUrl);
  const wantsProfilePhoto = Boolean(
    unitTemplate.layers.some((l) => l.type === "profile-photo") &&
    (slot.profileAssetId || slot.profileAssetUrl || slot.profileCanvasUrl),
  );

  const [mainPhotoImg, profilePhotoImg] = await Promise.all([
    wantsMainPhoto
      ? preferMaster
        ? loadSlotPhoto(slot.assetUrl, slot.canvasUrl)
        : loadSlotPhoto(slot.canvasUrl ?? slot.assetUrl, slot.assetUrl)
      : Promise.resolve(null),
    wantsProfilePhoto
      ? preferMaster
        ? loadSlotPhoto(slot.profileAssetUrl, slot.profileCanvasUrl)
        : loadSlotPhoto(slot.profileCanvasUrl ?? slot.profileAssetUrl, slot.profileAssetUrl)
      : Promise.resolve(null),
  ]);

  const assetLayerImgs = new Map<string, HTMLImageElement>();
  const assetPromises: Array<Promise<void>> = [];
  for (const layer of unitTemplate.layers) {
    if (layer.type !== "asset") continue;
    const al = layer as AssetLayer;
    if (!al.src) continue;
    const resolvedSrc = noBorderChromeSrc(al.src, isIg && noBorder, isIg && darkCardBg);
    assetPromises.push(
      loadTemplateAssetCached(resolvedSrc, loadWidth).then((img) => {
        if (img) assetLayerImgs.set(al.id, img);
      }),
    );
  }
  if (assetPromises.length > 0) {
    await Promise.all(assetPromises);
  }

  if (
    allowText &&
    typeof document !== "undefined" &&
    document.fonts &&
    unitTemplate.layers.some((l) => l.type === "text")
  ) {
    try {
      await document.fonts.ready;
    } catch {
      // Continuar con fuentes de respaldo si document.fonts rechaza.
    }
  }

  const assetMissing = (wantsMainPhoto && !mainPhotoImg) || (wantsProfilePhoto && !profilePhotoImg);

  // ── Fase 2 (100% síncrona): dibujo atómico sobre `sharedSlotCanvas` ────────
  if (!sharedSlotCanvas) {
    sharedSlotCanvas = document.createElement("canvas");
  }
  sharedSlotCanvas.width = outW;
  sharedSlotCanvas.height = outH;
  const ctx = sharedSlotCanvas.getContext("2d");
  if (!ctx) {
    throw new Error("No se pudo crear contexto canvas para renderizar el slot");
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, outW, outH);
  ctx.save();
  ctx.scale(outW / stage.width, outH / stage.height);

  for (const layer of unitTemplate.layers) {
    if (layer.type === "frame-card") {
      const fc = layer as FrameCardLayer;
      ctx.save();
      ctx.fillStyle = borderColor ?? fc.fill ?? "#FFFFFF";
      ctx.fillRect(0, 0, stage.width, stage.height);
      ctx.restore();
    } else if (layer.type === "background") {
      const bgColor = isIg ? cardBgHex : fullBleed && borderColor ? borderColor : bgLayerHex;
      ctx.save();
      if (useFullStage) {
        traceShapePath(ctx, shape, 0, 0, stage.width, stage.height);
        ctx.clip();
      }
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, stage.width, stage.height);
      ctx.restore();
    } else if (layer.type === "image-placeholder") {
      const phLayer = layer as ImagePlaceholderLayer;
      const phRaw = useFullStage
        ? { x: 0, y: 0, width: stage.width, height: stage.height, cornerRadius: 0 }
        : {
            x: Number(phLayer.x) || 0,
            y: Number(phLayer.y) || 0,
            width: Number(phLayer.width) || stage.width,
            height: Number(phLayer.height) || stage.height,
            cornerRadius: Number(phLayer.cornerRadius) || 0,
          };
      let ph = phRaw;
      if (frameFullBleed && simpleCard && !useFullStage) {
        ph = {
          ...simpleCardPhotoRect(
            stage,
            borderColor ?? null,
            frameBleedMargin(stage, borderWidthFactor),
          ),
          cornerRadius: 0,
        };
      } else if (fullBleed && borderColor && !useFullStage && !isIg) {
        ph = {
          ...insetToMinMargin(phRaw, stage, bleedMargin),
          cornerRadius: phRaw.cornerRadius,
        };
      }
      if (stripPosition) {
        ph = {
          ...stripPhotoRect(ph, stage, stripPosition, {
            borderless: isStripBorderless(ph, stage),
            borderWidthFactor,
          }),
          cornerRadius: ph.cornerRadius,
        };
      }

      const imgW = mainPhotoImg ? mainPhotoImg.naturalWidth || mainPhotoImg.width : 0;
      const imgH = mainPhotoImg ? mainPhotoImg.naturalHeight || mainPhotoImg.height : 0;
      if (mainPhotoImg && imgW > 0 && imgH > 0) {
        const rot = (((slot.photoTransform?.rotation ?? 0) % 360) + 360) % 360;
        const swapDims = rot === 90 || rot === 270;
        const srcW = swapDims ? imgH : imgW;
        const srcH = swapDims ? imgW : imgH;
        const coverBase = coverScaleBase(ph.width, ph.height, srcW, srcH);
        const effectiveScale = clampPhotoScale(slot.photoTransform?.scale ?? 1);
        const finalScale = coverBase * effectiveScale;
        const renderedW = imgW * finalScale;
        const renderedH = imgH * finalScale;
        const offX = slot.photoTransform?.offsetX ?? 0;
        const offY = slot.photoTransform?.offsetY ?? 0;
        const layerRot = Number(phLayer.rotation) || 0;
        const fullStageWindow =
          phRaw.x <= 0 &&
          phRaw.y <= 0 &&
          phRaw.x + phRaw.width >= stage.width &&
          phRaw.y + phRaw.height >= stage.height;
        const clipRadius = fullStageWindow ? 0 : ph.cornerRadius;

        ctx.save();
        if (layerRot !== 0 && !useFullStage) {
          const gcx = ph.x + ph.width / 2;
          const gcy = ph.y + ph.height / 2;
          ctx.translate(gcx, gcy);
          ctx.rotate((layerRot * Math.PI) / 180);
          ctx.translate(-gcx, -gcy);
        }
        if (useFullStage) {
          traceShapePath(ctx, shape, 0, 0, stage.width, stage.height);
        } else if (clipRadius > 0) {
          traceRoundRect(ctx, ph.x, ph.y, ph.width, ph.height, clipRadius);
        } else {
          ctx.beginPath();
          ctx.rect(ph.x, ph.y, ph.width, ph.height);
        }
        ctx.clip();
        if (photoBackingHex) {
          ctx.fillStyle = photoBackingHex;
          ctx.fillRect(ph.x, ph.y, ph.width, ph.height);
        }
        if (cssFilter) {
          ctx.filter = cssFilter;
        }
        const cx = ph.x + ph.width / 2 + offX;
        const cy = ph.y + ph.height / 2 + offY;
        if (rot !== 0) {
          ctx.translate(cx, cy);
          ctx.rotate((rot * Math.PI) / 180);
          ctx.drawImage(mainPhotoImg, -renderedW / 2, -renderedH / 2, renderedW, renderedH);
        } else {
          ctx.drawImage(mainPhotoImg, cx - renderedW / 2, cy - renderedH / 2, renderedW, renderedH);
        }
        ctx.filter = "none";
        ctx.restore();
      } else {
        // Slot vacío (ej. escena 3D abierta antes de llenar todos los slots):
        // mismo placeholder lila `#F4ECFF` que `ImagePlaceholder` en `studio-slot.tsx`.
        ctx.save();
        if (useFullStage) {
          traceShapePath(ctx, shape, 0, 0, stage.width, stage.height);
        } else if (ph.cornerRadius > 0) {
          traceRoundRect(ctx, ph.x, ph.y, ph.width, ph.height, ph.cornerRadius);
        } else {
          ctx.beginPath();
          ctx.rect(ph.x, ph.y, ph.width, ph.height);
        }
        ctx.clip();
        ctx.fillStyle = "#F4ECFF";
        ctx.fillRect(ph.x, ph.y, ph.width, ph.height);
        ctx.strokeStyle = "#7C6AAD";
        ctx.lineWidth = 2;
        ctx.setLineDash([12, 8]);
        if (useFullStage) {
          traceShapePath(ctx, shape, 1, 1, stage.width - 2, stage.height - 2);
        } else {
          traceRoundRect(
            ctx,
            ph.x + 1,
            ph.y + 1,
            Math.max(0, ph.width - 2),
            Math.max(0, ph.height - 2),
            Math.max(0, ph.cornerRadius - 1),
          );
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
    } else if (layer.type === "asset") {
      const al = layer as AssetLayer;
      const frameImg = assetLayerImgs.get(al.id);
      if (!frameImg) continue;
      ctx.save();
      ctx.globalAlpha = Number(al.opacity ?? 1);
      const fx = Number(al.x) || 0;
      const fy = Number(al.y) || 0;
      const fw = Number(al.width) || stage.width;
      const fh = Number(al.height) || stage.height;
      const rot = Number(al.rotation) || 0;
      if (rot !== 0) {
        ctx.translate(fx, fy);
        ctx.rotate((rot * Math.PI) / 180);
        ctx.drawImage(frameImg, 0, 0, fw, fh);
      } else {
        ctx.drawImage(frameImg, fx, fy, fw, fh);
      }
      ctx.restore();
    } else if (layer.type === "profile-photo") {
      if (!profilePhotoImg) continue;
      const pl = layer as ProfilePhotoLayer;
      const pImgW = profilePhotoImg.naturalWidth || profilePhotoImg.width;
      const pImgH = profilePhotoImg.naturalHeight || profilePhotoImg.height;
      if (!(pImgW > 0 && pImgH > 0)) continue;
      const d = pl.radius * 2;
      const pScale = Math.max(d / pImgW, d / pImgH) * (slot.profileTransform?.scale ?? 1);
      const pw = pImgW * pScale;
      const phh = pImgH * pScale;
      const gx = pl.x - pl.radius;
      const gy = pl.y - pl.radius;
      const imgX = gx + (d - pw) / 2 + (slot.profileTransform?.offsetX ?? 0);
      const imgY = gy + (d - phh) / 2 + (slot.profileTransform?.offsetY ?? 0);
      ctx.save();
      ctx.beginPath();
      ctx.arc(pl.x, pl.y, pl.radius, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(profilePhotoImg, imgX, imgY, pw, phh);
      ctx.restore();
    } else if (layer.type === "shape") {
      const sl = layer as ShapeLayer;
      ctx.save();
      if (sl.kind === "circle") {
        ctx.beginPath();
        ctx.arc(sl.x, sl.y, Math.min(sl.width, sl.height) / 2, 0, Math.PI * 2);
        ctx.closePath();
      } else if (sl.kind === "heart") {
        traceShapePath(
          ctx,
          "heart",
          sl.x - sl.width / 2,
          sl.y - sl.height / 2,
          sl.width,
          sl.height,
        );
      } else {
        traceRoundRect(
          ctx,
          sl.x - sl.width / 2,
          sl.y - sl.height / 2,
          sl.width,
          sl.height,
          sl.cornerRadius ?? 0,
        );
      }
      if (sl.fill) {
        ctx.fillStyle = sl.fill;
        ctx.fill();
      }
      if (sl.stroke && (sl.strokeWidth ?? 0) > 0) {
        ctx.strokeStyle = sl.stroke;
        ctx.lineWidth = sl.strokeWidth ?? 0;
        ctx.stroke();
      }
      ctx.restore();
    } else if (layer.type === "text") {
      const tl = layer as TextLayer;
      if ((useFullStage && tl.allowOnShape !== true) || !allowText) continue;
      const override = slot.textOverrides?.[tl.id];
      const customerText =
        typeof override?.text === "string" && override.text.trim() !== ""
          ? override.text
          : undefined;
      if (tl.editable === true && customerText === undefined) continue;
      const finalText = customerText ?? tl.text ?? "";
      if (!finalText.trim()) continue;

      const fontSize = override?.fontSize ?? tl.fontSize ?? 48;
      const rawFamily = override?.fontFamily ?? tl.fontFamily ?? "Fredoka, Inter, sans-serif";
      const family = resolveCanvasFontStack(rawFamily);
      const defaultFill = isIg
        ? igTextFill(tl.id, tl.fill, darkCardBg)
        : defaultTextFillOnCard(cardBgHex, tl.fill);
      const fill = override?.fill ?? defaultFill ?? tl.fill ?? "#3D2E5C";
      const weight = override?.fontWeight ?? tl.fontWeight ?? "normal";
      const align = tl.align ?? "center";
      const customWidth = typeof tl.width === "number" && tl.width > 0 ? tl.width : null;
      const wrapWidth = customWidth ?? (align === "center" ? stage.width : 0);

      ctx.save();
      ctx.font = `${weight} ${fontSize}px ${family}`;
      ctx.textBaseline = "top";
      ctx.textAlign = customWidth === null && align !== "center" ? "left" : align;
      const layerX = Number(tl.x) || 0;
      const x =
        customWidth === null
          ? align === "center"
            ? stage.width / 2
            : layerX
          : layerX + (align === "center" ? customWidth / 2 : align === "right" ? customWidth : 0);
      const y = (Number(tl.y) || 0) - fontSize / 2;
      const rotationOriginX = customWidth === null && align === "center" ? 0 : layerX;
      const rotation = Number(tl.rotation) || 0;
      const lines = wrapCanvasTextLines(ctx, finalText, wrapWidth);

      ctx.fillStyle = fill;
      if (rotation !== 0) {
        ctx.translate(rotationOriginX, y);
        ctx.rotate((rotation * Math.PI) / 180);
        lines.forEach((line, idx) => {
          ctx.fillText(line, x - rotationOriginX, idx * fontSize);
        });
      } else {
        lines.forEach((line, idx) => {
          ctx.fillText(line, x, y + idx * fontSize);
        });
      }
      ctx.restore();
    }
  }

  if (borderColor && !useFullStage && !hasFrameCard && !fullBleed) {
    const phLayer = unitTemplate.layers.find((l) => l.type === "image-placeholder") as
      ImagePlaceholderLayer | undefined;
    if (phLayer) {
      const ph = {
        x: Number(phLayer.x) || 0,
        y: Number(phLayer.y) || 0,
        width: Number(phLayer.width) || stage.width,
        height: Number(phLayer.height) || stage.height,
        cornerRadius: Number(phLayer.cornerRadius) || 0,
      };
      const w = Math.max(6, Math.round(stage.width * 0.04));
      const fullStageWindow =
        ph.x <= 0 &&
        ph.y <= 0 &&
        ph.x + ph.width >= stage.width &&
        ph.y + ph.height >= stage.height;
      ctx.save();
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = w;
      traceRoundRect(
        ctx,
        ph.x + w / 2,
        ph.y + w / 2,
        Math.max(0, ph.width - w),
        Math.max(0, ph.height - w),
        fullStageWindow ? 0 : Math.max(0, ph.cornerRadius - w / 2),
      );
      ctx.stroke();
      ctx.restore();
    }
  }

  ctx.restore();
  const dataUrl = sharedSlotCanvas.toDataURL("image/png");

  if (!assetMissing && isValidRasterDataUrl(dataUrl)) {
    if (slot2DCache.size >= SLOT_SNAPSHOT_CACHE_LIMIT && !slot2DCache.has(cacheKey)) {
      const oldest = slot2DCache.keys().next().value;
      if (oldest !== undefined) slot2DCache.delete(oldest);
    }
    slot2DCache.set(cacheKey, {
      slot,
      unitTemplate,
      borderColor,
      borderWidthFactor,
      shape,
      allowText,
      frameFullBleed,
      totalSlots,
      outW,
      outH,
      preferMaster,
      cssFilter,
      fontsStatus,
      dataUrl,
    });
  }

  return { dataUrl, assetMissing };
}

/**
 * Renderiza un lote de slots para preview/3D:
 *   - Sin filtro (`!slot.filter`): va directo por `renderSlotToDataUrl2D` (no
 *     necesita `<Stage>` Konva montado).
 *   - Con filtro (`slot.filter`): usa `snapshotSlotForPreview` sobre el `<Stage>`
 *     cuando existe y contiene píxeles visibles (`hasVisiblePixels`), cayendo a
 *     `renderSlotToDataUrl2D` con `ctx.filter` si el stage falta o devolvió un
 *     raster transparente.
 *   - Si alguna URL firmada expiró (`assetMissing`), refresca una sola vez vía
 *     `renderOpts.refreshExpiredAssets` y reintenta ese slot.
 */
async function renderSlotsToImages(
  canvasData: CanvasDataV2,
  targetSlots: SlotState[],
  stages: Map<number, Konva.Stage | null>,
  shape: ProductShape,
  renderOpts?: SlotPreviewRenderOptions,
): Promise<Map<number, HTMLImageElement>> {
  let activeCanvas = canvasData;
  const totalSlots = canvasData.slots.length;
  let refreshPromise: Promise<CanvasDataV2 | null> | null = null;
  const refreshOnce = (): Promise<CanvasDataV2 | null> => {
    if (!renderOpts?.refreshExpiredAssets) return Promise.resolve(null);
    if (!refreshPromise) {
      refreshPromise = renderOpts.refreshExpiredAssets().catch(() => null);
    }
    return refreshPromise;
  };

  const filteredWithStage = targetSlots.filter(
    (s) => Boolean(s.filter) && stages.get(s.slotIndex) != null,
  );
  if (filteredWithStage.length > 0) {
    await waitForSlotPhotosReady(filteredWithStage, stages);
  }

  const out = new Map<number, HTMLImageElement>();
  for (const initialSlot of targetSlots) {
    const slot =
      activeCanvas.slots.find((s) => s.slotIndex === initialSlot.slotIndex) ?? initialSlot;

    if (slot.filter) {
      const stage = stages.get(slot.slotIndex);
      if (stage) {
        await ensureStagePhotosDecoded(stage, slot);
        const konvaUrl = snapshotSlotForPreview(stage, slot, {
          unitTemplate: activeCanvas.unitTemplate,
          borderColor: activeCanvas.borderColor ?? null,
          borderWidthFactor: activeCanvas.borderWidthFactor ?? null,
        });
        if (isValidRasterDataUrl(konvaUrl)) {
          const konvaImg = await loadImage(konvaUrl).catch(() => null);
          if (konvaImg && hasVisiblePixels(konvaImg)) {
            out.set(slot.slotIndex, konvaImg);
            await yieldToMain();
            continue;
          }
        }
        evictSlotSnapshotCache(slot.slotIndex);
      }
    }

    const cssFilter = slot.filter ? filterPresetToCss(slot.filter) : null;
    let rendered = await renderSlotToDataUrl2D({
      unitTemplate: activeCanvas.unitTemplate,
      slot,
      totalSlots,
      shape,
      borderColor: activeCanvas.borderColor ?? null,
      borderWidthFactor: activeCanvas.borderWidthFactor ?? null,
      allowText: renderOpts?.allowText,
      frameFullBleed: renderOpts?.frameFullBleed,
      cssFilter,
    });

    if (rendered.assetMissing && renderOpts?.refreshExpiredAssets) {
      const refreshedCanvas = await refreshOnce();
      if (refreshedCanvas) {
        activeCanvas = refreshedCanvas;
        const freshSlot = refreshedCanvas.slots.find((s) => s.slotIndex === slot.slotIndex) ?? slot;
        rendered = await renderSlotToDataUrl2D({
          unitTemplate: refreshedCanvas.unitTemplate,
          slot: freshSlot,
          totalSlots: refreshedCanvas.slots.length,
          shape,
          borderColor: refreshedCanvas.borderColor ?? null,
          borderWidthFactor: refreshedCanvas.borderWidthFactor ?? null,
          allowText: renderOpts.allowText,
          frameFullBleed: renderOpts.frameFullBleed,
          cssFilter,
        });
      }
    }

    const img = await loadImage(rendered.dataUrl);
    out.set(slot.slotIndex, img);
    await yieldToMain();
  }

  return out;
}

/**
 * ADR-063 FOTO1/T3 — recorta un snapshot de producción (ya limpio, sin realismo) a la SILUETA
 * física para heart/circle, dejando transparente afuera → la imprenta troquela por ese borde.
 * Rectángulo/custom no se tocan (el corte lo da el propio borde del PNG). Se usa en el fallback de
 * cliente (slots con filtro, que el render server-side no reproduce): así un corazón con filtro
 * imprime como corazón, igual que el corazón sin filtro (que sí pasa por el compositor canvas).
 */
export async function clipProductionSnapshotToShape(
  dataUrl: string,
  shape: "rectangle" | "circle" | "heart" | "custom" | undefined,
): Promise<string> {
  if (!shape || shape === "rectangle" || shape === "custom") return dataUrl;
  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext("2d");
      if (!ctx) {
        reject(new Error("No se pudo crear contexto canvas para recorte de silueta"));
        return;
      }
      ctx.save();
      traceShapePath(ctx, shape, 0, 0, c.width, c.height);
      ctx.clip();
      ctx.drawImage(img, 0, 0, c.width, c.height);
      ctx.restore();
      resolve(c.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("No se pudo cargar snapshot para recorte de silueta"));
    img.src = dataUrl;
  });
}

/**
 * Componer preview del grid completo via Canvas API nativo. Renderiza cada slot
 * con `renderSlotsToImages` (Canvas2D directo desde `CanvasDataV2`, sin exigir
 * stages Konva montados salvo que el slot tenga filtro) y los apila en un mosaico
 * con el `gridLayout`. Resultado: 1 imagen WebP/JPEG que muestra modal y carrito.
 */
export async function buildCompositedPreview(
  canvasData: CanvasDataV2,
  stages: Map<number, Konva.Stage | null>,
  shape?: "rectangle" | "circle" | "heart" | "custom",
  opts?: { unitRange?: PreviewUnitRange } & SlotPreviewRenderOptions,
): Promise<string> {
  const { gridLayout, unitTemplate, slots } = canvasData;
  const range = opts?.unitRange;
  const rangeSlots = range
    ? slots.filter((s) => s.slotIndex >= range.start && s.slotIndex < range.end)
    : slots;
  const slotImages = await renderSlotsToImages(canvasData, rangeSlots, stages, shape, opts);
  const packGrid = opts?.packGrid === true;
  const unitSlots = range ? rangeSlots.length : (canvasData.unitSlots ?? slots.length);
  // packGrid: el montaje completo del pack es una grilla PLANA balanceada (el
  // modelo unitCount×unitSlots de los packs NO apila por unidad — cada imán es
  // su pieza; apilar por unidad degenerada producía la columna vertical).
  const unitCount = range || packGrid ? 1 : (canvasData.unitCount ?? 1);
  const multiUnit = !range && unitCount > 1;
  // Cell size: 360×(360 * aspect) por slot en el preview
  const cellW = 360;
  const cellH = Math.floor(360 * (unitTemplate.stage.height / unitTemplate.stage.width));
  const packLayout = packGrid
    ? generateGridLayout(range ? rangeSlots.length : slots.length, unitTemplate.stage)
    : null;
  const gap = packLayout?.gap ?? gridLayout.gap;
  const layoutCols = packLayout
    ? packLayout.cols
    : range
      ? Math.max(1, Math.min(gridLayout.cols, rangeSlots.length))
      : gridLayout.cols;
  const layoutRows = packLayout
    ? Math.max(1, Math.ceil((range ? rangeSlots.length : slots.length) / layoutCols))
    : range
      ? Math.max(1, Math.ceil(rangeSlots.length / layoutCols))
      : gridLayout.rows;
  const isStripPreview = layoutCols === 1 && gridLayout.gap === 0 && rangeSlots.length > 1;
  const unitGap = 32;
  const unitGridW = layoutCols * cellW + (layoutCols - 1) * gap;
  const unitGridH = layoutRows * cellH + (layoutRows - 1) * gap;
  const canvasW =
    multiUnit && isStripPreview ? unitCount * unitGridW + (unitCount - 1) * unitGap : unitGridW;
  const canvasH =
    multiUnit && !isStripPreview ? unitCount * unitGridH + (unitCount - 1) * unitGap : unitGridH;

  const compositeCanvas = document.createElement("canvas");
  compositeCanvas.width = canvasW;
  compositeCanvas.height = canvasH;
  const ctx = compositeCanvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo crear contexto canvas para preview");

  ctx.fillStyle = "#FFF8F0";
  ctx.fillRect(0, 0, canvasW, canvasH);

  for (const slot of rangeSlots) {
    const img = slotImages.get(slot.slotIndex);
    if (!img) continue;
    const indexInUnit = multiUnit
      ? slot.slotIndex % unitSlots
      : slot.slotIndex - (range?.start ?? 0);
    const unitIndex = multiUnit ? Math.floor(slot.slotIndex / unitSlots) : 0;
    const col = indexInUnit % layoutCols;
    const row = Math.floor(indexInUnit / layoutCols);
    const unitOffsetX = multiUnit && isStripPreview ? unitIndex * (unitGridW + unitGap) : 0;
    const unitOffsetY = multiUnit && !isStripPreview ? unitIndex * (unitGridH + unitGap) : 0;
    const x = unitOffsetX + col * (cellW + gap);
    const y = unitOffsetY + row * (cellH + gap);
    ctx.save();
    traceShapePath(ctx, shape, x, y, cellW, cellH);
    ctx.clip();
    ctx.drawImage(img, x, y, cellW, cellH);
    ctx.restore();
    if (!isStripPreview) {
      ctx.save();
      ctx.strokeStyle = "rgba(124, 106, 173, 0.7)";
      ctx.lineWidth = 2.5;
      traceShapePath(ctx, shape, x, y, cellW, cellH);
      ctx.stroke();
      ctx.restore();
    }
  }

  if (isStripPreview) {
    for (let u = 0; u < unitCount; u++) {
      const ox = multiUnit ? u * (unitGridW + unitGap) : 0;
      ctx.save();
      ctx.strokeStyle = "rgba(124, 106, 173, 0.7)";
      ctx.lineWidth = 2.5;
      ctx.strokeRect(ox + 1.25, 1.25, unitGridW - 2.5, unitGridH - 2.5);
      ctx.restore();
    }
  }

  return canvasToPreviewDataUrl(compositeCanvas);
}

/**
 * Ola 3 (Lucy 2026-07-22) — Preview de confirmación para SEPARADORES 2 CARAS:
 * una TIRA DESPLEGADA por unidad física sobre fondo crema. Es el espejo
 * pequeño de la pieza física que el cliente va a recibir, no una grilla de
 * caras sueltas. Las esquinas exteriores se redondean (troquel).
 *
 * 2026-09-22 — orientación REAL del doblez (feedback QA STG): el separador
 * plegable se pliega por la MITAD de la tira vertical (2×12: 2cm ancho × 12cm
 * alto, doblez en la punta de 2cm) → la tira del preview es VERTICAL con filete
 * de doblez HORIZONTAL en la unión. Las unidades se disponen lado a lado en el
 * montaje.
 * 2026-09-25 (corrección del owner — la convención anterior A arriba/B abajo
 * estaba mal) — geometría "CABEZAS AL DOBLEZ": Cara B en la MITAD SUPERIOR
 * ROTADA 180°, Cara A en la MITAD INFERIOR DERECHA. El separador cuelga del
 * borde superior de la página; con ambas cabezas apuntando al doblez, las dos
 * caras se leen derechas al doblar. EXACTAMENTE como producción
 * (composeFaceStrips) y el libro 3D. Bonus UX: la cara principal (A) se ve
 * derecha en la preview. El texto del modal dice "así se imprime la tira" y la
 * imagen la heredan carrito/admin/correos → fidelidad total a imprenta.
 *  - noFold (Alargados planos): la pieza no se pliega → caras lado a lado
 *    (frente | reverso, B SIN rotar — montaje espalda con espalda) y unidades
 *    apiladas, SIN filete de doblez.
 *  - backOptional: una cara B vacía se dibuja con el PATRÓN DE MARCA «Lucams»
 *    (REGLA ÚNICA, decisión owner 2026-11-03 — supersede el blanco del
 *    2026-10-07, que a su vez revirtió la regla espejo del Paquete A/D
 *    2026-10-02; producción genera el PNG con el MISMO patrón en
 *    default-back-face.ts; el slot efectivo lo resuelve
 *    previewFacePairOfUnit: faceB = null → drawBrandBackFace),
 *    nunca espejo de la cara A ni con el placeholder del editor.
 *  - foldCaption: indicación del tamaño desplegado bajo cada tira (texto CMS
 *    ya resuelto por el caller, ej. "Doblez · Desplegado: 2×12 cm").
 *  - shape/faceCaptions: `buildOrnamentPreview` reutiliza el montaje noFold para
 *    mostrar frente y reverso circulares de una bola, sin doblez ni rotación.
 */
export async function buildBookmarkStripPreview(
  canvasData: CanvasDataV2,
  stages: Map<number, Konva.Stage | null>,
  cornerRadiusPx?: number,
  opts?: {
    noFold?: boolean;
    backOptional?: boolean;
    foldCaption?: string;
    unitIndex?: number;
    shape?: "rectangle" | "circle" | "heart" | "custom";
    faceCaptions?: { faceA: string; faceB: string };
  } & SlotPreviewRenderOptions,
): Promise<string> {
  const { unitTemplate, slots } = canvasData;
  const noFold = opts?.noFold === true;
  const backOptional = opts?.backOptional === true;
  const foldCaption = opts?.foldCaption;
  const shape = opts?.shape;
  const faceCaptions = opts?.faceCaptions;
  const totalUnits = Math.floor(slots.length / 2);
  const unitIndexes =
    opts?.unitIndex !== undefined
      ? [Math.min(Math.max(0, opts.unitIndex), Math.max(0, totalUnits - 1))]
      : Array.from({ length: totalUnits }, (_, u) => u);
  const units = unitIndexes.length;
  const unitFaces: Array<{ faceA: number; faceB: number | null }> = [];
  const faceSlotIndices = new Set<number>();
  for (const unit of unitIndexes) {
    const pair = previewFacePairOfUnit(slots, unit, backOptional);
    unitFaces.push(pair);
    faceSlotIndices.add(pair.faceA);
    if (pair.faceB !== null) faceSlotIndices.add(pair.faceB);
  }
  const targetFaceSlots = slots.filter((s) => faceSlotIndices.has(s.slotIndex));
  const faceImages = await renderSlotsToImages(canvasData, targetFaceSlots, stages, shape, opts);

  const faceW = 300;
  const faceH = Math.round(faceW * (unitTemplate.stage.height / unitTemplate.stage.width));
  const pad = 24;
  const gap = 18;
  const faceGap = shape === "circle" && noFold ? gap : 0;
  const captionH = foldCaption ? 20 : 0;
  const faceCaptionH = faceCaptions ? 24 : 0;
  const stripW = noFold ? faceW * 2 + faceGap : faceW;
  const stripH = noFold ? faceH : faceH * 2;
  const canvasW = noFold ? stripW + pad * 2 : pad * 2 + units * stripW + (units - 1) * gap;
  const canvasH = noFold
    ? pad * 2 + units * (stripH + faceCaptionH + captionH) + (units - 1) * gap
    : pad * 2 + stripH + faceCaptionH + captionH;

  const compositeCanvas = document.createElement("canvas");
  compositeCanvas.width = canvasW;
  compositeCanvas.height = canvasH;
  const ctx = compositeCanvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo crear contexto canvas para preview de tiras");

  ctx.fillStyle = "#FFF8F0";
  ctx.fillRect(0, 0, canvasW, canvasH);

  const scale = faceW / unitTemplate.stage.width;
  const radius = Math.max(6, Math.round((cornerRadiusPx ?? 0) * scale));

  const brandBackFont = unitFaces.some((p) => p.faceB === null)
    ? ((await ensureCalendarTitleFontLoaded("dancing")) ?? undefined)
    : undefined;

  for (let ui = 0; ui < unitIndexes.length; ui++) {
    const { faceA, faceB } = unitFaces[ui]!;
    const x = noFold ? pad : pad + ui * (stripW + gap);
    const y = noFold ? pad + ui * (stripH + faceCaptionH + captionH + gap) : pad;
    const faceRect = (i: number) =>
      noFold
        ? { fx: x + i * (faceW + faceGap), fy: y, fw: faceW, fh: faceH }
        : { fx: x, fy: y + (1 - i) * faceH, fw: faceW, fh: faceH };
    ctx.save();
    if (shape !== "circle") {
      traceRoundRect(ctx, x, y, stripW, stripH, radius);
      ctx.clip();
    }
    for (const [i, slotIndex] of [faceA, faceB].entries()) {
      const { fx, fy, fw, fh } = faceRect(i);
      if (slotIndex === null) {
        ctx.save();
        ctx.translate(fx, fy);
        traceShapePath(ctx, shape, 0, 0, fw, fh);
        ctx.clip();
        drawBrandBackFace(ctx, fw, fh, brandBackFont);
        ctx.restore();
        continue;
      }
      const img = faceImages.get(slotIndex);
      if (!img) continue;
      ctx.save();
      if (shape) {
        traceShapePath(ctx, shape, fx, fy, fw, fh);
        ctx.clip();
      }
      if (!noFold && i === 1) {
        ctx.translate(fx + fw / 2, fy + fh / 2);
        ctx.rotate(Math.PI);
        ctx.drawImage(img, -fw / 2, -fh / 2, fw, fh);
      } else {
        ctx.drawImage(img, fx, fy, fw, fh);
      }
      ctx.restore();
    }
    ctx.restore();
    ctx.save();
    if (noFold) {
      ctx.strokeStyle = "rgba(124, 106, 173, 0.45)";
      ctx.lineWidth = 1.5;
      for (const i of [0, 1]) {
        const { fx, fy, fw, fh } = faceRect(i);
        if (shape === "circle") {
          traceShapePath(ctx, shape, fx + 0.75, fy + 0.75, fw - 1.5, fh - 1.5);
          ctx.stroke();
        } else {
          traceRoundRect(ctx, fx + 0.75, fy + 0.75, fw - 1.5, fh - 1.5, Math.max(4, radius - 1));
          ctx.stroke();
        }
      }
    }
    if (!noFold) {
      ctx.strokeStyle = "rgba(124, 106, 173, 0.55)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x + 4, y + faceH);
      ctx.lineTo(x + faceW - 4, y + faceH);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (shape !== "circle") {
      ctx.strokeStyle = "rgba(124, 106, 173, 0.7)";
      ctx.lineWidth = 2;
      traceRoundRect(ctx, x, y, stripW, stripH, radius);
      ctx.stroke();
    }
    ctx.restore();
    if (faceCaptions) {
      ctx.save();
      ctx.fillStyle = "rgba(60, 45, 100, 0.85)";
      ctx.font = "600 12px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      for (const [i, slotIndex] of [faceA, faceB].entries()) {
        if (slotIndex === null) continue;
        const { fx, fy, fw, fh } = faceRect(i);
        ctx.fillText(i === 0 ? faceCaptions.faceA : faceCaptions.faceB, fx + fw / 2, fy + fh + 16);
      }
      ctx.restore();
    }
    if (foldCaption) {
      ctx.save();
      ctx.fillStyle = "rgba(60, 45, 100, 0.85)";
      ctx.font = "600 12px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(foldCaption, x + stripW / 2, y + stripH + faceCaptionH + 14);
      ctx.restore();
    }
  }

  return canvasToPreviewDataUrl(compositeCanvas);
}

export async function buildOrnamentPreview(
  canvasData: CanvasDataV2,
  stages: Map<number, Konva.Stage | null>,
  faceCaptions: { faceA: string; faceB: string },
  unitIndex?: number,
  renderOpts?: SlotPreviewRenderOptions,
): Promise<string> {
  return buildBookmarkStripPreview(canvasData, stages, 0, {
    noFold: true,
    shape: "circle",
    faceCaptions,
    unitIndex,
    ...renderOpts,
  });
}

/**
 * Ola 6 (Lucy 2026-07-23) — Tiras magnéticas photobooth: la pieza física es UNA tira continua
 * con N fotos apiladas verticalmente. En la nevera 3D no queremos N imanes sueltos; combinamos
 * los slots de cada tira en un solo Magnet3D con su textura vertical y proporción de tira.
 *
 * El `sizeCm` del producto ya describe la TIRA COMPLETA (p. ej. 5×15 cm), no cada celda, así que
 * conservamos `wCm`/`hCm` tal cual si vienen. El alto de la textura combinada sí crece con la
 * cantidad de fotos (`hRatio *= chunk.length`), de modo que `magnetWorldSizes` derive el tamaño
 * físico respetando el aspecto real de la textura sin deformarla.
 */
export async function combineStripTextures(
  magnets: Magnet3D[],
  slotsPerStrip: number,
): Promise<Magnet3D[]> {
  if (magnets.length <= 1) return magnets;
  const out: Magnet3D[] = [];
  for (let i = 0; i < magnets.length; i += slotsPerStrip) {
    const chunk = magnets.slice(i, i + slotsPerStrip);
    if (chunk.length === 1) {
      out.push(chunk[0]!);
      continue;
    }
    const first = chunk[0]!;
    const images = await Promise.all(chunk.map((m) => loadImage(m.dataUrl)));
    const w = images[0]!.naturalWidth;
    const h = images[0]!.naturalHeight;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h * images.length;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("No se pudo crear contexto canvas para tira 3D");
    images.forEach((img, idx) => ctx.drawImage(img, 0, h * idx));
    out.push({
      dataUrl: c.toDataURL("image/png"),
      wRatio: first.wRatio,
      hRatio: first.hRatio * chunk.length,
      shape: first.shape,
      // El fallback sizeCm del producto describe la tira completa; no duplicamos medidas.
      wCm: first.wCm,
      hCm: first.hCm,
      cornerRadiusRatio: first.cornerRadiusRatio,
    });
  }
  return out;
}

/**
 * Ola 6 (Lucy 2026-07-23) — Separadores rectangulares: el lienzo del Estudio es horizontal
 * (cara A/B una al lado de la otra), pero en el libro 3D la tira doblada se pone de PIE
 * (largo a lo largo del borde). Rotamos 90° la textura y el lienzo para que el diseño se
 * lea derecho sobre la cara 2×6 cm (o 4.2×4 cm) sin deformarse.
 */
export async function rotateTextures90(magnets: Magnet3D[]): Promise<Magnet3D[]> {
  return Promise.all(
    magnets.map(async (m) => {
      const img = await loadImage(m.dataUrl);
      const c = document.createElement("canvas");
      c.width = img.naturalHeight;
      c.height = img.naturalWidth;
      const ctx = c.getContext("2d");
      if (!ctx) throw new Error("No se pudo crear contexto canvas para rotar textura");
      ctx.translate(c.width / 2, c.height / 2);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
      return {
        ...m,
        dataUrl: c.toDataURL("image/png"),
        wRatio: m.hRatio,
        hRatio: m.wRatio,
      };
    }),
  );
}

// P1.4 — Genera una textura PNG por slot para la vista 3D: el snapshot del imán recortado a su
// silueta física (transparente afuera), para que en la nevera 3D cada imán tenga su forma real
// (rectángulo/corazón/círculo) y no un rectángulo. Reusa buildShapePath (misma silueta que el
// preview 2D). Devuelve, además, la proporción física para escalar el plano en la escena.

export async function buildMagnetTextures(
  canvasData: CanvasDataV2,
  stages: Map<number, Konva.Stage | null>,
  shape?: "rectangle" | "circle" | "heart" | "custom",
  texWidth: number = MAGNET_TEXTURE_WIDTH_DEFAULT,
  renderOpts?: SlotPreviewRenderOptions,
): Promise<Magnet3D[]> {
  const { unitTemplate, slots } = canvasData;
  const slotImages = await renderSlotsToImages(canvasData, slots, stages, shape, renderOpts);
  const texW = texWidth;
  const texH = Math.max(
    64,
    Math.round(texW * (unitTemplate.stage.height / unitTemplate.stage.width)),
  );

  // Reusar un único canvas de recorte 3D entre slots para no multiplicar backing buffers en móvil.
  const clipCanvas = document.createElement("canvas");
  clipCanvas.width = texW;
  clipCanvas.height = texH;
  const ctx = clipCanvas.getContext("2d");
  if (!ctx) {
    throw new Error("No se pudo crear contexto canvas para textura 3D");
  }

  const out: Magnet3D[] = [];
  for (const slot of slots) {
    const img = slotImages.get(slot.slotIndex);
    if (!img) continue;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, texW, texH);
    ctx.save();
    traceShapePath(ctx, shape, 0, 0, texW, texH);
    ctx.clip();
    // 2026-11-07 — relleno crema `#FAF8F5` bajo el diseño (`destination-over`) dentro
    // de la silueta física para evitar que píxeles transparentes internos salgan negros
    // en materiales 3D sin afectar la transparencia exterior del troquel.
    ctx.drawImage(img, 0, 0, texW, texH);
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = "#FAF8F5";
    ctx.fillRect(0, 0, texW, texH);
    ctx.restore();
    const dataUrl = clipCanvas.toDataURL("image/png");
    out.push({
      dataUrl,
      wRatio: unitTemplate.stage.width,
      hRatio: unitTemplate.stage.height,
      shape,
      slotIndex: slot.slotIndex,
      assetUrl: slot.assetUrl,
    });
    await yieldToMain();
  }
  return out;
}
