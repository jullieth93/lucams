/*
 * Server actions — Newsletter.
 *
 * Validación Zod + rate-limit por IP + por email + delegación al
 * service. Devuelve state estructurado para que el form lo renderee.
 */

"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { SubscribeSchema } from "@/features/newsletter/schemas";
import { subscribeNewsletter } from "@/features/newsletter/service";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { emailKey, ipKey } from "@/lib/rate-limit-keys";

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
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const ua = hdrs.get("user-agent") ?? null;
  const isProd = process.env.VERCEL_ENV === "production";

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

  return {
    ok: true,
    message: result.alreadySubscribed
      ? "Ya estabas suscrito. ¡Gracias por seguir con nosotros! 💜"
      : "¡Listo! Te avisaremos del lanzamiento ✨",
  };
}
