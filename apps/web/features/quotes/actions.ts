"use server";

/*
 * Server action — crear cotización desde el carrito (Etapa 1, modo catálogo).
 *
 * Pipeline (mismo patrón que features/support/actions.ts):
 *  1. Valida con Zod (QuoteFormSchema).
 *  2. Exige la autorización de tratamiento de datos (Ley 1581) ANTES de persistir la PII.
 *  3. Turnstile anti-bot (en dev sin secret pasa automáticamente).
 *  4. Rate-limit: 5/día por IP + 3/día por WhatsApp — mitiga spam de
 *     cotizaciones sin friccionar al cliente legítimo.
 *  5. Crea la Quote desde el carrito de la sesión anónima (el service lo
 *     vacía, y ese vaciado condicional es el reclamo que impide cotizaciones
 *     duplicadas por doble envío) y devuelve { number, token } para la página
 *     de confirmación (botón "Enviar por WhatsApp" + vista /cotizacion/[token]).
 *  6. Avisa por email al admin (after, fire-and-forget): si el cliente no
 *     pulsa el botón de WhatsApp, el negocio igual se entera de la cotización.
 */

import { headers } from "next/headers";
import { after } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { ipKey, phoneKey } from "@/lib/rate-limit-keys";
import { logger } from "@/lib/logger";
import { getClientIp } from "@/lib/client-ip";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { getOrCreateCartSession } from "@/lib/cart-session";
import { QuoteFormSchema, type QuoteFormInput } from "./schemas";
import { QuoteError, createQuoteFromCart } from "./service";
import { sendQuoteAdminNotification } from "./emails";

/**
 * Errores por campo. Incluye `dataConsent`, que NO es un campo del schema Zod (es una casilla de
 * autorización que se valida aparte, antes de tocar la PII) pero sí necesita pintar su error.
 */
export type QuoteFieldErrors = Partial<Record<keyof QuoteFormInput | "dataConsent", string[]>>;

export type QuoteActionState =
  | { ok: true; token: string; number: string }
  | { ok: false; error: string; fieldErrors?: QuoteFieldErrors }
  | null;

export async function createQuoteAction(
  _prev: QuoteActionState,
  formData: FormData,
): Promise<QuoteActionState> {
  const parsed = QuoteFormSchema.safeParse({
    customerName: String(formData.get("customerName") ?? "").trim(),
    customerWhatsapp: String(formData.get("customerWhatsapp") ?? "").trim(),
    customerEmail: String(formData.get("customerEmail") ?? "").trim(),
    city: String(formData.get("city") ?? "").trim(),
    department: String(formData.get("department") ?? "").trim(),
    notes: String(formData.get("notes") ?? "").trim(),
  });

  if (!parsed.success) {
    const flat = z.flattenError(parsed.error);
    return {
      ok: false,
      error: "Revisa los campos marcados.",
      fieldErrors: flat.fieldErrors as QuoteFieldErrors,
    };
  }

  // ─── Autorización de tratamiento de datos (Ley 1581) ───
  // PREVIA a persistir la PII: esta cotización es el único flujo de la Etapa 1 que recolecta
  // datos personales, y su titular suele ser un invitado que de otro modo nunca autorizaría.
  // Mismo criterio que el checkout (app/checkout/datos/actions.ts).
  if (formData.get("dataConsent") !== "on") {
    return {
      ok: false,
      error: "Para pedir tu cotización debes autorizar el tratamiento de tus datos personales.",
      fieldErrors: { dataConsent: ["Autoriza el tratamiento de tus datos para continuar."] },
    };
  }

  const hdrs = await headers();
  const ip = getClientIp(hdrs);

  // Turnstile: bloquea bots. En dev sin secret pasa automáticamente.
  const turnstileToken = String(formData.get("cf-turnstile-response") ?? "");
  const turnstile = await verifyTurnstileToken(turnstileToken, ip);
  if (!turnstile.success) {
    logger.warn({ event: "quote.create.turnstile_failed", ip, reason: turnstile.reason });
    return {
      ok: false,
      error: "Validación anti-bot falló. Recarga la página e intenta de nuevo.",
    };
  }

  // Rate-limit: 5/día por IP + 3/día por número de WhatsApp (24h window,
  // misma filosofía que contacto: cubre botnet y atacante único).
  const [byIp, byPhone] = await Promise.all([
    rateLimit(ipKey("quote", ip), 5, 24 * 60 * 60),
    rateLimit(phoneKey("quote", parsed.data.customerWhatsapp), 3, 24 * 60 * 60),
  ]);
  if (!byIp.allowed || !byPhone.allowed) {
    logger.warn({
      event: "quote.create.rate_limited",
      ip,
      byIpAllowed: byIp.allowed,
      byPhoneAllowed: byPhone.allowed,
    });
    return {
      ok: false,
      error:
        "Recibimos varias cotizaciones tuyas hoy. Si es urgente, escríbenos directo por WhatsApp.",
    };
  }

  try {
    const sessionId = await getOrCreateCartSession();
    const { id, number, token } = await createQuoteFromCart(parsed.data, sessionId, {
      ip,
      userAgent: hdrs.get("user-agent"),
    });
    // Aviso interno al admin: si el cliente no pulsa "Enviar por WhatsApp", la cotización igual
    // llega al correo del negocio. Fire-and-forget DESPUÉS de responder — after() porque un
    // `void (async …)()` muere congelado en Vercel (mismo patrón que features/support/actions.ts).
    // Solo corre en esta rama ("se creó nueva"): el doble envío simultáneo muere abajo con
    // DUPLICATE_SUBMIT, sin email; y el idempotencyKey de Resend deduplica cualquier retry
    // residual. Un fallo de Resend NUNCA rompe ni retrasa la creación (try/catch interno).
    after(() => sendQuoteAdminNotification(id));
    logger.info({ event: "quote.create.success", number, ip });
    return { ok: true, token, number };
  } catch (err) {
    if (err instanceof QuoteError && (err.code === "EMPTY_CART" || err.code === "CART_NOT_FOUND")) {
      return {
        ok: false,
        error: "Tu carrito está vacío. Agrega productos antes de pedir la cotización.",
      };
    }
    // Doble envío simultáneo: el otro request ya se quedó con el carrito y creó LA cotización
    // (el service reclama el carrito de forma atómica). No es un fallo — no lo logueamos como
    // error ni asustamos al cliente pidiéndole que reintente: eso sí crearía un duplicado.
    if (err instanceof QuoteError && err.code === "DUPLICATE_SUBMIT") {
      logger.warn({ event: "quote.create.duplicate_submit", ip });
      return {
        ok: false,
        error:
          "Ya recibimos esta cotización — no la enviamos dos veces. Revisa la pestaña donde se abrió tu confirmación o escríbenos por WhatsApp.",
      };
    }
    logger.error({
      event: "quote.create.failed",
      ip,
      err: err instanceof Error ? err.message : String(err),
    });
    return {
      ok: false,
      error:
        "No pudimos crear tu cotización. Prueba de nuevo en unos minutos o escríbenos por WhatsApp.",
    };
  }
}
