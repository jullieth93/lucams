/*
 * Server Action — login con email/password.
 *
 * Flujo:
 *   1. Validar input con Zod.
 *   2. Rate-limit por IP (5 intentos / 15 min) para mitigar brute force.
 *   3. supabase.auth.signInWithPassword(...).
 *   4. En éxito: redirect a `/` (la cookie ya está escrita por proxy.ts).
 *   5. En error: devolver { error } sin distinguir "email no existe" de
 *      "password mal" para no facilitar enumeración de cuentas.
 *
 * Mensajes de error:
 *   - Genéricos al cliente.
 *   - Específicos al logger estructurado (para diagnóstico).
 */

"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { mergeAnonCartIntoCustomer } from "@/features/cart/service";
import { peekCartSession, setCartSessionCookie } from "@/lib/cart-session";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { emailKey, ipKey } from "@/lib/rate-limit-keys";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const LoginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "La contraseña es obligatoria"),
});

export type LoginActionState = {
  error?: string;
  fieldErrors?: Partial<Record<"email" | "password", string[]>>;
};

export async function loginAction(
  _prev: LoginActionState | null,
  formData: FormData,
): Promise<LoginActionState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const flat = z.flattenError(parsed.error);
    return {
      error: "Datos inválidos.",
      fieldErrors: flat.fieldErrors as Partial<
        Record<"email" | "password", string[]>
      >,
    };
  }

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const isProd = process.env.VERCEL_ENV === "production";

  // Rate-limit doble: por IP y por email.
  const rlIp = await rateLimit(
    ipKey("login", ip),
    isProd ? 15 : 50,
    15 * 60,
  );
  const rlEmail = await rateLimit(
    emailKey("login", parsed.data.email),
    isProd ? 15 : 50,
    15 * 60,
  );
  if (!rlIp.allowed || !rlEmail.allowed) {
    logger.warn({
      event: "auth.login.rate_limited",
      ip,
      ipCount: rlIp.count,
      emailCount: rlEmail.count,
    });
    return {
      error:
        "Demasiados intentos. Por favor espera unos minutos antes de reintentar.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data: authData, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    logger.info({
      event: "security.login.fail",
      ip,
      code: error.code,
      status: error.status,
      emailRlCount: rlEmail.count,
    });
    return { error: "Credenciales incorrectas. Intenta de nuevo." };
  }

  logger.info({ event: "security.login.success", ip });

  // Merge anon cart si existía. Errores acá NO bloquean login —
  // un cart roto no debe impedir entrar a la cuenta.
  await mergeCartSafely(authData.user.id);

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
    const finalSessionId = await mergeAnonCartIntoCustomer(
      anonSessionId,
      customer.id,
    );
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
