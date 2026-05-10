/*
 * Server Action — solicitud de reset de contraseña.
 *
 * Flujo:
 *   1. Validar email con Zod.
 *   2. Rate-limit por IP (3 intentos / hora) para mitigar spam.
 *   3. supabase.auth.resetPasswordForEmail(...).
 *   4. SIEMPRE devolver success (sin distinguir si el email existe o no)
 *      para no facilitar enumeración de cuentas.
 *
 * El email contiene un magic link con tokens que apuntan a una ruta que
 * Supabase Auth maneja (callback). La página de "establecer nueva
 * contraseña" se crea después.
 */

"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { getRequestOrigin } from "@/lib/origin";
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
  const isProd = process.env.VERCEL_ENV === "production";
  const rl = await rateLimit(`reset-password:${ip}`, isProd ? 3 : 30, 60 * 60);
  if (!rl.allowed) {
    logger.warn({ event: "auth.reset.rate_limited", ip, count: rl.count });
    return {
      error:
        "Demasiados intentos. Por favor espera una hora antes de reintentar.",
    };
  }

  const origin = await getRequestOrigin();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(
    parsed.data.email,
    { redirectTo: `${origin}/auth/callback?type=recovery` },
  );

  if (error) {
    logger.info({
      event: "auth.reset.fail",
      ip,
      code: error.code,
      status: error.status,
    });
    // Aún así devolvemos success genérico para no leakear si el email existe.
  } else {
    logger.info({ event: "auth.reset.sent", ip });
  }

  return {
    success:
      "Si esa dirección tiene una cuenta, te enviamos un correo con instrucciones. Revisa tu bandeja (incluido spam).",
  };
}
