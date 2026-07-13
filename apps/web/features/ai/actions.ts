"use server";

import { headers } from "next/headers";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { ipKey } from "@/lib/rate-limit-keys";
import { DesignSuggestInputSchema, type DesignSuggestion } from "./schemas";
import { getDesignSuggestion, AiUnavailableError } from "./service";

type Result = { ok: true; suggestion: DesignSuggestion } | { ok: false; message: string };

/*
 * Server action del asistente IA (ADR-058). Valida la entrada, aplica rate-limit por IP (acota
 * costo/abuso — el asistente cuesta por llamada) y devuelve la sugerencia. Falla-seguro: cualquier
 * problema del proveedor → mensaje amable, nunca rompe el editor.
 */
export async function suggestDesignAction(raw: unknown): Promise<Result> {
  const parsed = DesignSuggestInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: "Cuéntanos un poco más sobre la ocasión (mínimo unas palabras)." };
  }

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const isProd = process.env.VERCEL_ENV === "production";
  // 20 sugerencias/hora en prod (generoso para uso real, corta abuso). El asistente solo se
  // invoca cuando el cliente abre el panel, nunca automáticamente.
  const rl = await rateLimit(ipKey("ai_suggest", ip), isProd ? 20 : 100, 3600);
  if (!rl.allowed) {
    return { ok: false, message: "¡Muchas ideas seguidas! 😅 Espera un momento e intenta de nuevo." };
  }

  try {
    const suggestion = await getDesignSuggestion(parsed.data);
    return { ok: true, suggestion };
  } catch (err) {
    if (err instanceof AiUnavailableError) {
      return {
        ok: false,
        message: "El asistente no está disponible ahora. ¡Igual puedes personalizar tú! 💜",
      };
    }
    logger.error({
      event: "ai.suggest.fail",
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, message: "No pudimos generar ideas ahora mismo. Intenta de nuevo." };
  }
}
