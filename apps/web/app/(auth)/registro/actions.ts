/*
 * Server Action — registro de nuevo cliente.
 *
 * Flujo (saga simple):
 *   1. Validar input con Zod (email, password ≥ 8 + passwordConfirm match,
 *      nombre).
 *   2. Rate-limit por IP (3 cuentas / hora) para mitigar abuso.
 *   3. supabase.auth.signUp({ email, password, options.emailRedirectTo })
 *      — el emailRedirectTo dinámico hace que los links del email apunten
 *      al origin actual del request (localhost vs vercel), no a un valor
 *      hardcoded del dashboard.
 *   4. prisma.customer.create — fila en Customer con supabaseUserId,
 *      referralCode único, audit createdBy=userId. Prisma usa DATABASE_URL
 *      con rol postgres → bypasea RLS automáticamente.
 *   5. Compensación: si (4) falla, supabaseService.auth.admin.deleteUser
 *      para no dejar huérfanos.
 */

"use server";

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getRequestOrigin } from "@/lib/origin";
import { rateLimit } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseService } from "@/lib/supabase/service";

const SignupSchema = z
  .object({
    email: z.string().email("Email inválido"),
    password: z
      .string()
      .min(8, "Mínimo 8 caracteres")
      .max(72, "Máximo 72 caracteres"),
    passwordConfirm: z.string(),
    firstName: z
      .string()
      .min(1, "Tu nombre es obligatorio")
      .max(50, "Máximo 50 caracteres"),
    lastName: z.string().max(50, "Máximo 50 caracteres").optional(),
  })
  .refine((d) => d.password === d.passwordConfirm, {
    message: "Las contraseñas no coinciden.",
    path: ["passwordConfirm"],
  });

export type SignupActionState = {
  error?: string;
  success?: string;
  fieldErrors?: Partial<
    Record<
      "email" | "password" | "passwordConfirm" | "firstName" | "lastName",
      string[]
    >
  >;
};

function generateReferralCode(): string {
  return `LCS-${randomBytes(4).toString("hex").toUpperCase()}`;
}

export async function signupAction(
  _prev: SignupActionState | null,
  formData: FormData,
): Promise<SignupActionState> {
  const raw = {
    email: formData.get("email"),
    password: formData.get("password"),
    passwordConfirm: formData.get("passwordConfirm"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName") || undefined,
  };

  const parsed = SignupSchema.safeParse(raw);
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error);
    return {
      error: "Datos inválidos.",
      fieldErrors: flat.fieldErrors as SignupActionState["fieldErrors"],
    };
  }

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  // Límites: pre-launch intermedios (Lucy testeando sin tropezar pero
  // bots básicos bloqueados); preview/dev generosos.
  // TODO al lanzar de verdad (custom domain + tráfico real): bajar prod
  // a 3/hora signup, 5/15min login, 3/hora reset, o usar env var
  // LUCAMS_RATE_LIMIT_MODE=strict para discriminar sin tocar código.
  const isProd = process.env.VERCEL_ENV === "production";
  const rl = await rateLimit(`signup:${ip}`, isProd ? 10 : 30, 60 * 60);
  if (!rl.allowed) {
    logger.warn({ event: "auth.signup.rate_limited", ip, count: rl.count });
    return {
      error:
        "Demasiados intentos de registro. Espera una hora antes de reintentar.",
    };
  }

  const origin = await getRequestOrigin();
  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (authError) {
    logger.info({
      event: "auth.signup.auth_fail",
      ip,
      code: authError.code,
      status: authError.status,
      message: authError.message,
    });
    return {
      error:
        "No pudimos crear tu cuenta. Si ya tienes una, intenta iniciar sesión.",
    };
  }

  if (!authData.user) {
    logger.info({ event: "auth.signup.no_user", ip });
    return {
      error: "No pudimos crear tu cuenta. Intenta de nuevo en un momento.",
    };
  }

  // Detección anti-enumeración: Supabase devuelve "éxito falso" con
  // identities=[] cuando el email YA ESTÁ registrado. Sin este check,
  // entraríamos al flujo de Customer.create con un userId existente, lo
  // cual rompería la unique constraint en email Y arriesgaría borrar el
  // user real en el rollback.
  const isExistingUser = (authData.user.identities ?? []).length === 0;
  if (isExistingUser) {
    logger.info({
      event: "auth.signup.already_exists",
      ip,
      userId: authData.user.id,
    });
    return {
      error:
        "Este correo ya tiene una cuenta. Inicia sesión o usa 'Olvidé mi contraseña'.",
    };
  }

  const userId = authData.user.id;

  try {
    await prisma.customer.create({
      data: {
        email: parsed.data.email,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName ?? null,
        supabaseUserId: userId,
        referralCode: generateReferralCode(),
        createdBy: userId,
      },
    });
  } catch (err) {
    logger.error(
      {
        event: "auth.signup.customer_create_fail",
        ip,
        userId,
        err: err instanceof Error ? err.message : String(err),
      },
      "Customer row failed; rolling back auth user (we created it)",
    );
    try {
      // Rollback SEGURO acá: detectamos arriba que el user NO existía
      // antes (identities.length > 0 → recién creado). Por tanto este
      // delete solo afecta la fila que acabamos de crear.
      await supabaseService.auth.admin.deleteUser(userId);
    } catch (rollbackErr) {
      logger.error(
        {
          event: "auth.signup.rollback_fail",
          ip,
          userId,
          err:
            rollbackErr instanceof Error
              ? rollbackErr.message
              : String(rollbackErr),
        },
        "Auth user rollback failed — manual cleanup may be required",
      );
    }
    return {
      error: "Algo salió mal creando tu perfil. Intenta de nuevo en un momento.",
    };
  }

  logger.info({
    event: "auth.signup.success",
    ip,
    userId,
    needsEmailConfirmation: !authData.session,
  });

  if (!authData.session) {
    return {
      success:
        "¡Cuenta creada! Te enviamos un correo para confirmar tu email. Revisa tu bandeja (incluido spam).",
    };
  }

  redirect("/");
}
