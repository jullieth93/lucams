/*
 * ADR-063 CAL4 — compositor CLIENTE de las páginas del calendario para el preview inmersivo.
 *
 * Usa el MISMO `drawCalendarPage` que el compositor de producción server-side → lo que el cliente
 * ve en 3D es exactamente lo que se imprime (WYSIWYG). Toma la foto ORIGINAL de cada mes (assetUrl)
 * + su encuadre (photoTransform) y compone la página completa (foto + mes + año + grilla de días).
 * No pasa por Konva: replica la misma entrada que el server (asset crudo + transform).
 */

import { drawCalendarPage } from "@/features/personalization/calendar-draw";
import { CALENDAR_PAGE, scalePhotoTransformToPage } from "@/features/personalization/calendar-layout";

// Escala del preview: 1080×1520 → ~810×1140. Nítido como textura 3D sin ser pesado.
const PREVIEW_SCALE = 0.75;

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

/**
 * #3 (auditoría v3) — apila las páginas ya compuestas (mes + grilla + festivos) en UN PNG en grid,
 * para el modal de confirmación: el cliente ve las páginas REALES que se imprimen, no las fotos
 * sueltas. Espejo estructural de buildCompositedPreview pero sobre páginas de calendario.
 */
export async function buildCalendarPreviewMontage(pages: string[]): Promise<string> {
  const cols = Math.min(4, Math.max(1, pages.length));
  const rows = Math.ceil(pages.length / cols);
  const cellW = 200;
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
  return canvas.toDataURL("image/png");
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
 * Compone las páginas (en el orden dado) → dataURLs PNG. Espera a que las fuentes de marca estén
 * listas para que el título/días salgan con Fredoka/Inter (no un fallback).
 */
export async function composeCalendarPages(
  pages: CalendarPageInput[],
  year: number,
): Promise<string[]> {
  // Asegurar fuentes de marca cargadas antes de dibujar texto en el canvas.
  if (typeof document !== "undefined" && document.fonts) {
    try {
      await Promise.all([
        document.fonts.load("700 62px Fredoka"),
        document.fonts.load("400 30px Inter"),
        document.fonts.load("700 30px Inter"),
      ]);
      await document.fonts.ready;
    } catch {
      // si falla la carga, drawCalendarPage cae a sans-serif (fontsOk=true igual dibuja).
    }
  }

  const S = PREVIEW_SCALE;
  const out: string[] = [];
  for (const p of pages) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(CALENDAR_PAGE.width * S);
    canvas.height = Math.round(CALENDAR_PAGE.height * S);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No se pudo crear el contexto 2D para el calendario");
    ctx.scale(S, S);

    let photo: HTMLImageElement | null = null;
    if (p.assetUrl) {
      try {
        photo = await loadImage(p.assetUrl);
      } catch {
        photo = null; // foto ilegible → recuadro suave (el helper lo maneja).
      }
    }

    drawCalendarPage(ctx, {
      photo,
      photoTransform: p.photoTransform,
      year,
      monthIndex0: p.monthIndex0,
      fontsOk: true,
    });
    out.push(canvas.toDataURL("image/png"));
  }
  return out;
}
