/*
 * Server Action — registro de nuevo cliente.
 *
 * Flujo (saga simple):
 *   1. Validar input con Zod (email, password ≥ 8, nombre).
 *   2. Rate-limit por IP (3 cuentas / hora) para mitigar abuso.
 *   3. supabase.auth.signUp({ email, password }) — crea fila en auth.users.
 *   4. prisma.customer.create — crea fila en Customer con supabaseUserId,
 *      referralCode único, y datos de perfil. Prisma usa DATABASE_URL con
 *      rol `postgres` → bypasea RLS automáticamente (no necesita service
 *      client; igual de seguro porque vive server-side).
 *   5. Compensación: si (4) falla, intentar borrar el auth.user vía
 *      supabaseService.auth.admin.deleteUser para no dejar huérfanos.
 *      Si la compensación también falla, log y devolver error genérico
 *      (el dueño puede usar /recuperar-password después).
 *
 * Email confirmation:
 *   - Supabase tiene confirmación de email habilitada por default.
 *   - Si `data.session === null`: se envió email; pedimos al usuario que
 *     revise su bandeja antes de poder iniciar sesión.
 *   - Si `data.session !== null`: la confirmación estaba apagada en la
 *     configuración del proyecto y el usuario queda logueado al instante.
 */

"use server";

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseService } from "@/lib/supabase/service";

const SignupSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z
    .string()
    .min(8, "Mínimo 8 caracteres")
    .max(72, "Máximo 72 caracteres"),
  firstName: z
    .string()
    .min(1, "Tu nombre es obligatorio")
    .max(50, "Máximo 50 caracteres"),
  lastName: z.string().max(50, "Máximo 50 caracteres").optional(),
});

export type SignupActionState = {
  error?: string;
  success?: string;
  fieldErrors?: Partial<
    Record<"email" | "password" | "firstName" | "lastName", string[]>
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
  const rl = await rateLimit(`signup:${ip}`, 3, 60 * 60);
  if (!rl.allowed) {
    logger.warn({ event: "auth.signup.rate_limited", ip, count: rl.count });
    return {
      error:
        "Demasiados intentos de registro. Espera una hora antes de reintentar.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (authError || !authData.user) {
    logger.info({
      event: "auth.signup.auth_fail",
      ip,
      code: authError?.code,
      status: authError?.status,
    });
    return {
      error:
        "No pudimos crear tu cuenta. Si ya tienes una, intenta iniciar sesión.",
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
      "Customer row failed; attempting auth user rollback",
    );
    try {
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
