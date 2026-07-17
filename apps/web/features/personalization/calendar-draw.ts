/*
 * Dibujo de la PÁGINA de un mes del calendario (ADR-063 CAL1/CAL4) — ÚNICA fuente de la composición,
 * compartida por:
 *   - el compositor de PRODUCCIÓN server-side (production-render-canvas, @napi-rs/canvas), y
 *   - el preview INMERSIVO del cliente (CAL4, Canvas 2D del navegador).
 *
 * Recibe un contexto 2D estructural (el subconjunto de la API común a ambos backends) y una imagen
 * ya decodificada (napi Image o HTMLImageElement) → dibuja foto + título (mes + año) + encabezados +
 * grilla de días, todo con las MISMAS constantes de layout. Así lo que el cliente ve en 3D es
 * exactamente lo que se imprime (WYSIWYG). No importa nada server-only → usable en el navegador.
 */

import { CALENDAR_PAGE, CALENDAR_PHOTO, CALENDAR_LAYOUT } from "./calendar-layout";
import { calendarMonthGrid, MONTH_NAMES_ES, WEEKDAY_HEADERS_ES } from "./calendar-grid";

/** Imagen decodificada mínima (napi Image y HTMLImageElement la satisfacen). */
export type DrawableImage = { width: number; height: number };

/** Subconjunto estructural de CanvasRenderingContext2D / SKRSContext2D que usa el dibujo. */
export interface CalendarDrawCtx {
  // fillStyle/strokeStyle aceptan gradientes/patrones en la API real; solo asignamos strings.
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  save(): void;
  restore(): void;
  beginPath(): void;
  rect(x: number, y: number, w: number, h: number): void;
  clip(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  // El navegador tipa la imagen como CanvasImageSource; napi como Image|Canvas. Aceptamos ambos
  // (más el mínimo estructural) para que un contexto real sea asignable a esta interfaz.
  drawImage(
    img: CanvasImageSource | DrawableImage,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void;
}

export type CalendarPhotoTransform = { offsetX: number; offsetY: number; scale: number };

/**
 * Dibuja una página de mes en `ctx` (que debe estar en coords lógicas de CALENDAR_PAGE: 1080×1520).
 * `photo` = imagen decodificada del mes (o null → recuadro suave). `fontsOk` decide si usar las
 * fuentes de marca (Fredoka/Inter) o el fallback sans-serif.
 */
export function drawCalendarPage(
  ctx: CalendarDrawCtx,
  opts: {
    photo: DrawableImage | null;
    photoTransform?: CalendarPhotoTransform | null;
    year: number;
    monthIndex0: number;
    fontsOk: boolean;
  },
): void {
  const { photo, photoTransform, year, monthIndex0, fontsOk } = opts;

  // Fondo blanco.
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, CALENDAR_PAGE.width, CALENDAR_PAGE.height);

  // Foto del mes (cover + encuadre del cliente, misma matemática que renderSlotCanvas).
  const ph = CALENDAR_PHOTO;
  let photoDrawn = false;
  if (photo && photo.width && photo.height) {
    const coverBase = Math.max(ph.width / photo.width, ph.height / photo.height);
    const eff = Math.max(0.5, Math.min(3, photoTransform?.scale ?? 1));
    const finalScale = coverBase * eff;
    const rw = photo.width * finalScale;
    const rh = photo.height * finalScale;
    const offX = photoTransform?.offsetX ?? 0;
    const offY = photoTransform?.offsetY ?? 0;
    ctx.save();
    ctx.beginPath();
    ctx.rect(ph.x, ph.y, ph.width, ph.height);
    ctx.clip();
    const cx = ph.x + ph.width / 2 + offX;
    const cy = ph.y + ph.height / 2 + offY;
    ctx.drawImage(photo, cx - rw / 2, cy - rh / 2, rw, rh);
    ctx.restore();
    photoDrawn = true;
  }
  if (!photoDrawn) {
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
}
