/*
 * Preview de la TARJETA de calendario en el Estudio (feedback Lucy 2026-07-23):
 * cada slot del mes muestra la tarjeta COMPUESTA (foto + "ENE 2027" + grilla), no la
 * foto a sangre. El dibujo es el MISMO `drawCalendarPage` de producción/preview 3D
 * (WYSIWYG) — este módulo solo resuelve las FUENTES de marca para el canvas del
 * navegador.
 *
 * Por qué: las fuentes se cargan con next/font, cuyas @font-face usan nombres hasheados
 * (`__Fredoka_<hash>`). El literal "Fredoka"/"Inter" no existe en el document → un canvas
 * 2D que lo usa cae a una fuente genérica. Las CSS vars `--font-fredoka`/`--font-inter`
 * (definidas en app/layout.tsx) traen el nombre real; lo resolvemos una vez y lo reusamos.
 * Lucy 2026-09-07 — selector de tipo de letra: la del TÍTULO/mes se elige por key
 * ("fredoka" | "inter" | "caveat") y se resuelve igual vía su CSS var.
 */

import type { CalendarFontKey } from "@/features/personalization/schemas";

/** Extrae la PRIMERA familia de un font-family CSS ("__Fredoka_x", "__Fredoka_Fallback_x" → __Fredoka_x). */
export function firstFontFamily(cssFontFamily: string): string | null {
  const first = cssFontFamily.split(",")[0]?.trim() ?? "";
  if (!first) return null;
  return first.replace(/^["']|["']$/g, "");
}

export type BrandCanvasFonts = { title: string; body: string };

/** Mapa key del selector → CSS var de la fuente del TÍTULO/mes (definidas en app/layout.tsx).
 *  El body/grilla del calendario SIEMPRE usa Inter, sin importar la elección. */
const CALENDAR_TITLE_FONT_VARS: Record<CalendarFontKey, string> = {
  fredoka: "--font-fredoka",
  inter: "--font-inter",
  caveat: "--font-caveat",
  baloo2: "--font-baloo2",
  nunito: "--font-nunito",
  patrick: "--font-patrick",
  playfair: "--font-playfair",
  dancing: "--font-dancing",
};

/**
 * Resuelve la familia real (nombre hasheado de next/font) del TÍTULO del calendario
 * según la key elegida. Devuelve null fuera del navegador o si la var no está
 * (fallback del caller: el literal "Fredoka"/"Inter"/"Caveat", que el server SÍ registra,
 * o la familia del default fredoka ya resuelta).
 */
export function resolveCalendarTitleFont(key: CalendarFontKey): string | null {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  const cs = getComputedStyle(document.documentElement);
  return firstFontFamily(cs.getPropertyValue(CALENDAR_TITLE_FONT_VARS[key] ?? "--font-fredoka"));
}

/**
 * Carga las caras del título usadas por drawCalendarPage para la key dada (700 clásico;
 * 700 + 500 split) y espera a que estén listas (anti-FOUT). Tolerante a fallos: devuelve
 * la familia resuelta (o null) igual — el dibujo degrada al fallback.
 */
export async function ensureCalendarTitleFontLoaded(key: CalendarFontKey): Promise<string | null> {
  const family = resolveCalendarTitleFont(key);
  if (!family || typeof document === "undefined" || !document.fonts) return family;
  try {
    await Promise.all([
      document.fonts.load(`700 62px ${family}`),
      document.fonts.load(`500 62px ${family}`),
    ]);
    await document.fonts.ready;
  } catch {
    // si falla la carga, el caller dibuja igual (canvas usa el fallback).
  }
  return family;
}

/**
 * Resuelve las familias reales de Fredoka/Inter desde las CSS vars del root.
 * Devuelve null fuera del navegador o si las vars no están (fallback: drawCalendarPage
 * usa los literales "Fredoka"/"Inter", que el server SÍ registra).
 */
export function resolveBrandCanvasFonts(): BrandCanvasFonts | null {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  const cs = getComputedStyle(document.documentElement);
  const title = firstFontFamily(cs.getPropertyValue("--font-fredoka"));
  const body = firstFontFamily(cs.getPropertyValue("--font-inter"));
  if (!title || !body) return null;
  return { title, body };
}

/**
 * Dispara la carga de las caras usadas por la tarjeta (título 700 + grilla 400/600/700)
 * y espera a que estén listas. Sin esto, el primer render del canvas puede salir con la
 * fuente de fallback (FOUT) y quedarse así. Tolerante a fallos: devuelve las familias
 * resueltas (o null) igual — drawCalendarPage degrada a sans-serif vía fontsOk.
 */
export async function ensureBrandCanvasFontsLoaded(): Promise<BrandCanvasFonts | null> {
  const fonts = resolveBrandCanvasFonts();
  if (!fonts || typeof document === "undefined" || !document.fonts) return fonts;
  try {
    const loads: Promise<unknown>[] = [];
    for (const weight of [700]) loads.push(document.fonts.load(`${weight} 62px ${fonts.title}`));
    for (const weight of [400, 600, 700]) {
      loads.push(document.fonts.load(`${weight} 30px ${fonts.body}`));
    }
    await Promise.all(loads);
    await document.fonts.ready;
  } catch {
    // si falla la carga, el caller dibuja igual (el canvas usa el fallback genérico).
  }
  return fonts;
}
