"use server";

import { headers } from "next/headers";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { ipKey, ownerKey } from "@/lib/rate-limit-keys";
import { DesignSuggestInputSchema, type DesignSuggestion } from "./schemas";
import { getDesignSuggestion, AiUnavailableError } from "./service";
import { getClientIp } from "@/lib/client-ip";
import { getCurrentCustomer } from "@/lib/auth";
import { peekCartSession } from "@/lib/cart-session";
import { isCatalogMode } from "@/lib/store-mode";

type Result = { ok: true; suggestion: DesignSuggestion } | { ok: false; message: string };

/*
 * Server action del asistente IA (ADR-058). Valida la entrada, aplica rate-limit por IP (acota
 * costo/abuso — el asistente cuesta por llamada) y devuelve la sugerencia. Falla-seguro: cualquier
 * problema del proveedor → mensaje amable, nunca rompe el editor.
 */
export async function suggestDesignAction(raw: unknown): Promise<Result> {
  // Guard de ETAPA (mismo patrón que lib/stage-guard.ts): la UI ya oculta el asistente en
  // modo catálogo, pero una Server Action es un endpoint POST invocable por un request
  // crafteado — esconder la UI no es autorizar. No usamos guardTransactionalAction() porque
  // ésta REDIRIGE al form de cotización y esta acción devuelve un Result JSON al cliente;
  // acá el rechazo es con el mismo shape de error que el resto de fallos de la acción.
  if (isCatalogMode()) {
    logger.warn({ event: "ai.suggest.blocked_catalog_mode" });
    return {
      ok: false,
      message: "El asistente no está disponible ahora. ¡Igual puedes personalizar tú! 💜",
    };
  }

  const parsed = DesignSuggestInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: "Cuéntanos un poco más sobre la ocasión (mínimo unas palabras)." };
  }

  const hdrs = await headers();
  const ip = getClientIp(hdrs);
  const isProd = process.env.VERCEL_ENV === "production";
  const hourlyCap = isProd ? 20 : 100;
  const tooMany = {
    ok: false as const,
    message: "¡Muchas ideas seguidas! 😅 Espera un momento e intenta de nuevo.",
  };
  // Capa 1 — por IP: 20 sugerencias/hora en prod (generoso para uso real, corta abuso). El
  // asistente solo se invoca cuando el cliente abre el panel, nunca automáticamente.
  const rlIp = await rateLimit(ipKey("ai_suggest", ip), hourlyCap, 3600);
  if (!rlIp.allowed) return tooMany;

  // Capa 2 — por identidad (auditoría 2026-07-16): defensa en profundidad contra rotación de
  // IP. Cliente logueado → key por customerId (identidad fuerte, no spoofeable como el IP);
  // anónimo → key por la cookie de sesión del carrito si existe. Sin identidad, la capa 1 cubre.
  const customer = await getCurrentCustomer();
  let identityKey: string | null = null;
  if (customer) {
    identityKey = ownerKey("ai_suggest", customer.customer.id);
  } else {
    const sessionId = await peekCartSession();
    if (sessionId) identityKey = ownerKey("ai_suggest_sess", sessionId);
  }
  if (identityKey) {
    const rlId = await rateLimit(identityKey, hourlyCap, 3600);
    if (!rlId.allowed) return tooMany;
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
