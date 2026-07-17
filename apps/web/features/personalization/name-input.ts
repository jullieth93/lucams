/*
 * Normalización del nombre para la superficie "name" del abecedario (ADR-057, Fase 0).
 *
 * Lógica PURA compartida por la pantalla (validación en vivo) y la producción (lista de
 * fichas a empacar). Encoda las decisiones de producto de Lucy (2026-07-12):
 *   - Idioma por producto: español acepta la Ñ como letra propia; inglés no.
 *   - Acentos (José, María, Andrés, Argüello): se ACEPTAN y se convierten a la letra
 *     base (É→E, Ü→U) con un aviso — las fichas son sin tilde. La Ñ en español NO se
 *     convierte (tiene su propia ficha).
 *   - Números y símbolos: se descartan (bloqueados en el input).
 *   - Repetición permitida: "ANA" → ["A","N","A"] (dos fichas A).
 *   - Un solo nombre, sin espacios, para arrancar.
 */

export type NameLanguage = "es" | "en";

export type NameNormalizeOptions = {
  language: NameLanguage;
  min: number;
  max: number;
};

export type NameNormalizeResult = {
  /** Letras base en mayúscula, en orden. Ej. "José" → ["J","O","S","E"]. */
  letters: string[];
  /** Cadena para mostrar. Ej. ["J","O","S","E"] → "JOSE". */
  display: string;
  /** Cumple longitud [min, max] y tiene al menos min letras válidas. */
  valid: boolean;
  tooShort: boolean;
  tooLong: boolean;
  /** Se convirtió al menos un acento a su letra base. */
  hadAccents: boolean;
  /** Se descartó al menos un carácter no-letra (número/símbolo/espacio). */
  droppedNonLetters: boolean;
  /** Avisos amables para el cliente. */
  notices: string[];
};

/** Alfabetos válidos por idioma (mayúsculas). */
const ES_EXTRA = "Ñ";

/**
 * Convierte un carácter a su letra base A–Z (quitando diacríticos). Devuelve "" si el
 * resultado no es una única letra A–Z. La Ñ se maneja aparte (antes de llamar esto).
 */
function toBaseLetter(ch: string): string {
  const stripped = ch
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita marcas combinantes (tildes, diéresis)
    .toUpperCase();
  return /^[A-Z]$/.test(stripped) ? stripped : "";
}

export function normalizeName(raw: string, opts: NameNormalizeOptions): NameNormalizeResult {
  const max = Math.max(1, opts.max);
  const min = Math.max(1, Math.min(opts.min, max));

  const letters: string[] = [];
  let hadAccents = false;
  let droppedNonLetters = false;

  for (const ch of (raw ?? "").toUpperCase()) {
    if (letters.length >= max) break; // tope alcanzado; el excedente se detecta con countValidChars
    // Ñ: letra propia en español; en inglés se convierte a N (acento).
    if (ch === ES_EXTRA) {
      if (opts.language === "es") {
        letters.push("Ñ");
      } else {
        letters.push("N");
        hadAccents = true;
      }
      continue;
    }
    const base = toBaseLetter(ch);
    if (base) {
      if (base !== ch) hadAccents = true; // tenía tilde/diéresis
      letters.push(base);
      continue;
    }
    // No es letra (número, símbolo, espacio) → se descarta.
    if (ch.trim() !== "" || ch === " ") droppedNonLetters = true;
  }

  // ¿El input tenía más letras válidas de las permitidas?
  const validCharCount = countValidChars(raw ?? "", opts.language);
  const tooLong = validCharCount > max;
  const tooShort = letters.length < min;

  const notices: string[] = [];
  if (hadAccents)
    notices.push("Cambiamos los acentos por su letra base — las fichas van sin tilde.");
  if (droppedNonLetters) notices.push("Solo se pueden armar letras (sin números ni símbolos).");
  if (tooLong) notices.push(`Máximo ${max} letras.`);

  return {
    letters,
    display: letters.join(""),
    valid: !tooShort && !tooLong,
    tooShort,
    tooLong,
    hadAccents,
    droppedNonLetters,
    notices,
  };
}

/** Cuenta cuántos caracteres del input serían letras válidas (para detectar "too long"). */
function countValidChars(raw: string, language: NameLanguage): number {
  let n = 0;
  for (const ch of raw.toUpperCase()) {
    if (ch === ES_EXTRA) n++;
    else if (toBaseLetter(ch)) n++;
  }
  void language;
  return n;
}
