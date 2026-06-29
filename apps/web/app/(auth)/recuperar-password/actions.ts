/*
 * Server Action — solicitud de reset de contraseña.
 *
 * Flujo:
 *   1. Validar email con Zod.
 *   2. Rate-limit por IP (3 intentos / hora) para mitigar spam.
 *   3. supabase.auth.resetPasswordForEmail(...).
 *      Supabase manda email con {{ .Token }} (OTP de 6-10 dígitos),
 *      no link — configurado en el template de Supabase Dashboard.
 *   4. Redirect a /restablecer-password?email=... donde el user
 *      tipea OTP + nueva contraseña.
 *   5. Si el email NO existe, igual hacemos redirect para no leakear
 *      la existencia de la cuenta (anti-enumeración).
 */

"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { emailKey, ipKey } from "@/lib/rate-limit-keys";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const ResetSchema = z.object({
  email: z.string().email("Email inválido"),
});

export type RecuperarActionState = {
  error?: string;
  success?: string;
  fieldErrors?: Partial<Record<"email", string[]>>;
};

export async function recuperarPasswordAction(
  _prev: RecuperarActionState | null,
  formData: FormData,
): Promise<RecuperarActionState> {
  const parsed = ResetSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error);
    return {
      error: "Email inválido.",
      fieldErrors: flat.fieldErrors as RecuperarActionState["fieldErrors"],
    };
  }

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const isProd = process.env.VERCEL_ENV === "production";

  // Anti-bot (Bloque C / T3): reset es vector de email-bombing.
  const turnstile = await verifyTurnstileToken(
    String(formData.get("cf-turnstile-response") ?? ""),
    ip,
  );
  if (!turnstile.success) {
    return { error: "No pudimos verificar que no eres un robot. Recarga la página e intenta de nuevo." };
  }

  // Rate-limit doble: por IP y por email. Reset es un vector común
  // de account-enumeration y spam — limites más conservadores.
  const rlIp = await rateLimit(ipKey("reset-password", ip), isProd ? 10 : 30, 60 * 60);
  const rlEmail = await rateLimit(
    emailKey("reset-password", parsed.data.email),
    isProd ? 10 : 30,
    60 * 60,
  );
  if (!rlIp.allowed || !rlEmail.allowed) {
    logger.warn({
      event: "auth.reset.rate_limited",
      ip,
      ipCount: rlIp.count,
      emailCount: rlEmail.count,
    });
    return {
      error: "Demasiados intentos. Por favor espera una hora antes de reintentar.",
    };
  }

  // Sin redirectTo: el flujo de recovery ahora es OTP (no link). El
  // user recibe un código numérico en el email (template Reset password
  // configurado con {{ .Token }}) y lo tipea en /restablecer-password.
  // Esto evita el bug de Gmail prefetch que consume tokens de links.
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email);

  if (error) {
    logger.info({
      event: "auth.reset.fail",
      ip,
      code: error.code,
      status: error.status,
    });
    // Aún así redirigimos al form siguiente para no leakear si existe.
  } else {
    logger.info({ event: "auth.reset.sent", ip });
  }

  redirect(`/restablecer-password?email=${encodeURIComponent(parsed.data.email)}`);
}
