/*
 * ADR-063 CAL4 — compositor CLIENTE de las páginas del calendario para el preview inmersivo.
 *
 * Usa el MISMO `drawCalendarPage` que el compositor de producción server-side → lo que el cliente
 * ve en 3D es exactamente lo que se imprime (WYSIWYG). Toma la foto ORIGINAL de cada mes (assetUrl)
 * + su encuadre (photoTransform) y compone la página completa (foto + mes + año + grilla de días).
 * No pasa por Konva: replica la misma entrada que el server (asset crudo + transform).
 *
 * Fix STG (2026-10-05, "confirmar Vista Previa de calendario demora mucho"):
 *   1. CACHE por página (`calendarPageCacheKey`): antes TODA apertura de la
 *      vista previa o del 3D recomponía las 12+ páginas desde cero (carga
 *      full-res + dibujo + encode, ~3 pasadas encode/decode con el montaje).
 *      La clave cubre TODO lo que afecta el píxel final (foto, encuadre, mes,
 *      año, layout, fuente del título), así que re-abrir la vista previa o
 *      abrir el 3D reutiliza las páginas intactas y solo recompone las que
 *      cambiaron. Invalidación por VALOR (el photoTransform se reconstruye en
 *      cada llamada, no sirve la referencia como en slot-snapshot-cache).
 *      Memoria acotada: tope FIFO con refresco LRU liviano.
 *   2. Las fotos ya NO se cargan full-res del bucket directo: pasan por el
 *      optimizador de Next (loadCanvasImage, lib/canvas-image) a 1200px — el
 *      área de foto de la página mide 810px device (1080 × 0.75) y el
 *      encuadre puede acercar ~1.5×; 1200 cubre con margen y son ~5-10× menos
 *      bytes por decodificar que el JPEG de 2400+px. El helper cae a la URL
 *      directa si el optimizador falla (host fuera de remotePatterns, etc.).
 *   3. Las cargas de imagen van EN PARALELO (tope 4) y solo el dibujo queda
 *      secuencial en el main thread (ops vectoriales baratas).
 *   4. Las páginas se codifican WebP q0.9 en vez de PNG: ~5-10× menos bytes
 *      por dataURL (memoria del cache + decodificación del montaje/3D). Los
 *      consumidores lo admiten: el montaje las decodifica con <img> y las
 *      texturas 3D cargan con TextureLoader (ambos vía pipeline de imagen del
 *      navegador, que decodifica WebP en todos los browsers del soporte). Si
 *      el navegador no codifica WebP, canvas.toDataURL devuelve PNG en
 *      silencio — también válido, solo más pesado. La página es OPACA (la
 *      tarjeta pinta su fondo), así que no hay riesgo de alfa.
 */

import { drawCalendarPage } from "@/features/personalization/calendar-draw";
import type { CalendarFontKey } from "@/features/personalization/schemas";
import {
  CALENDAR_PAGE,
  scalePhotoTransformToPage,
  type CalendarLayoutKey,
} from "@/features/personalization/calendar-layout";
import {
  ensureBrandCanvasFontsLoaded,
  ensureCalendarTitleFontLoaded,
} from "./calendar-card-preview";
import { loadCanvasImage } from "./canvas-image";
import { canvasToPreviewDataUrl } from "./preview-encode";
import { mapWithConcurrency } from "./upload-with-retry";

// Escala del preview: 1080×1520 → ~810×1140. Nítido como textura 3D sin ser pesado.
const PREVIEW_SCALE = 0.75;

/** Ancho de la foto pedida al optimizador de Next (área de foto 810px device + zoom). */
const CALENDAR_PHOTO_SRC_WIDTH = 1200;

/** Tope de cargas de foto simultáneas (el dibujo queda en main thread). */
const CALENDAR_PHOTO_LOAD_CONCURRENCY = 4;

/** Calidad del WebP de cada página (texto de la grilla incluido → q alta). */
const CALENDAR_PAGE_WEBP_QUALITY = 0.9;

export type CalendarPageInput = {
  assetUrl?: string | null;
  photoTransform?: { offsetX: number; offsetY: number; scale: number } | null;
  /** Mes 0..11 que corresponde a esta página. */
  monthIndex0: number;
};

/**
 * Construye las entradas de página (una por slot) a partir del canvasData del calendario. Compartido
 * por el preview de confirmación (#3) y la vista 3D — misma matemática de mes: monthIndex0 =
 * (startMonth + slotIndex) mod 12.
 *
 * `templateStageWidth` = ancho del stage de la plantilla con que el cliente encuadró las fotos
 * (600 en la tarjeta actual): los offsets del photoTransform se reescalan a unidades de la
 * página (1080) para que el encuadre en pantalla y el impreso coincidan (WYSIWYG).
 */
export function buildCalendarPageInputs(
  slots: ReadonlyArray<{
    slotIndex: number;
    assetUrl?: string | null;
    photoTransform?: { offsetX: number; offsetY: number; scale: number } | null;
  }>,
  startMonth: number,
  templateStageWidth?: number,
): CalendarPageInput[] {
  return [...slots]
    .sort((a, b) => a.slotIndex - b.slotIndex)
    .map((s) => ({
      assetUrl: s.assetUrl,
      photoTransform: scalePhotoTransformToPage(s.photoTransform, templateStageWidth),
      monthIndex0: (((startMonth + s.slotIndex) % 12) + 12) % 12,
    }));
}

// ──────────── Cache de páginas compuestas (fix STG 2026-10-05) ────────────

/** Tope de entradas: 2 calendarios de 24 páginas (multi-unidad ×2) con holgura. */
export const CALENDAR_PAGE_CACHE_LIMIT = 48;

const pageCache = new Map<string, string>();

/**
 * Clave de contenido de una página compuesta: cubre TODO lo que afecta el
 * píxel final — foto (assetUrl), encuadre ya reescalado a la página, mes,
 * año, layout y fuente del título. Misma clave → mismo dataURL (misma
 * referencia); cualquier cambio (re-encuadre de la foto, otro año, otra
 * fuente) produce una clave distinta → se recompone solo esa página.
 */
export function calendarPageCacheKey(
  page: CalendarPageInput,
  year: number,
  layout?: CalendarLayoutKey,
  calendarFont?: CalendarFontKey,
): string {
  const t = page.photoTransform;
  return [
    page.assetUrl ?? "",
    t ? `${t.offsetX},${t.offsetY},${t.scale}` : "",
    page.monthIndex0,
    year,
    layout ?? "classic",
    calendarFont ?? "fredoka",
  ].join("|");
}

/** Lectura con refresco LRU liviano (el desalojo saca lo realmente más viejo). */
export function getCachedCalendarPage(key: string): string | undefined {
  const hit = pageCache.get(key);
  if (hit !== undefined) {
    pageCache.delete(key);
    pageCache.set(key, hit);
  }
  return hit;
}

export function setCachedCalendarPage(key: string, dataUrl: string): void {
  if (pageCache.size >= CALENDAR_PAGE_CACHE_LIMIT && !pageCache.has(key)) {
    const oldest = pageCache.keys().next().value;
    if (oldest !== undefined) pageCache.delete(oldest);
  }
  pageCache.set(key, dataUrl);
}

/** Vacía el cache (tests; la clave se auto-invalida por contenido). */
export function clearCalendarPageCache(): void {
  pageCache.clear();
}

/** Entradas vivas — diagnóstico y tests. */
export function calendarPageCacheSize(): number {
  return pageCache.size;
}

/**
 * #3 (auditoría v3) — apila las páginas ya compuestas (mes + grilla + festivos) en UN PNG en grid,
 * para el modal de confirmación: el cliente ve las páginas REALES que se imprimen, no las fotos
 * sueltas. Espejo estructural de buildCompositedPreview pero sobre páginas de calendario.
 * 2026-10-05 — la salida ya sale codificada en el MIME efectivo (WebP/JPEG vía
 * canvasToPreviewDataUrl): el `reencodePreviewDataUrl` del caller se vuelve no-op
 * y se elimina una pasada encode/decode del camino.
 */
export async function buildCalendarPreviewMontage(
  pages: string[],
  opts?: { cellW?: number; maxCols?: number },
): Promise<string> {
  // Fase 2 · item 2.2 (2026-10-07) — montaje POR SET: cuando se compone un solo
  // set (12 páginas) las celdas crecen (cellW 200 → 240, 3-4 cols) para que la
  // página de la modal se lea a tamaño razonable; el montaje global (upload)
  // sigue con los defaults de siempre.
  const cols = Math.min(opts?.maxCols ?? 4, Math.max(1, pages.length));
  const rows = Math.ceil(pages.length / cols);
  const cellW = opts?.cellW ?? 200;
  const cellH = Math.round(cellW * (CALENDAR_PAGE.height / CALENDAR_PAGE.width)); // ~267 (3:4)
  const gap = 14;
  const pad = 18;
  const w = pad * 2 + cols * cellW + (cols - 1) * gap;
  const h = pad * 2 + rows * cellH + (rows - 1) * gap;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo crear el contexto 2D del montaje del calendario");
  ctx.fillStyle = "#FFF8F0"; // brand-cream
  ctx.fillRect(0, 0, w, h);

  const imgs = await Promise.all(pages.map((url) => loadImage(url)));
  imgs.forEach((img, i) => {
    const x = pad + (i % cols) * (cellW + gap);
    const y = pad + Math.floor(i / cols) * (cellH + gap);
    ctx.drawImage(img, x, y, cellW, cellH);
  });
  return canvasToPreviewDataUrl(canvas);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // el bucket sirve CORS (igual que Konva) → canvas no se "tainta"
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo cargar la foto del calendario"));
    img.src = url;
  });
}

/**
 * Compone las páginas (en el orden dado) → dataURLs (WebP q0.9; PNG si el
 * navegador no lo codifica). Espera a que las fuentes de marca estén listas
 * para que el título/días salgan con la tipografía elegida (no un fallback).
 * `layout` = composición de la tarjeta declarada por la plantilla ("classic" default | "split").
 * `calendarFont` = key del selector de tipo de letra del título/mes (default "fredoka",
 * retrocompatible con diseños guardados antes del selector — Lucy 2026-09-07).
 *
 * Las páginas cuya clave de contenido ya está en cache se devuelven SIN
 * recomponer (misma referencia); solo las páginas nuevas/cambiadas cargan su
 * foto (en paralelo, vía optimizador de Next) y se dibujan, en orden estable.
 */
export async function composeCalendarPages(
  pages: CalendarPageInput[],
  year: number,
  layout?: CalendarLayoutKey,
  calendarFont?: CalendarFontKey,
): Promise<string[]> {
  const keys = pages.map((p) => calendarPageCacheKey(p, year, layout, calendarFont));
  const out: Array<string | undefined> = keys.map((k) => getCachedCalendarPage(k));
  const missIndexes: number[] = [];
  out.forEach((dataUrl, i) => {
    if (dataUrl === undefined) missIndexes.push(i);
  });
  if (missIndexes.length === 0) return out as string[];

  // Cargar las fotos de las páginas SIN cache en paralelo (tope 4), a 1200px
  // vía el optimizador de Next — mucho menos bytes que el original full-res.
  // loadCanvasImage devuelve null si fallan ambas vías (foto ilegible →
  // recuadro suave, lo maneja drawCalendarPage).
  const photos: Array<HTMLImageElement | null> = new Array(pages.length).fill(null);
  await mapWithConcurrency(missIndexes, CALENDAR_PHOTO_LOAD_CONCURRENCY, async (pageIndex) => {
    const url = pages[pageIndex]!.assetUrl;
    if (url) photos[pageIndex] = await loadCanvasImage(url, CALENDAR_PHOTO_SRC_WIDTH);
  });

  // Asegurar fuentes de marca cargadas antes de dibujar texto en el canvas. Ola 4
  // (Lucy 2026-07-23): next/font hashea los nombres de familia → se resuelven via las
  // CSS vars --font-fredoka/--font-inter y se pasan explícitas al dibujo (antes el
  // literal "Fredoka" no existía en el document y la grilla salía con fuente genérica).
  const brandFonts = await ensureBrandCanvasFontsLoaded();
  // Título del mes según el selector: la familia real vive en la CSS var de la key
  // (--font-fredoka/--font-inter/--font-caveat). Si no resuelve, drawCalendarPage cae
  // al literal "Fredoka" (default) — nunca a un string libre del cliente.
  const titleFamily = await ensureCalendarTitleFontLoaded(calendarFont ?? "fredoka");

  const S = PREVIEW_SCALE;
  for (const i of missIndexes) {
    const p = pages[i]!;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(CALENDAR_PAGE.width * S);
    canvas.height = Math.round(CALENDAR_PAGE.height * S);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No se pudo crear el contexto 2D para el calendario");
    ctx.scale(S, S);

    drawCalendarPage(ctx, {
      photo: photos[i],
      photoTransform: p.photoTransform,
      year,
      monthIndex0: p.monthIndex0,
      fontsOk: true,
      fonts: { title: titleFamily ?? brandFonts?.title, body: brandFonts?.body },
      layout,
    });
    // WebP q0.9 (~5-10× menos bytes que PNG); si el navegador no lo codifica,
    // toDataURL devuelve PNG en silencio — ambos formatos los admiten el
    // montaje y las texturas 3D (la página es opaca: sin riesgo de alfa).
    const dataUrl = canvas.toDataURL("image/webp", CALENDAR_PAGE_WEBP_QUALITY);
    setCachedCalendarPage(keys[i]!, dataUrl);
    out[i] = dataUrl;
  }
  return out as string[];
}
