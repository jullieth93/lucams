/*
 * Server actions — verificar OTP de signup + reenviar.
 *
 * Reemplaza el magic-link de Supabase Auth con un OTP de 6 dígitos.
 * Razón: Gmail (y otros) hacen prefetch de URLs en emails → consumen el
 * link antes de que el humano lo haga → "link expirado" para el usuario
 * real. Un OTP solo es válido cuando un humano lo tipea — bots no
 * pueden adivinarlo. (Ver bitácora 2026-05-10 en docs/STATE.md.)
 *
 * Flujo:
 *   1. Signup → Supabase manda email con `{{ .Token }}` en el template.
 *   2. App redirige al usuario a /confirmar-codigo?email=...
 *   3. Usuario tipea el OTP de 6 dígitos.
 *   4. verifyOtpAction llama supabase.auth.verifyOtp({email, token,
 *      type:'signup'}). Si OK → sesión creada → redirect a /.
 *
 * Resend: el usuario puede pedir un código nuevo (re-llamamos signUp
 * con el mismo email — Supabase reenvía el OTP sin crear duplicado).
 */

"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { mergeAnonCartIntoCustomer } from "@/features/cart/service";
import { peekCartSession, setCartSessionCookie } from "@/lib/cart-session";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getRequestOrigin } from "@/lib/origin";
import { rateLimit } from "@/lib/rate-limit";
import { emailKey, ipKey } from "@/lib/rate-limit-keys";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getClientIp } from "@/lib/client-ip";

// OTP length: configurable en Supabase (Auth → Configuration → OTP).
// Default histórico es 6, pero algunos proyectos están en 8. Aceptamos
// 6-10 para ser flexibles — verifyOtp del lado de Supabase valida el
// token real, acá solo prevenimos garbage obvio.
const VerifySchema = z.object({
  email: z.string().email(),
  token: z.string().regex(/^\d{6,10}$/, "Debe ser un código numérico de 6 a 10 dígitos"),
});

export type VerifyOtpActionState = {
  error?: string;
  fieldErrors?: Partial<Record<"token", string[]>>;
};

export async function verifyOtpAction(
  _prev: VerifyOtpActionState | null,
  formData: FormData,
): Promise<VerifyOtpActionState> {
  const parsed = VerifySchema.safeParse({
    email: formData.get("email"),
    token: String(formData.get("token") ?? "").replace(/\s+/g, ""),
  });

  if (!parsed.success) {
    const flat = z.flattenError(parsed.error);
    return {
      error: "Código inválido.",
      fieldErrors: flat.fieldErrors as VerifyOtpActionState["fieldErrors"],
    };
  }

  const hdrs = await headers();
  const ip = getClientIp(hdrs);
  const isProd = process.env.VERCEL_ENV === "production";
  // Doble bucket (auditoría 2026-08-24, B-4 — patrón de login/registro/reset):
  //   - por IP (hasheada, C-8): frena a quien ataca muchos emails desde una IP;
  //   - por email (hasheado): frena la fuerza bruta contra el OTP de UNA víctima
  //     aunque el atacante rote IPs (botnet). Sin este bucket, 10 intentos/15 min
  //     por IP × N IPs multiplicaba los intentos contra un código de 6 dígitos.
  const rlIp = await rateLimit(ipKey("verify-otp", ip), isProd ? 10 : 30, 15 * 60);
  const rlEmail = await rateLimit(
    emailKey("verify-otp", parsed.data.email),
    isProd ? 5 : 30,
    15 * 60,
  );
  if (!rlIp.allowed || !rlEmail.allowed) {
    return {
      error: "Demasiados intentos. Espera unos minutos antes de reintentar.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data: authData, error } = await supabase.auth.verifyOtp({
    email: parsed.data.email,
    token: parsed.data.token,
    type: "signup",
  });

  if (error) {
    logger.info({
      event: "auth.verify_otp.fail",
      ip,
      code: error.code,
      status: error.status,
    });
    return {
      error: "El código no es válido o ya expiró. Solicita uno nuevo o revisa tu email.",
    };
  }

  logger.info({ event: "auth.verify_otp.success", ip });

  // Merge anon cart si existía. Errores no bloquean el signup.
  if (authData.user) await mergeCartSafely(authData.user.id);

  redirect("/");
}

async function mergeCartSafely(supabaseUserId: string): Promise<void> {
  try {
    const anonSessionId = await peekCartSession();
    if (!anonSessionId) return;
    const customer = await prisma.customer.findFirst({
      where: { supabaseUserId, deletedAt: null },
      select: { id: true },
    });
    if (!customer) return;
    const finalSessionId = await mergeAnonCartIntoCustomer(anonSessionId, customer.id);
    if (finalSessionId !== anonSessionId) {
      await setCartSessionCookie(finalSessionId);
    }
  } catch (err) {
    logger.warn({
      event: "cart.merge_fail",
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

const ResendSchema = z.object({
  email: z.string().email(),
});

export type ResendCodeActionState = {
  error?: string;
  success?: string;
};

export async function resendCodeAction(
  _prev: ResendCodeActionState | null,
  formData: FormData,
): Promise<ResendCodeActionState> {
  const parsed = ResendSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { error: "Email inválido." };
  }

  const hdrs = await headers();
  const ip = getClientIp(hdrs);
  const isProd = process.env.VERCEL_ENV === "production";
  // Doble bucket (auditoría 2026-08-24, B-4): IP hasheada (C-8) + bucket por email —
  // sin este último, un atacante que rota IPs podía disparar reenvíos ilimitados
  // (email-bombing) contra el buzón de una víctima.
  const rlIp = await rateLimit(ipKey("resend-otp", ip), isProd ? 3 : 10, 15 * 60);
  const rlEmail = await rateLimit(
    emailKey("resend-otp", parsed.data.email),
    isProd ? 3 : 10,
    15 * 60,
  );
  if (!rlIp.allowed || !rlEmail.allowed) {
    return {
      error: "Espera unos minutos antes de pedir otro código.",
    };
  }

  const origin = await getRequestOrigin();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data.email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });

  if (error) {
    logger.info({
      event: "auth.resend_otp.fail",
      ip,
      code: error.code,
      status: error.status,
    });
    return {
      error: "No pudimos reenviar el código. Intenta en un momento.",
    };
  }

  logger.info({ event: "auth.resend_otp.sent", ip });
  return {
    success: "Te enviamos un código nuevo. Revisa tu bandeja.",
  };
}
