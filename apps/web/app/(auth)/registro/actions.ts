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
import { Prisma } from "@lucams/db";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getRequestOrigin } from "@/lib/origin";
import { checkPwnedPassword } from "@/lib/pwned-passwords";
import { rateLimit } from "@/lib/rate-limit";
import { emailKey, ipKey } from "@/lib/rate-limit-keys";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { recordHabeasDataConsent } from "@/features/consent/service";
import { attachReferral, findReferrerByCode } from "@/features/referrals/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseService } from "@/lib/supabase/service";
import { getClientIp } from "@/lib/client-ip";

const SignupSchema = z
  .object({
    email: z.string().email("Email inválido"),
    password: z.string().min(8, "Mínimo 8 caracteres").max(72, "Máximo 72 caracteres"),
    passwordConfirm: z.string(),
    firstName: z.string().min(1, "Tu nombre es obligatorio").max(50, "Máximo 50 caracteres"),
    lastName: z.string().max(50, "Máximo 50 caracteres").optional(),
    // Referidos v1 (2026-08-11): código opcional, se valida contra DB en la action.
    referralCode: z.string().max(20, "Máximo 20 caracteres").optional(),
  })
  .refine((d) => d.password === d.passwordConfirm, {
    message: "Las contraseñas no coinciden.",
    path: ["passwordConfirm"],
  });

export type SignupActionState = {
  error?: string;
  success?: string;
  fieldErrors?: Partial<
    // `dataConsent` no viene del schema Zod: es la casilla de autorización, que se valida aparte
    // y antes, para no tocar la PII sin permiso del titular.
    Record<
      | "email"
      | "password"
      | "passwordConfirm"
      | "firstName"
      | "lastName"
      | "dataConsent"
      | "referralCode",
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
    referralCode: formData.get("referralCode") || undefined,
  };

  const parsed = SignupSchema.safeParse(raw);
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error);
    return {
      error: "Datos inválidos.",
      fieldErrors: flat.fieldErrors as SignupActionState["fieldErrors"],
    };
  }

  // ─── Autorización de tratamiento de datos (Ley 1581 art. 9) ───
  // PREVIA a persistir la PII y a crear el usuario. Antes el consentimiento se registraba
  // server-side infiriéndolo de un aviso pasivo del formulario, sin ningún acto afirmativo del
  // titular — y el aviso de privacidad declaraba públicamente una casilla que no existía.
  if (formData.get("dataConsent") !== "on") {
    return {
      error: "Para crear tu cuenta debes autorizar el tratamiento de tus datos personales.",
      fieldErrors: { dataConsent: ["Autoriza el tratamiento de tus datos para crear tu cuenta."] },
    };
  }

  const hdrs = await headers();
  const ip = getClientIp(hdrs);

  // Anti-bot (Bloque C / T2): registro es un flujo de alto abuso.
  const turnstile = await verifyTurnstileToken(
    String(formData.get("cf-turnstile-response") ?? ""),
    ip,
  );
  if (!turnstile.success) {
    return {
      error: "No pudimos verificar que no eres un robot. Recarga la página e intenta de nuevo.",
    };
  }

  // Límites: pre-launch intermedios (Lucy testeando sin tropezar pero
  // bots básicos bloqueados); preview/dev generosos.
  // TODO al lanzar de verdad (custom domain + tráfico real): bajar prod
  // a 3/hora signup, 5/15min login, 3/hora reset, o usar env var
  // LUCAMS_RATE_LIMIT_MODE=strict para discriminar sin tocar código.
  const isProd = process.env.VERCEL_ENV === "production";

  // Rate-limit doble: por IP y por email. Cubre botnet (muchas IPs ↔ 1
  // email) Y un atacante atacando muchos emails desde una IP.
  // Bucket de IP y bucket de email tienen mismos límites durante
  // pre-launch (testing requiere room). Defense-in-depth real cuando
  // bajemos prod a límites estrictos al lanzar — TODO mismo que en
  // registro/actions.ts cabecera.
  const rlIp = await rateLimit(ipKey("signup", ip), isProd ? 10 : 30, 60 * 60);
  const rlEmail = await rateLimit(emailKey("signup", parsed.data.email), isProd ? 10 : 30, 60 * 60);
  if (!rlIp.allowed || !rlEmail.allowed) {
    logger.warn({
      event: "auth.signup.rate_limited",
      ip,
      ipCount: rlIp.count,
      emailCount: rlEmail.count,
    });
    return {
      error: "Demasiados intentos de registro. Espera una hora antes de reintentar.",
    };
  }

  // Pwned Passwords check. Si está en breaches conocidos, bloqueamos.
  // Fail-open si el servicio cae (no bloqueamos al user por nuestro
  // problema operacional).
  const pwned = await checkPwnedPassword(parsed.data.password);
  if (pwned.pwned === true && "count" in pwned) {
    logger.info({
      event: "security.pwned.signup_block",
      ip,
      count: pwned.count,
    });
    return {
      error: "Contraseña insegura.",
      fieldErrors: {
        password: [
          `Esta contraseña apareció en filtraciones de datos públicas (${pwned.count.toLocaleString()} veces). Elige una distinta.`,
        ],
      },
    };
  }

  const origin = await getRequestOrigin();

  // Referidos v1 (2026-08-11) — validar el código ANTES de crear el usuario:
  // un código inválido no debe dejar una cuenta creada a medias (campo opcional;
  // el ata real ocurre tras crear el Customer, ver abajo).
  if (parsed.data.referralCode?.trim()) {
    const referrer = await findReferrerByCode(parsed.data.referralCode);
    if (!referrer) {
      return {
        error: "Revisa el código de referido.",
        fieldErrors: { referralCode: ["Ese código de referido no existe."] },
      };
    }
    if (referrer.email.toLowerCase() === parsed.data.email.toLowerCase()) {
      return {
        error: "Revisa el código de referido.",
        fieldErrors: { referralCode: ["No puedes usar tu propio código de referido."] },
      };
    }
  }

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
      error: "No pudimos crear tu cuenta. Si ya tienes una, intenta iniciar sesión.",
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
      error: "Este correo ya tiene una cuenta. Inicia sesión o usa 'Olvidé mi contraseña'.",
    };
  }

  const userId = authData.user.id;

  try {
    const customer = await prisma.customer.create({
      data: {
        email: parsed.data.email,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName ?? null,
        supabaseUserId: userId,
        referralCode: generateReferralCode(),
        createdBy: userId,
      },
    });

    // Referidos v1 — ata del código (Referral PENDING + referredById). La
    // validación ya ocurrió antes del signUp; esto solo persiste el vínculo.
    // Best-effort: un fallo aquí NUNCA aborta el registro.
    if (parsed.data.referralCode?.trim()) {
      try {
        await attachReferral({
          refereeCustomerId: customer.id,
          refereeEmail: parsed.data.email,
          rawCode: parsed.data.referralCode,
        });
      } catch (refErr) {
        logger.error({
          event: "auth.signup.referral_attach_fail",
          userId,
          err: refErr instanceof Error ? refErr.message : String(refErr),
        });
      }
    }

    // Audit trail Ley 1581: persistir la autorización de tratamiento de datos (habeas data)
    // que el titular otorgó al aceptar los términos en el formulario. Best-effort: si la
    // escritura de auditoría falla NO abortamos el registro (el consentimiento ya se dio),
    // solo lo logueamos. Va en un try anidado para no disparar el rollback del auth user.
    try {
      await recordHabeasDataConsent({
        customerId: customer.id,
        email: parsed.data.email,
        ip,
        userAgent: hdrs.get("user-agent"),
      });
    } catch (consentErr) {
      logger.error(
        {
          event: "auth.signup.consent_record_fail",
          ip,
          userId,
          err: consentErr instanceof Error ? consentErr.message : String(consentErr),
        },
        "Habeas data consent row failed to persist (signup continued)",
      );
    }
  } catch (err) {
    // Detección específica del caso "huérfano en Customer":
    // P2002 = Prisma unique constraint violation. La causa más probable
    // es un Customer huérfano (auth.user fue borrado pero Customer
    // sobrevivió). Con el trigger sync_auth_users_delete en producción
    // esto no debería ocurrir nunca — pero en caso de inconsistencia
    // damos un mensaje accionable en lugar del genérico.
    const isUniqueViolation =
      err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
    const violatedField =
      isUniqueViolation && Array.isArray(err.meta?.target)
        ? (err.meta.target as string[])[0]
        : undefined;

    logger.error(
      {
        event: "auth.signup.customer_create_fail",
        ip,
        userId,
        prismaCode: isUniqueViolation ? err.code : undefined,
        violatedField,
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
          err: rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr),
        },
        "Auth user rollback failed — manual cleanup may be required",
      );
    }

    if (isUniqueViolation && violatedField === "email") {
      return {
        error:
          "Este correo ya estuvo asociado a una cuenta anterior. Si fue tuya, escribe a soporte para reactivarla. Si crees que es un error, intenta con otro correo.",
      };
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

  // Si Supabase requiere email confirmation (default), Supabase envió un
  // OTP de 6 dígitos al correo (configurado en email template).
  // Redirigimos a /confirmar-codigo donde el user lo tipea.
  //
  // Si email confirmation está desactivado (sólo dev), session viene
  // populated y entramos directo.
  if (!authData.session) {
    const params = new URLSearchParams({
      email: parsed.data.email,
      firstName: parsed.data.firstName,
    });
    redirect(`/confirmar-codigo?${params.toString()}`);
  }

  redirect("/");
}
