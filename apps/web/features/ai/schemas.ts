import { z } from "zod";

/*
 * Asistente IA de sugerencias de diseño (ADR-058). Tipos + validación compartidos entre el
 * proveedor (Gemini), el service y la UI. Proveedor-agnóstico: nada aquí conoce a Gemini.
 */

// Paleta de marca que el asistente puede elegir. El nombre lo elige la IA (enum, seguro);
// el hex lo resuelve el código → siempre un color real de marca.
export const BRAND_COLORS = {
  morado: { hex: "#7C6AAD", label: "Morado" },
  turquesa: { hex: "#5DD9D1", label: "Turquesa" },
  rosado: { hex: "#E85B9F", label: "Rosado" },
  coral: { hex: "#F58A6F", label: "Coral" },
  amarillo: { hex: "#FFD93D", label: "Amarillo" },
} as const;

export type BrandColorName = keyof typeof BRAND_COLORS;
export const BRAND_COLOR_NAMES = Object.keys(BRAND_COLORS) as BrandColorName[];

/** Entrada del cliente: la ocasión + contexto del producto (para acotar las sugerencias). */
export const DesignSuggestInputSchema = z.object({
  occasion: z.string().trim().min(3, "Cuéntanos un poco más").max(200),
  productName: z.string().max(120),
  slotCount: z.number().int().min(1).max(40),
  allowText: z.boolean(),
});
export type DesignSuggestInput = z.infer<typeof DesignSuggestInputSchema>;

/*
 * PII guard (auditoría E-2): `occasion` is free text that is sent to a third-party
 * provider (Google Gemini). If it looks like personal data — long digit runs
 * (document numbers), emails, Colombian cellphones (3XX XXX XXXX) — it is replaced
 * with a neutral text instead of rejecting: the assistant keeps working and no PII
 * leaves the server.
 */
const OCCASION_PII_PATTERNS: readonly RegExp[] = [
  /\b\d{6,12}\b/, // long digit runs (cédula, NIT, account numbers)
  /[\w.+-]+@[\w-]+\.[\w.]+/, // emails
  /\b3\d{9}\b/, // Colombian cellphones
];

/** Neutral replacement used when `occasion` matches a PII pattern. */
export const NEUTRAL_OCCASION = "ocasión especial";

/** Returns `input` unchanged, or with `occasion` replaced by NEUTRAL_OCCASION if it has PII. */
export function sanitizeOccasion(input: DesignSuggestInput): DesignSuggestInput {
  if (!OCCASION_PII_PATTERNS.some((p) => p.test(input.occasion))) return input;
  return { ...input, occasion: NEUTRAL_OCCASION };
}

/** Forma cruda que devuelve el LLM (validada con Zod tras el parseo). */
export const RawSuggestionSchema = z.object({
  phrase: z.string().max(80).optional().nullable(),
  colorName: z.enum(BRAND_COLOR_NAMES as [BrandColorName, ...BrandColorName[]]),
  layout: z.string().max(280),
  tip: z.string().max(280),
});
export type RawSuggestion = z.infer<typeof RawSuggestionSchema>;

/** Sugerencia resuelta que consume la UI (color ya mapeado a hex de marca). */
export type DesignSuggestion = {
  phrase: string | null;
  colorName: BrandColorName;
  colorHex: string;
  colorLabel: string;
  layout: string;
  tip: string;
};

/** responseSchema (subconjunto de OpenAPI que acepta Gemini) para forzar JSON estructurado. */
export const GEMINI_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    phrase: { type: "string" },
    colorName: { type: "string", enum: BRAND_COLOR_NAMES },
    layout: { type: "string" },
    tip: { type: "string" },
  },
  required: ["colorName", "layout", "tip"],
  propertyOrdering: ["phrase", "colorName", "layout", "tip"],
} as const;
