/*
 * Validadores Colombia — formatos oficiales de documento, teléfono,
 * código postal, nombre. Usados en checkout y formularios admin.
 *
 * Lucy 2026-05-21: "validar acorde al formato real, nada de suposiciones".
 */

// ─── Documento ───

export type DocumentType = "CC" | "CE" | "NIT" | "PP" | "TI";

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  CC: "Cédula de ciudadanía",
  CE: "Cédula de extranjería",
  NIT: "NIT (empresa)",
  PP: "Pasaporte",
  TI: "Tarjeta de identidad",
};

/**
 * Regex por tipo. Solo validan estructura básica, NO ejecutan el dígito
 * de verificación NIT (eso requiere algoritmo módulo-11). El courier
 * Aveonline tampoco valida DV, así que es suficiente.
 */
const DOC_REGEX: Record<DocumentType, RegExp> = {
  CC: /^\d{6,10}$/, // 6-10 dígitos
  CE: /^\d{6,7}$/, // 6-7 dígitos
  NIT: /^\d{9}-?\d?$/, // 9 dígitos + opcional "-DV"
  PP: /^[A-Z0-9]{6,12}$/i, // Alfanumérico 6-12
  TI: /^\d{8,11}$/, // 8-11 dígitos
};

const DOC_HELP_TEXT: Record<DocumentType, string> = {
  CC: "6 a 10 dígitos sin puntos ni espacios. Ej: 1234567890",
  CE: "6 a 7 dígitos. Ej: 1234567",
  NIT: "9 dígitos + dígito verificación opcional. Ej: 900123456-7",
  PP: "Alfanumérico 6-12 caracteres. Ej: AB123456",
  TI: "8 a 11 dígitos. Ej: 1029384756",
};

export function validateDocument(type: DocumentType, value: string): boolean {
  const cleaned = value.trim();
  if (!cleaned) return false;
  return DOC_REGEX[type].test(cleaned);
}

export function getDocumentHelp(type: DocumentType): string {
  return DOC_HELP_TEXT[type];
}

/**
 * Calcula el dígito de verificación de un NIT colombiano (algoritmo
 * oficial DIAN). El cliente puede tipear sin DV y se lo agregamos al
 * persistir.
 *
 * Algoritmo: cada dígito × peso, suma % 11. Pesos: 71,67,59,53,47,43,41,37,29,23,19,17,13,7,3.
 */
const NIT_WEIGHTS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

export function calculateNitDV(nit: string): string {
  const cleaned = nit.replace(/[^\d]/g, "");
  if (cleaned.length < 9) return "";
  const sum = cleaned
    .split("")
    .reverse()
    .reduce((acc, digit, i) => acc + Number(digit) * (NIT_WEIGHTS[i] ?? 0), 0);
  const mod = sum % 11;
  if (mod === 0) return "0";
  if (mod === 1) return "1";
  return String(11 - mod);
}

// ─── Teléfono ───

// Móvil colombiano: empieza con 3, total 10 dígitos.
// Ej: 3208873826
const PHONE_REGEX = /^3\d{9}$/;

/**
 * Normaliza a los 10 dígitos locales. Tolera el indicativo país +57: si quedan
 * 12 dígitos que empiezan en "57" (ej. "+57 320 887 3826"), lo quita.
 */
function normalizeMobileDigits(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("57")) return digits.slice(2);
  return digits;
}

export function validatePhone(value: string): boolean {
  return PHONE_REGEX.test(normalizeMobileDigits(value));
}

/**
 * Auto-formato visual: 300 887 3826 (espacios cada 3 dígitos).
 * El valor que se persiste/envía a Aveonline NO incluye espacios.
 */
export function formatPhone(value: string): string {
  const digits = normalizeMobileDigits(value).slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

export function stripPhone(value: string): string {
  return normalizeMobileDigits(value).slice(0, 10);
}

// ─── Nombre ───

// Letras + espacios + acentos españoles + ñ + apóstrofo (D'Angelo) +
// punto (Dr.) + guión (Garcia-Lopez). Sin dígitos.
const NAME_REGEX = /^[A-Za-zÀ-ÿ\s.''\-]+$/;

export function validateName(value: string): boolean {
  const cleaned = value.trim();
  if (cleaned.length < 2) return false;
  return NAME_REGEX.test(cleaned);
}

/**
 * Title-case respetando preposiciones cortas (de, del, la, las, los, y).
 * Ej. "lucy del pilar hurtado" → "Lucy del Pilar Hurtado".
 */
const NAME_LOWERCASE_WORDS = new Set(["de", "del", "la", "las", "los", "y", "e", "da", "do"]);

export function capitalizeName(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word, i) => {
      if (i > 0 && NAME_LOWERCASE_WORDS.has(word)) return word;
      return word.charAt(0).toLocaleUpperCase("es") + word.slice(1);
    })
    .join(" ");
}

// ─── Código postal ───

// CP colombiano oficial: 6 dígitos. DANE divipola lo asigna por municipio.
const ZIP_REGEX = /^\d{6}$/;

export function validateZip(value: string): boolean {
  return ZIP_REGEX.test(value.trim());
}
