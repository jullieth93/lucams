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
 */

/** Extrae la PRIMERA familia de un font-family CSS ("__Fredoka_x", "__Fredoka_Fallback_x" → __Fredoka_x). */
export function firstFontFamily(cssFontFamily: string): string | null {
  const first = cssFontFamily.split(",")[0]?.trim() ?? "";
  if (!first) return null;
  return first.replace(/^["']|["']$/g, "");
}

export type BrandCanvasFonts = { title: string; body: string };

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
