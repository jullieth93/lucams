import "server-only";
import { geminiProvider } from "./gemini-provider";
import { AiUnavailableError } from "./provider";
import { BRAND_COLORS, type DesignSuggestInput, type DesignSuggestion } from "./schemas";

/*
 * Orquesta el asistente de sugerencias (ADR-058). Proveedor-agnóstico: `provider` es lo único que
 * conoce a Gemini — cambiarlo por otro (o envolver dos con fallback de PROVEEDOR) no toca la UI.
 * La caché 24h por ocasión queda como mejora diferida (Gemini tiene free-tier → costo trivial;
 * el rate-limit del action ya acota abuso).
 */

const provider = geminiProvider;

export async function getDesignSuggestion(input: DesignSuggestInput): Promise<DesignSuggestion> {
  const raw = await provider.suggestDesign(input);
  const color = BRAND_COLORS[raw.colorName];
  // La frase solo aplica si el producto lleva texto; el color siempre se resuelve a un hex de marca.
  const phrase = input.allowText ? raw.phrase?.trim() || null : null;
  return {
    phrase,
    colorName: raw.colorName,
    colorHex: color.hex,
    colorLabel: color.label,
    layout: raw.layout.trim(),
    tip: raw.tip.trim(),
  };
}

export { AiUnavailableError };
