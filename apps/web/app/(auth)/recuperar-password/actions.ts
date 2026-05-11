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
  // Límites pre-launch intermedios; ver TODO en registro/actions.ts.
  const isProd = process.env.VERCEL_ENV === "production";
  const rl = await rateLimit(`reset-password:${ip}`, isProd ? 10 : 30, 60 * 60);
  if (!rl.allowed) {
    logger.warn({ event: "auth.reset.rate_limited", ip, count: rl.count });
    return {
      error:
        "Demasiados intentos. Por favor espera una hora antes de reintentar.",
    };
  }

  // Sin redirectTo: el flujo de recovery ahora es OTP (no link). El
  // user recibe un código numérico en el email (template Reset password
  // configurado con {{ .Token }}) y lo tipea en /restablecer-password.
  // Esto evita el bug de Gmail prefetch que consume tokens de links.
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(
    parsed.data.email,
  );

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

  redirect(
    `/restablecer-password?email=${encodeURIComponent(parsed.data.email)}`,
  );
}
