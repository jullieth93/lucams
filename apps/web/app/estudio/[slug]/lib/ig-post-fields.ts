/*
 * Helpers PUROS de los campos asistidos "Datos de la publicación" de la Polaroid
 * Instagram (rediseño owner 2026-10-05 — studio-ig-post-fields.tsx).
 *
 * Módulo sin deps de React → testeable y reutilizable. Cada helper define DOS
 * direcciones coherentes (lo que se MUESTRA en el input ↔ lo que se GUARDA en el
 * override): el override.text es lo que se imprime tal cual en el post (Konva y
 * producción lo dibujan verbatim), así que los prefijos/sufijos fijos del post
 * real ("@" del usuario, "me gusta" del contador, "#" de los tags) viajan EN el
 * texto guardado y en la UI se muestran como adornos fijos fuera del valor
 * editable.
 */

// ── Usuario ─────────────────────────────────────────────────────────────────

/** Máximo de caracteres del usuario IG (regla real de Instagram). */
export const IG_USERNAME_MAX = 30;

/**
 * Sanitiza la entrada del campo usuario: sin espacios (strip en input) y solo
 * caracteres válidos de usuario de Instagram (letras, números, punto y guion
 * bajo). Quita además las "@" que el cliente pegue (el prefijo es fijo de la UI).
 */
export function sanitizeIgUsernameInput(raw: string): string {
  return raw
    .replace(/@/g, "")
    .replace(/\s+/g, "")
    .replace(/[^A-Za-z0-9._]/g, "");
}

/** Valor editable que se muestra en el input a partir del texto guardado. */
export function igUsernameDisplay(stored: string): string {
  return sanitizeIgUsernameInput(stored);
}

/**
 * Texto a guardar en el override (lo que se imprime): SIEMPRE con "@" prefijada,
 * como en el post real. Vacío → null (sin override; el guard de requeridos lo cobra).
 */
export function igUsernameOverride(display: string): string | null {
  const clean = sanitizeIgUsernameInput(display).slice(0, IG_USERNAME_MAX);
  return clean === "" ? null : `@${clean}`;
}

// ── Ubicación ───────────────────────────────────────────────────────────────

/*
 * Decisión de producto (owner 2026-10-12): la ubicación es un INPUT DE TEXTO
 * simple, SIN asistencia de sugerencias — el combobox con la lista curada
 * (Fase 2 · 2.7b) se retiró porque el commit por tecla + el filtrado por
 * render hacían MUY LENTA la plantilla. En su lugar hay validación y
 * transformación automática:
 *
 *  - Máximo 2 palabras (Ciudad País).
 *  - Primera letra de cada palabra SIEMPRE mayúscula (al commit).
 *  - El separador (espacio o coma) se imprime como ", ": escribe
 *    "bogotá colombia" → queda "Bogotá, Colombia".
 */

/** Máximo de palabras de la ubicación (Ciudad País). */
export const IG_LOCATION_MAX_WORDS = 2;

/** Largo máximo del input de ubicación (una línea corta del post impreso). */
export const IG_LOCATION_MAX_LENGTH = 40;

/** Primera letra en mayúscula (locale es-CO: tildes/ñ capitalizan bien). */
function capitalizeIgLocationWord(word: string): string {
  return word.charAt(0).toLocaleUpperCase("es") + word.slice(1);
}

/**
 * Sanitiza la entrada del campo ubicación EN VIVO: solo letras (con tildes/ñ),
 * números, espacios, coma, punto, apóstrofe y guion; espacios colapsados; y
 * MÁXIMO IG_LOCATION_MAX_WORDS palabras — la tercera palabra no entra (el
 * separador final se conserva para poder escribir la segunda palabra).
 */
export function sanitizeIgLocationInput(raw: string): string {
  const clean = raw
    .replace(/[^\p{L}\p{N}\s,.'’-]/gu, "")
    .replace(/\s+/g, " ")
    .replace(/^\s+/, "");
  const m = clean.match(/^\S+(?:[\s,]+\S*)?/);
  return (m ? m[0] : "").slice(0, IG_LOCATION_MAX_LENGTH);
}

/**
 * Texto a guardar en el override (lo que se imprime): las primeras
 * IG_LOCATION_MAX_WORDS palabras, cada una con inicial mayúscula, unidas con
 * ", " ("bogotá colombia" → "Bogotá, Colombia"; una sola palabra queda sin
 * coma). Vacío → null (sin override; el guard de requeridos lo cobra).
 */
export function igLocationOverride(display: string): string | null {
  const words = display
    .split(/[\s,]+/)
    .filter((w) => w !== "")
    .slice(0, IG_LOCATION_MAX_WORDS);
  if (words.length === 0) return null;
  return words.map(capitalizeIgLocationWord).join(", ");
}

// ── «Me gusta» ──────────────────────────────────────────────────────────────

/**
 * Sufijo FIJO del contador (fuera del valor editable): el override guarda
 * "1.234 me gusta" y se imprime tal cual; el input solo edita el número.
 */
export const IG_LIKES_SUFFIX = "me gusta";

const likesFormatter = new Intl.NumberFormat("es-CO");

/** Solo dígitos (strip en input): el contador de «me gusta» no lleva decimales. */
export function sanitizeIgLikesInput(raw: string): string {
  return raw.replace(/\D+/g, "").slice(0, 9);
}

/**
 * Valor editable que se muestra en el input a partir del texto guardado:
 * quita el sufijo fijo y deja solo el número tal cual lo escribió el cliente
 * (con su separador de miles).
 */
export function igLikesDisplay(stored: string): string {
  const withoutSuffix = stored.replace(new RegExp(`\\s*${IG_LIKES_SUFFIX}\\s*$`, "i"), "");
  const digits = sanitizeIgLikesInput(withoutSuffix);
  return digits === "" ? "" : likesFormatter.format(Number(digits));
}

/**
 * Texto a guardar en el override: número con separador de miles es-CO + el
 * sufijo fijo ("1.234 me gusta"). Vacío → null (el guard de requeridos lo cobra:
 * «me gusta» es OBLIGATORIO desde el rediseño 2026-10-05).
 */
export function igLikesOverride(display: string): string | null {
  const digits = sanitizeIgLikesInput(display);
  if (digits === "") return null;
  return `${likesFormatter.format(Number(digits))} ${IG_LIKES_SUFFIX}`;
}

// ── Título (caption) ────────────────────────────────────────────────────────

/**
 * Límite del título: el footer de la plantilla es una sola línea a 16px sobre
 * 450px de stage — más allá de ~140 caracteres el texto se sale de la tarjeta
 * impresa. 140 deja ~2 líneas reales de post sin riesgo de desborde.
 */
export const IG_CAPTION_MAX = 140;

// ── Hashtags ────────────────────────────────────────────────────────────────

/** Máximo de hashtags del post impreso (decisión de producto del rediseño). */
export const IG_HASHTAGS_MAX = 3;

/** Largo máximo de UN hashtag (sin el "#"). */
export const IG_HASHTAG_MAX_LENGTH = 30;

/**
 * Sanitiza UN hashtag: sin "#" ni espacios dentro del tag; letras (incluye
 * tildes/ñ, como IG), números y guion bajo.
 */
export function sanitizeIgHashtag(raw: string): string {
  return raw
    .replace(/#/g, "")
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}_]/gu, "")
    .slice(0, IG_HASHTAG_MAX_LENGTH);
}

/**
 * Tags a partir del texto guardado ("#mirecuerdo #lucamsshop" → ["mirecuerdo",
 * "lucamsshop"]): el campo los muestra como chips editables, no como texto libre.
 */
export function igHashtagsFromStored(stored: string): string[] {
  return stored
    .split(/\s+/)
    .map((t) => sanitizeIgHashtag(t))
    .filter((t) => t !== "")
    .slice(0, IG_HASHTAGS_MAX);
}

/**
 * Texto a guardar en el override: cada tag con "#" prefijada, separados por un
 * espacio ("#playa #familia"), como en el post real. Sin tags → null (el guard
 * de requeridos lo cobra).
 */
export function igHashtagsOverride(tags: readonly string[]): string | null {
  const clean = tags.map((t) => sanitizeIgHashtag(t)).filter((t) => t !== "");
  if (clean.length === 0) return null;
  return clean.map((t) => `#${t}`).join(" ");
}
