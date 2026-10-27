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
 * Formato real (rediseño 2026-10-26 — bug "no deja poner espacios"): la
 * ubicación es «Ciudad, País» con ESPACIOS y varias palabras por segmento
 * ("Santa Marta, Colombia", "Korea del Sur"). Se retira la regla vieja de
 * máximo 2 palabras (rompía ciudades multi-palabra). La transformación al
 * guardar:
 *
 *  - Con coma: hasta 2 segmentos separados por coma (ciudad, país), cada uno
 *    multi-palabra, con inicial mayúscula en cada palabra.
 *  - Sin coma: 2 palabras exactas se leen como «Ciudad País» (compat con la
 *    convención vieja: "bogotá colombia" → "Bogotá, Colombia"); 1 palabra o
 *    3+ palabras se toman como UN solo lugar ("Korea del Sur" → "Korea Del
 *    Sur") — partir a la mitad produciría "Korea Del, Sur", que es basura.
 *  - Nunca se comen espacios ni palabras.
 *
 * REGLA DE VALIDACIÓN (owner 2026-10-27): el formato pedido es «Ciudad, País»
 * — exactamente UNA coma con ambos segmentos no vacíos. La UI la cobra como
 * AVISO inline al commit/blur (nunca bloquea el tecleo, el auto-save ni el
 * finalize: el campo es decorativo y VACÍO sigue siendo válido). El heuristic
 * sin-coma de igLocationOverride queda como fallback de robustez (valores
 * legacy persistidos), ya no promovido por la UI.
 */

/** Máximo de segmentos separados por coma (ciudad, país). */
export const IG_LOCATION_MAX_SEGMENTS = 2;

/** Largo máximo del input de ubicación (una línea corta del post impreso). */
export const IG_LOCATION_MAX_LENGTH = 40;

/** Primera letra en mayúscula (locale es-CO: tildes/ñ capitalizan bien). */
function capitalizeIgLocationWord(word: string): string {
  return word.charAt(0).toLocaleUpperCase("es") + word.slice(1);
}

/** Inicial mayúscula por palabra dentro del segmento (conserva el resto). */
function capitalizeIgLocationSegment(segment: string): string {
  return segment
    .split(" ")
    .filter((w) => w !== "")
    .map(capitalizeIgLocationWord)
    .join(" ");
}

/**
 * Sanitiza la entrada del campo ubicación EN VIVO: solo letras (con tildes/ñ),
 * números, espacios, coma, punto, apóstrofe y guion; espacios colapsados (pero
 * el separador final se conserva para seguir escribiendo); MÁXIMO una coma
 * (2 segmentos: ciudad, país) — las comas extra se convierten en espacio.
 */
export function sanitizeIgLocationInput(raw: string): string {
  const clean = raw
    .replace(/[^\p{L}\p{N}\s,.'’-]/gu, "")
    .replace(/\s+/g, " ")
    .replace(/^\s+/, "");
  const commaIdx = clean.indexOf(",");
  const limited =
    commaIdx === -1
      ? clean
      : clean.slice(0, commaIdx + 1) +
        clean
          .slice(commaIdx + 1)
          .replace(/,+/g, " ")
          .replace(/\s+/g, " ");
  return limited.slice(0, IG_LOCATION_MAX_LENGTH);
}

/**
 * Texto a guardar en el override (lo que se imprime): «Ciudad, País» bien
 * capitalizado. Con coma → 2 segmentos multi-palabra; sin coma → 2 palabras
 * exactas se leen «Ciudad País», el resto es UN solo lugar. Vacío → null
 * (sin override; el guard de requeridos lo cobra).
 */
export function igLocationOverride(display: string): string | null {
  const clean = sanitizeIgLocationInput(display).trim();
  if (clean === "") return null;
  const segments: string[] = [];
  if (clean.includes(",")) {
    const [city = "", country = ""] = clean.split(",");
    if (city.trim() !== "") segments.push(city.trim());
    if (country.trim() !== "") segments.push(country.trim());
  } else {
    const words = clean.split(" ").filter((w) => w !== "");
    if (words.length === 2) {
      // Compat con la convención vieja: «ciudad país» en 2 palabras.
      segments.push(words[0]!, words[1]!);
    } else {
      segments.push(clean);
    }
  }
  if (segments.length === 0) return null;
  return segments.slice(0, IG_LOCATION_MAX_SEGMENTS).map(capitalizeIgLocationSegment).join(", ");
}

/**
 * Regla de formato de la UI (owner 2026-10-27): «Ciudad, País» — exactamente
 * UNA coma con ambos segmentos no vacíos. VACÍO = válido (campo decorativo
 * opcional: el aviso inline es orientativo, nunca bloquea guardar ni
 * finalizar). Las comas extra no pueden llegar acá (el sanitize en vivo las
 * convierte en espacio); los casos reales de aviso son «sin coma» y segmento
 * vacío («Santa Marta,» / «, Colombia»).
 */
export function igLocationFormatIsValid(display: string): boolean {
  const clean = sanitizeIgLocationInput(display).trim();
  if (clean === "") return true;
  const commaCount = (clean.match(/,/g) ?? []).length;
  if (commaCount !== 1) return false;
  const [city = "", country = ""] = clean.split(",");
  return city.trim() !== "" && country.trim() !== "";
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
