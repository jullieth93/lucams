/*
 * Server actions — Newsletter.
 *
 * Validación Zod + rate-limit por IP + por email + delegación al
 * service. Devuelve state estructurado para que el form lo renderee.
 */

"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { z } from "zod";
import { SubscribeSchema } from "@/features/newsletter/schemas";
import { subscribeNewsletter } from "@/features/newsletter/service";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { emailKey, ipKey } from "@/lib/rate-limit-keys";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { sendEmail } from "@/lib/resend";
import { getSiteUrl } from "@/features/emails/layout";
import { newsletterWelcomeEmail } from "@/features/emails/templates/newsletter-welcome";
import {
  buildCommercialEmailHeaders,
  computeUnsubscribeToken,
} from "@/features/newsletter/unsubscribe";
import { getClientIp } from "@/lib/client-ip";

export type NewsletterFormState = {
  ok?: boolean;
  error?: string;
  message?: string;
};

export async function subscribeNewsletterAction(
  _prev: NewsletterFormState | null,
  formData: FormData,
): Promise<NewsletterFormState> {
  const parsed = SubscribeSchema.safeParse({
    email: String(formData.get("email") ?? "")
      .trim()
      .toLowerCase(),
    consent: formData.get("consent"),
  });
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error);
    const firstError = Object.values(flat.fieldErrors)[0]?.[0] ?? "Datos inválidos.";
    return { error: firstError };
  }

  const hdrs = await headers();
  const ip = getClientIp(hdrs);
  const ua = hdrs.get("user-agent") ?? null;
  const isProd = process.env.VERCEL_ENV === "production";

  // Turnstile (anti-bot). En dev sin secret pasa automáticamente.
  const turnstileToken = String(formData.get("cf-turnstile-response") ?? "");
  const turnstile = await verifyTurnstileToken(turnstileToken, ip);
  if (!turnstile.success) {
    logger.warn({ event: "newsletter.turnstile_failed", ip, reason: turnstile.reason });
    return { error: "Validación anti-bot falló. Recarga la página e intenta de nuevo." };
  }

  // Rate-limit: 5/hora por IP (anti-spam), 2/hora por email (re-suscripción).
  const rlIp = await rateLimit(ipKey("newsletter", ip), isProd ? 5 : 20, 60 * 60);
  const rlEmail = await rateLimit(
    emailKey("newsletter", parsed.data.email),
    isProd ? 2 : 10,
    60 * 60,
  );
  if (!rlIp.allowed || !rlEmail.allowed) {
    logger.warn({
      event: "newsletter.subscribe.rate_limited",
      ip,
      ipCount: rlIp.count,
      emailCount: rlEmail.count,
    });
    return {
      error: "Demasiados intentos. Espera unos minutos y vuelve a probar.",
    };
  }

  const result = await subscribeNewsletter({
    email: parsed.data.email,
    ipAddress: ip === "unknown" ? null : ip,
    userAgent: ua,
  });

  if (!result.ok) {
    return { error: result.message };
  }

  // Email de bienvenida solo para nuevos suscriptores. Fire-and-forget.
  // El token (SHA-256 del email) viaja JUNTO al email en el link
  // /unsubscribe?email=...&token=...; el endpoint recomputa y verifica
  // timing-safe (computeUnsubscribeToken). P0-005.
  if (!result.alreadySubscribed) {
    const email = parsed.data.email;
    const unsubscribeToken = computeUnsubscribeToken(email);
    // after(): en Vercel la función serverless puede congelarse apenas se devuelve la respuesta,
    // matando un `void (async …)()` antes de que corra. after() difiere el trabajo para DESPUÉS de
    // enviar la respuesta, garantizando que el correo de bienvenida se envíe (auditoría v3 · #14).
    after(async () => {
      const tpl = await newsletterWelcomeEmail({ email, unsubscribeToken });
      const siteUrl = await getSiteUrl();
      await sendEmail({
        to: email,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        idempotencyKey: `newsletter:welcome:${unsubscribeToken}`,
        tags: [{ name: "kind", value: "newsletter-welcome" }],
        // #7/#8 — newsletter COMERCIAL: One-Click unsubscribe en header + supresión de rebotados.
        commercial: true,
        headers: buildCommercialEmailHeaders(email, siteUrl),
      });
    });
  }

  return {
    ok: true,
    message: result.alreadySubscribed
      ? "Ya estabas suscrito. ¡Gracias por seguir con nosotros! 💜"
      : "¡Listo! Te avisaremos del lanzamiento ✨",
  };
}
