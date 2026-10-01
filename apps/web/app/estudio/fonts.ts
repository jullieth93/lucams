/*
 * Fuentes del selector de tipografía del calendario del Estudio (6 familias).
 *
 * 2026-10-01 (perf) — antes se declaraban en el ROOT layout (app/layout.tsx):
 * next/font genera el @font-face y el <link rel="preload"> en el CSS del layout
 * donde se declara la fuente, así que TODA página pública (home, /productos,
 * PDP…) descargaba ~2 MB de TTF (Baloo2 683KB, Caveat 404KB, Playfair 301KB,
 * Nunito 277KB, PatrickHand 215KB, DancingScript 134KB) que solo usa el
 * selector de tipo de letra del calendario. Ahora viven en el layout de
 * /estudio/* (app/estudio/layout.tsx): el resto del sitio no las paga.
 *
 * `preload: false` a propósito — carga BAJO DEMANDA: el canvas del Estudio ya
 * llama `document.fonts.load(...)` vía ensureCalendarTitleFontLoaded() antes de
 * dibujar con la familia elegida (app/estudio/[slug]/lib/calendar-card-preview.ts),
 * así que el archivo solo se descarga si el usuario efectivamente usa esa fuente.
 *
 * Mismos pesos que usa drawCalendarPage (700 clásico / 700+500 split; Patrick
 * Hand solo tiene 400) y los TTF de assets/fonts que registra el render de
 * producción 300 DPI (production-render-canvas). Cada fuente expone su CSS var
 * `--font-*` que el canvas resuelve al nombre hasheado real de next/font.
 */
import localFont from "next/font/local";

export const caveat = localFont({
  src: "../../assets/fonts/Caveat.ttf",
  variable: "--font-caveat",
  weight: "400 700",
  display: "swap",
  preload: false,
});

export const baloo2 = localFont({
  src: "../../assets/fonts/Baloo2.ttf",
  variable: "--font-baloo2",
  weight: "400 800",
  display: "swap",
  preload: false,
});

export const nunito = localFont({
  src: "../../assets/fonts/Nunito.ttf",
  variable: "--font-nunito",
  weight: "200 1000",
  display: "swap",
  preload: false,
});

export const patrick = localFont({
  src: "../../assets/fonts/PatrickHand.ttf",
  variable: "--font-patrick",
  weight: "400",
  display: "swap",
  preload: false,
});

export const playfair = localFont({
  src: "../../assets/fonts/PlayfairDisplay.ttf",
  variable: "--font-playfair",
  weight: "400 900",
  display: "swap",
  preload: false,
});

export const dancing = localFont({
  src: "../../assets/fonts/DancingScript.ttf",
  variable: "--font-dancing",
  weight: "400 700",
  display: "swap",
  preload: false,
});
