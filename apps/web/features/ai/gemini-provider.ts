import "server-only";
import { logger } from "@/lib/logger";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { AiUnavailableError, type AiProvider } from "./provider";
import {
  DesignSuggestInput,
  RawSuggestionSchema,
  GEMINI_RESPONSE_SCHEMA,
  BRAND_COLOR_NAMES,
  type RawSuggestion,
} from "./schemas";

/*
 * Proveedor Gemini vía API REST (ADR-058) — SIN dependencia npm: fetch server-side a
 * generateContent con header x-goog-api-key. Verificado contra la doc oficial de Google
 * (2026-07-13). La key es server-only y la llamada es servidor→Google (no toca la CSP).
 *
 * FALLBACK ENTRE MODELOS: intenta el modelo primario; si falla (429/5xx/timeout/respuesta
 * inválida) reintenta con el de respaldo. Si ambos fallan → AiUnavailableError (el caller cae
 * a "sin ideas", nunca rompe el editor). Modelos configurables por env.
 */

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

function models(): string[] {
  const primary = process.env.GEMINI_MODEL_PRIMARY || "gemini-2.5-flash-lite";
  const fallback = process.env.GEMINI_MODEL_FALLBACK || "gemini-2.5-flash";
  // Dedup por si alguien setea ambos iguales.
  return [...new Set([primary, fallback])];
}

const SYSTEM_INSTRUCTION = [
  "Eres un asistente creativo de una tienda colombiana de imanes personalizados kawaii (Lucams_shop).",
  "Ayudas al cliente a decidir qué poner en su imán según la ocasión.",
  "Español de Colombia, tuteo (nunca voseo), tono cálido, cercano y lúdico.",
  "Da ideas concretas y aplicables, cortas. No expliques de más.",
  "Responde ÚNICAMENTE el JSON pedido, sin texto extra.",
].join(" ");

function buildUserPrompt(input: DesignSuggestInput): string {
  const lines = [
    `Ocasión: ${input.occasion}`,
    `Producto: ${input.productName} (${input.slotCount} imán${input.slotCount > 1 ? "es" : ""}).`,
    `Colores de marca disponibles (elige UNO por su nombre): ${BRAND_COLOR_NAMES.join(", ")}.`,
    input.allowText
      ? "El producto SÍ lleva texto: sugiere una frase corta (máx 80 caracteres, es-CO, con un emoji)."
      : "El producto NO lleva texto: deja 'phrase' vacío.",
    "Devuelve: phrase (o vacío), colorName (uno de la lista), layout (idea breve de composición del pack), tip (un consejo).",
  ];
  return lines.join("\n");
}

async function callModel(
  model: string,
  input: DesignSuggestInput,
  apiKey: string,
): Promise<RawSuggestion> {
  const res = await fetchWithTimeout(`${API_BASE}/${model}:generateContent`, {
    method: "POST",
    timeoutMs: 12000,
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents: [{ role: "user", parts: [{ text: buildUserPrompt(input) }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: GEMINI_RESPONSE_SCHEMA,
        temperature: 0.9,
        maxOutputTokens: 400,
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`gemini ${model} HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`gemini ${model} respuesta vacía`);
  // El texto es el JSON pedido (responseMimeType application/json). Parseamos + validamos.
  const parsed = RawSuggestionSchema.parse(JSON.parse(text));
  return parsed;
}

export const geminiProvider: AiProvider = {
  name: "gemini",
  async suggestDesign(input: DesignSuggestInput): Promise<RawSuggestion> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      // Sin key (ej. dev sin configurar) → no disponible, el caller cae a "sin ideas".
      throw new AiUnavailableError("GEMINI_API_KEY no configurada");
    }
    let lastErr: unknown;
    for (const model of models()) {
      try {
        return await callModel(model, input, apiKey);
      } catch (err) {
        lastErr = err;
        logger.warn({
          event: "ai.gemini.model_fail",
          model,
          err: err instanceof Error ? err.message : String(err),
        });
        // sigue al siguiente modelo (fallback)
      }
    }
    throw new AiUnavailableError(
      lastErr instanceof Error ? lastErr.message : "Gemini no respondió",
    );
  },
};
