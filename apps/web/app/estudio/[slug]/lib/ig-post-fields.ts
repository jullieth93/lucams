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

/**
 * Sugerencias "Ciudad, País" del combobox con búsqueda (Fase 2 · 2.7b — antes
 * datalist nativo). Cobertura MUNDIAL (QA ronda 2, owner 2026-10-07: "de todo
 * el mundo"): Colombia completa primero (mercado principal), luego por región
 * (Latinoamérica, Norteamérica, Europa; países en orden alfabético dentro de
 * cada región) y al final un set de PAÍSES SOLOS como fallback cuando el
 * cliente solo quiere el país. Es asistencia de escritura, NO validación — el
 * cliente puede escribir cualquier ubicación libre.
 */
export const IG_LOCATION_SUGGESTIONS: readonly string[] = [
  // ── Colombia (mercado principal) ─────────────────────────────────────────
  "Bogotá, Colombia",
  "Medellín, Colombia",
  "Cali, Colombia",
  "Barranquilla, Colombia",
  "Cartagena, Colombia",
  "Bucaramanga, Colombia",
  "Pereira, Colombia",
  "Manizales, Colombia",
  "Santa Marta, Colombia",
  "Cúcuta, Colombia",
  "Ibagué, Colombia",
  "Villavicencio, Colombia",
  "Neiva, Colombia",
  "Armenia, Colombia",
  "Pasto, Colombia",
  "Montería, Colombia",
  "Valledupar, Colombia",
  "Popayán, Colombia",
  "Tunja, Colombia",
  "Sincelejo, Colombia",
  "Riohacha, Colombia",
  // ── Latinoamérica (países en orden alfabético) ───────────────────────────
  "Buenos Aires, Argentina",
  "Córdoba, Argentina",
  "Rosario, Argentina",
  "Mendoza, Argentina",
  "La Paz, Bolivia",
  "Santa Cruz de la Sierra, Bolivia",
  "Cochabamba, Bolivia",
  "São Paulo, Brasil",
  "Río de Janeiro, Brasil",
  "Santiago, Chile",
  "Valparaíso, Chile",
  "Concepción, Chile",
  "San José, Costa Rica",
  "La Habana, Cuba",
  "Quito, Ecuador",
  "Guayaquil, Ecuador",
  "Cuenca, Ecuador",
  "San Salvador, El Salvador",
  "Ciudad de Guatemala, Guatemala",
  "Antigua Guatemala, Guatemala",
  "Tegucigalpa, Honduras",
  "San Pedro Sula, Honduras",
  "Ciudad de México, México",
  "Guadalajara, México",
  "Monterrey, México",
  "Cancún, México",
  "Puebla, México",
  "Tijuana, México",
  "Mérida, México",
  "Playa del Carmen, México",
  "Managua, Nicaragua",
  "Ciudad de Panamá, Panamá",
  "Asunción, Paraguay",
  "Lima, Perú",
  "Cusco, Perú",
  "Arequipa, Perú",
  "San Juan, Puerto Rico",
  "Santo Domingo, República Dominicana",
  "Punta Cana, República Dominicana",
  "Montevideo, Uruguay",
  "Punta del Este, Uruguay",
  "Caracas, Venezuela",
  "Maracaibo, Venezuela",
  "Valencia, Venezuela",
  // ── Norteamérica ─────────────────────────────────────────────────────────
  "Toronto, Canadá",
  "Montreal, Canadá",
  "Vancouver, Canadá",
  "Miami, Estados Unidos",
  "Nueva York, Estados Unidos",
  "Los Ángeles, Estados Unidos",
  "Houston, Estados Unidos",
  "Orlando, Estados Unidos",
  "Atlanta, Estados Unidos",
  "Chicago, Estados Unidos",
  "Dallas, Estados Unidos",
  "Fort Lauderdale, Estados Unidos",
  "Tampa, Estados Unidos",
  "Boston, Estados Unidos",
  "Washington D.C., Estados Unidos",
  "San Francisco, Estados Unidos",
  "San Diego, Estados Unidos",
  "Las Vegas, Estados Unidos",
  "Filadelfia, Estados Unidos",
  "Phoenix, Estados Unidos",
  // ── Europa (países en orden alfabético) ──────────────────────────────────
  "Berlín, Alemania",
  "Múnich, Alemania",
  "Fráncfort, Alemania",
  "Viena, Austria",
  "Bruselas, Bélgica",
  "Copenhague, Dinamarca",
  "Madrid, España",
  "Barcelona, España",
  "Valencia, España",
  "Sevilla, España",
  "Bilbao, España",
  "Málaga, España",
  "Alicante, España",
  "Palma de Mallorca, España",
  "París, Francia",
  "Lyon, Francia",
  "Marsella, Francia",
  "Niza, Francia",
  "Atenas, Grecia",
  "Dublín, Irlanda",
  "Roma, Italia",
  "Milán, Italia",
  "Florencia, Italia",
  "Venecia, Italia",
  "Nápoles, Italia",
  "Oslo, Noruega",
  "Ámsterdam, Países Bajos",
  "Róterdam, Países Bajos",
  "Lisboa, Portugal",
  "Oporto, Portugal",
  "Praga, República Checa",
  "Londres, Reino Unido",
  "Mánchester, Reino Unido",
  "Edimburgo, Reino Unido",
  "Estocolmo, Suecia",
  "Zúrich, Suiza",
  "Ginebra, Suiza",
  // ── Países solos (fallback: solo el país, sin ciudad) ────────────────────
  "Argentina",
  "Bolivia",
  "Brasil",
  "Canadá",
  "Chile",
  "Colombia",
  "Costa Rica",
  "Cuba",
  "Ecuador",
  "El Salvador",
  "España",
  "Estados Unidos",
  "Francia",
  "Guatemala",
  "Honduras",
  "Italia",
  "México",
  "Nicaragua",
  "Panamá",
  "Paraguay",
  "Perú",
  "Portugal",
  "Puerto Rico",
  "Reino Unido",
  "República Dominicana",
  "Uruguay",
  "Venezuela",
] as const;

/** Normaliza para comparar: minúsculas y sin tildes ("bogota" ≈ "Bogotá"). */
function normalizeIgLocationQuery(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/**
 * Fase 2 · 2.7b (2026-10-07) — filtro del combobox de ubicación: coincide por
 * ciudad y por país (substring sobre "Ciudad, País" completo), insensible a
 * tildes y mayúsculas. Query vacío → todas las sugerencias. Es asistencia de
 * escritura, NO validación: sin coincidencias el texto libre igual vale.
 */
export function filterIgLocationSuggestions(query: string): string[] {
  const q = normalizeIgLocationQuery(query.trim());
  if (q === "") return [...IG_LOCATION_SUGGESTIONS];
  return IG_LOCATION_SUGGESTIONS.filter((s) => normalizeIgLocationQuery(s).includes(q));
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
