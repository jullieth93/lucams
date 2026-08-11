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
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { mergeAnonCartIntoCustomer } from "@/features/cart/service";
import { peekCartSession, setCartSessionCookie } from "@/lib/cart-session";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { emailKey, ipKey } from "@/lib/rate-limit-keys";
import { safeRedirectTarget } from "@/lib/safe-redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getClientIp } from "@/lib/client-ip";

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
      fieldErrors: flat.fieldErrors as Partial<Record<"email" | "password", string[]>>,
    };
  }

  const hdrs = await headers();
  const ip = getClientIp(hdrs);
  const isProd = process.env.VERCEL_ENV === "production";

  // Rate-limit doble: por IP y por email.
  const rlIp = await rateLimit(ipKey("login", ip), isProd ? 15 : 50, 15 * 60);
  const rlEmail = await rateLimit(emailKey("login", parsed.data.email), isProd ? 15 : 50, 15 * 60);
  if (!rlIp.allowed || !rlEmail.allowed) {
    logger.warn({
      event: "auth.login.rate_limited",
      ip,
      ipCount: rlIp.count,
      emailCount: rlEmail.count,
    });
    return {
      error: "Demasiados intentos. Por favor espera unos minutos antes de reintentar.",
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

  // JIT-provisioning del Customer (bug 2026-08-11): una cuenta creada por
  // Admin API (admins, fixtures) tiene auth user pero NO fila Customer →
  // getCurrentCustomer devolvía null y el header mostraba "Ingresar" siempre
  // ("hace login pero sigue apareciendo Ingresar"). Idempotente y best-effort:
  // un fallo acá NUNCA bloquea el login.
  await ensureCustomerForAuthUser(authData.user);

  // Merge anon cart si existía. Errores acá NO bloquean login —
  // un cart roto no debe impedir entrar a la cuenta.
  await mergeCartSafely(authData.user.id);

  // Volver a donde el usuario venía (`?next=`), pero SOLO si es un path interno
  // seguro — `safeRedirectTarget` neutraliza open-redirect (//evil.com, etc.) y
  // cae a "/" ante cualquier valor sospechoso o ausente.
  const nextRaw = formData.get("next");
  redirect(safeRedirectTarget(typeof nextRaw === "string" ? nextRaw : null));
}

/**
 * JIT-provisioning de la fila Customer para auth users provisionados por fuera
 * del signup (Admin API: admins, fixtures e2e). Si ya existe vinculada (o hay
 * una fila con el mismo email sin vincular), no duplica: la vincula. Nunca
 * lanza — un fallo aquí no debe impedir entrar a la cuenta.
 */
async function ensureCustomerForAuthUser(user: {
  id: string;
  email?: string;
  user_metadata?: unknown;
}): Promise<void> {
  try {
    if (!user.email) return;
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const firstName =
      typeof meta.firstName === "string"
        ? meta.firstName
        : typeof meta.full_name === "string"
          ? (meta.full_name.split(" ")[0] ?? null)
          : null;
    const lastName = typeof meta.lastName === "string" ? meta.lastName : null;
    await prisma.customer.upsert({
      where: { email: user.email },
      create: {
        email: user.email,
        firstName,
        lastName,
        supabaseUserId: user.id,
        referralCode: `LCS-${randomBytes(4).toString("hex").toUpperCase()}`,
        createdBy: user.id,
      },
      update: { supabaseUserId: user.id, deletedAt: null },
    });
  } catch (err) {
    logger.error({
      event: "auth.login.customer_jit_fail",
      err: err instanceof Error ? err.message : String(err),
    });
  }
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
