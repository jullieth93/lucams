/*
 * Server Action — establecer nueva contraseña con OTP de recovery.
 *
 * Cambio importante (vs versión anterior con link/callback):
 *   - Antes el usuario clickeaba un link del email → /auth/callback
 *     hacía exchange PKCE → temp session → /restablecer-password →
 *     updateUser({password}). Problema: Gmail prefetch consumía el
 *     token del link, mismo bug que con signup.
 *   - Ahora el usuario recibe el OTP en el email + lo tipea en el
 *     formulario. Sin link, no hay prefetch. verifyOtp + updateUser
 *     ocurren en una sola action atómica.
 *
 * Flujo:
 *   1. Validar email + OTP + nueva password con Zod.
 *   2. Rate-limit por IP (10/15min prod, 30/15min dev) para mitigar
 *      brute-force del OTP.
 *   3. supabase.auth.verifyOtp({email, token, type: 'recovery'}) →
 *      crea sesión temporal autenticada como el dueño del email.
 *   4. supabase.auth.updateUser({password}) → cambia la contraseña.
 *   5. signOut() para forzar re-login con la nueva contraseña.
 *   6. redirect a /login?reset=ok con banner success.
 */

"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const Schema = z.object({
  email: z.string().email("Email inválido"),
  token: z.string().regex(/^\d{6,10}$/, "Código de 6 a 10 dígitos"),
  password: z
    .string()
    .min(8, "Mínimo 8 caracteres")
    .max(72, "Máximo 72 caracteres"),
});

export type RestablecerActionState = {
  error?: string;
  fieldErrors?: Partial<Record<"email" | "token" | "password", string[]>>;
};

export async function restablecerPasswordAction(
  _prev: RestablecerActionState | null,
  formData: FormData,
): Promise<RestablecerActionState> {
  const parsed = Schema.safeParse({
    email: formData.get("email"),
    token: String(formData.get("token") ?? "").replace(/\s+/g, ""),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const flat = z.flattenError(parsed.error);
    return {
      error: "Datos inválidos.",
      fieldErrors: flat.fieldErrors as RestablecerActionState["fieldErrors"],
    };
  }

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const isProd = process.env.VERCEL_ENV === "production";
  const rl = await rateLimit(
    `verify-recovery:${ip}`,
    isProd ? 10 : 30,
    15 * 60,
  );
  if (!rl.allowed) {
    logger.warn({ event: "auth.restablecer.rate_limited", ip });
    return {
      error: "Demasiados intentos. Espera unos minutos antes de reintentar.",
    };
  }

  const supabase = await createSupabaseServerClient();

  // Paso 1: verificar el OTP. Esto crea sesión temporal.
  const { error: verifyErr } = await supabase.auth.verifyOtp({
    email: parsed.data.email,
    token: parsed.data.token,
    type: "recovery",
  });

  if (verifyErr) {
    logger.info({
      event: "auth.restablecer.verify_fail",
      ip,
      code: verifyErr.code,
      status: verifyErr.status,
    });
    return {
      error:
        "El código no es válido o ya expiró. Solicita uno nuevo desde 'Olvidé mi contraseña'.",
    };
  }

  // Paso 2: actualizar password con la sesión temporal recién creada.
  const { error: updateErr } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (updateErr) {
    logger.info({
      event: "auth.restablecer.update_fail",
      ip,
      code: updateErr.code,
      status: updateErr.status,
    });
    return {
      error: "No pudimos actualizar tu contraseña. Intenta de nuevo.",
    };
  }

  // Paso 3: cerrar la sesión temporal para forzar login limpio.
  await supabase.auth.signOut();

  logger.info({ event: "auth.restablecer.success", ip });
  redirect("/login?reset=ok");
}
