"use server";

import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import {
  ADMIN_ACTIVITY_COOKIE,
  ADMIN_IDLE_LIMIT_MS,
  readAdminActivityMark,
} from "@/lib/admin-activity";
import { recordAdminAction } from "@/lib/admin-audit";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { isMfaReauthRequired, MFA_REAUTH_MESSAGE, requireRecentMfa } from "@/lib/admin-reauth";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { getCurrentAdmin } from "@/lib/auth";
import { getClientIp } from "@/lib/client-ip";
import { logger } from "@/lib/logger";
import { calculatePasswordStrength } from "@/lib/password-strength";
import { checkPwnedPassword } from "@/lib/pwned-passwords";
import { rateLimit } from "@/lib/rate-limit";
import { ipKey, ownerKey } from "@/lib/rate-limit-keys";
import { recordSecurityEvent, SECURITY_EVENT } from "@/lib/security-events";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateRecoveryCodes } from "@/features/admin-mfa/recovery-codes";

/**
 * F-06 (auditoría integral 2026-09-19): la autogestión de seguridad (cambiar de
 * dispositivo MFA, regenerar recovery codes, cambiar contraseña) exige aal2 RECIENTE —
 * una sesión robada con aal2 viejo no puede enrolar el TOTP del atacante, cosechar
 * recovery codes nuevos ni rotar la contraseña.
 * Si la elevación es vieja, devuelve el marcador `reauthRequired`: la UI abre
 * el modal TOTP (components/admin/mfa-reauth) y reintenta la acción una vez.
 *
 * Sin loop con el enrolamiento INICIAL (B-1): ese flujo hace challengeAndVerify
 * en el browser segundos antes de llamar generateRecoveryCodesAction, así que
 * su amr ya viene fresco y el check pasa sin fricción nueva.
 */
async function requireRecentMfaOrMarker(): Promise<{ reauthRequired: true } | null> {
  try {
    await requireRecentMfa();
    return null;
  } catch (err) {
    if (isMfaReauthRequired(err)) return { reauthRequired: true };
    throw err;
  }
}

async function unenrollAllTotp(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.mfa.listFactors();
  for (const f of data?.all ?? []) {
    if (f.factor_type === "totp") {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
  }
}

/**
 * Cambiar de autenticador/dispositivo: desactiva el TOTP actual y manda a
 * configurar uno nuevo. Tras el unenroll la sesión queda sin factor: el gate de
 * enrolamiento obligatorio (B-1) la deja justo donde va el redirect de abajo
 * (/admin/seguridad, la excepción abierta a todos los roles).
 *
 * Nota de seguridad: no existe acción para «desactivar MFA» de forma permanente;
 * la verificación en 2 pasos es obligatoria para el 100 % de cuentas admin.
 */
export async function changeMfaDeviceAction(): Promise<{ reauthRequired: true } | void> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.ALL_PLUS_CMS });

  const reauth = await requireRecentMfaOrMarker();
  if (reauth) return reauth;

  await unenrollAllTotp();
  logger.info({ event: "security.admin_mfa_device_change", adminId: session.admin.id });
  await recordAdminAction({
    actorId: session.admin.id,
    action: "admin.mfa.change_device",
    entityType: "AdminUser",
    entityId: session.admin.id,
  });
  revalidatePath("/admin/seguridad");
  redirect("/admin/seguridad?reconfig=1");
}

export type RecoveryCodesState = { codes?: string[]; error?: string; reauthRequired?: boolean };

/**
 * Genera (o regenera) los códigos de respaldo y los devuelve para mostrarlos una vez.
 *
 * SIN revalidatePath (bug owner 2026-11-11): en el enrolamiento INICIAL la página
 * aún renderiza la rama «MFA desactivado» (<MfaEnroll>); invalidar la ruta en
 * mitad del flujo re-renderizaba el server component YA con el factor verificado,
 * cambiaba de rama y DESMONTABA <MfaEnroll> — los códigos recién generados
 * desaparecían de la pantalla al instante (el cliente solo veía «Regenerar
 * códigos de respaldo»). El conteo del panel se actualiza en cliente con
 * `state.codes.length` (recovery-codes-panel) y la página se refresca al
 * finalizar el enrolamiento (router.refresh en mfa-enroll.finish).
 */
export async function generateRecoveryCodesAction(): Promise<RecoveryCodesState> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.ALL_PLUS_CMS });

  const reauth = await requireRecentMfaOrMarker();
  if (reauth) return { error: MFA_REAUTH_MESSAGE, reauthRequired: true };

  const codes = await generateRecoveryCodes(session.admin.id);
  logger.info({ event: "security.admin_mfa_recovery_generated", adminId: session.admin.id });
  await recordAdminAction({
    actorId: session.admin.id,
    action: "admin.mfa.recovery_codes.generate",
    entityType: "AdminUser",
    entityId: session.admin.id,
  });
  return { codes };
}

const AdminPasswordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, "Ingresa tu contraseña actual."),
    newPassword: z
      .string()
      .min(10, "Usa al menos 10 caracteres para cuentas administrativas.")
      .max(72, "Máximo 72 caracteres."),
    confirmPassword: z.string().min(1, "Confirma la nueva contraseña."),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "Las contraseñas no coinciden.",
  })
  .refine((d) => d.newPassword !== d.currentPassword, {
    path: ["newPassword"],
    message: "La nueva contraseña debe ser diferente de la actual.",
  });

export type AdminPasswordChangeState = {
  error?: string;
  success?: string;
  reauthRequired?: boolean;
  fieldErrors?: Partial<Record<"currentPassword" | "newPassword" | "confirmPassword", string[]>>;
};

const PASSWORD_RL_SCOPE = "admin-change-password";
const PASSWORD_RL_WINDOW_SECONDS = 15 * 60;

/**
 * Autoservicio de cambio de contraseña para cuentas administrativas:
 *   1. Exige sesión admin con MFA `aal2` activo (`requireAdminAction`) + elevación TOTP reciente
 *      (`requireRecentMfa` ≤ 10 min; si venció devuelve `reauthRequired` para abrir el modal).
 *   2. Rate-limit doble bucket (IP + admin, 5 intentos / 15 min en prod).
 *   3. Valida longitud (10–72), fortaleza mínima (score ≥ 2) y no-reutilización.
 *   4. Verifica la contraseña actual con un cliente Supabase efímero SIN cookies (`persistSession: false`),
 *      evitando degradar el JWT `aal2` de la sesión actual a `aal1`.
 *   5. Verifica k-anonymity contra HaveIBeenPwned (`checkPwnedPassword`).
 *   6. Actualiza la contraseña bajo la sesión `aal2` actual y revoca todas las OTRAS sesiones
 *      (`signOut({ scope: "others" })`), auditando en `AdminActionLog`.
 */
export async function changeAdminPasswordAction(
  _prev: AdminPasswordChangeState | null,
  formData: FormData,
): Promise<AdminPasswordChangeState> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.ALL_PLUS_CMS });

  const parsed = AdminPasswordChangeSchema.safeParse({
    currentPassword: String(formData.get("currentPassword") ?? ""),
    newPassword: String(formData.get("newPassword") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
  });
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error);
    return {
      error: "Revisa los campos marcados.",
      fieldErrors: flat.fieldErrors as AdminPasswordChangeState["fieldErrors"],
    };
  }

  const strength = calculatePasswordStrength(parsed.data.newPassword);
  if (strength.score < 2) {
    return {
      error: "Elige una contraseña más robusta.",
      fieldErrors: {
        newPassword: [
          "La contraseña es muy predecible. Combina mayúsculas, minúsculas, números o símbolos.",
        ],
      },
    };
  }

  const reauth = await requireRecentMfaOrMarker();
  if (reauth) return { error: MFA_REAUTH_MESSAGE, reauthRequired: true };

  const ip = getClientIp(await headers());
  const limit = process.env.VERCEL_ENV === "production" ? 5 : 30;
  const [rlIp, rlAdmin] = await Promise.all([
    rateLimit(ipKey(PASSWORD_RL_SCOPE, ip), limit, PASSWORD_RL_WINDOW_SECONDS),
    rateLimit(ownerKey(PASSWORD_RL_SCOPE, session.admin.id), limit, PASSWORD_RL_WINDOW_SECONDS),
  ]);
  if (!rlIp.allowed || !rlAdmin.allowed) {
    logger.warn({
      event: "security.admin_change_password.rate_limited",
      ip,
      adminId: session.admin.id,
    });
    return { error: "Demasiados intentos. Espera unos minutos antes de reintentar." };
  }

  const email = session.user.email ?? session.admin.email;
  if (!email) {
    return { error: "Tu cuenta no tiene correo asociado." };
  }

  // Verificar contraseña actual en cliente efímero sin estado (NO toca las cookies aal2 del request).
  const verifier = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
  const { error: signInErr } = await verifier.auth.signInWithPassword({
    email,
    password: parsed.data.currentPassword,
  });
  if (signInErr) {
    logger.warn({
      event: "security.admin_change_password.reauth_fail",
      ip,
      adminId: session.admin.id,
    });
    await Promise.all([
      recordSecurityEvent({
        event: SECURITY_EVENT.ADMIN_LOGIN_FAIL,
        outcome: "failure",
        ip,
        actorId: session.admin.id,
        metadata: { code: "password_change_wrong_current" },
      }),
      recordAdminAction({
        actorId: session.admin.id,
        action: "admin.password.change_failure",
        entityType: "AdminUser",
        entityId: session.admin.id,
      }),
    ]);
    return { fieldErrors: { currentPassword: ["La contraseña actual no es correcta."] } };
  }
  await verifier.auth.signOut({ scope: "local" }).catch(() => {});

  // Bloquear contraseñas filtradas en brechas públicas (HIBP k-anonymity; fail-open si HIBP cae).
  const pwned = await checkPwnedPassword(parsed.data.newPassword);
  if (pwned.pwned === true && "count" in pwned) {
    return {
      fieldErrors: {
        newPassword: [
          "Esta contraseña apareció en filtraciones públicas conocidas. Elige una clave única.",
        ],
      },
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error: updateErr } = await supabase.auth.updateUser({
    password: parsed.data.newPassword,
  });
  if (updateErr) {
    logger.error({
      event: "security.admin_change_password.update_fail",
      adminId: session.admin.id,
      err: updateErr.message,
    });
    return { error: "No pudimos actualizar tu contraseña. Intenta de nuevo." };
  }

  let othersClosed = true;
  try {
    const { error: signOutErr } = await supabase.auth.signOut({ scope: "others" });
    if (signOutErr) {
      othersClosed = false;
      logger.warn({
        event: "security.admin_change_password.signout_others_fail",
        adminId: session.admin.id,
        err: signOutErr.message,
      });
    }
  } catch (err) {
    othersClosed = false;
    logger.warn({
      event: "security.admin_change_password.signout_others_throw",
      adminId: session.admin.id,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  await recordAdminAction({
    actorId: session.admin.id,
    action: "admin.password.change",
    entityType: "AdminUser",
    entityId: session.admin.id,
    metadata: { othersClosed },
  });
  logger.info({
    event: "security.admin_change_password.success",
    adminId: session.admin.id,
    othersClosed,
  });

  return {
    success: othersClosed
      ? "Tu contraseña quedó actualizada y cerramos tus sesiones en otros dispositivos."
      : "Tu contraseña quedó actualizada.",
  };
}

/*
 * Re-autenticación TOTP para acciones destructivas (auditoría pre-lanzamiento
 * 2026-09-04 · F-10 — step-up auth). La dispara <MfaReauthModal> cuando una
 * acción protegida con requireRecentMfa responde `reauthRequired` (aal2 viejo).
 *
 * Se verifica SERVER-side (no en el browser como el login MFA) porque así la
 * misma pieza concentra los tres controles del reto:
 *   1. Rate-limit doble bucket (IP + admin), mismo patrón que el código de
 *      respaldo de /admin/login/mfa: 5 intentos / 15 min en prod.
 *   2. Audit trail (mfa.reauth.success / mfa.reauth.failure) vía recordAdminAction.
 *   3. El challengeAndVerify escribe el JWT nuevo (aal2 + amr fresco) en las
 *      cookies DIRECTAMENTE — las Server Actions pueden mutar cookies — así el
 *      reintento de la acción protegida ya lee la elevación reciente.
 *
 * La sesión ya es aal2 (si fuese aal1 el guard la habría mandado a
 * /admin/login/mfa antes); esto solo renueva la FRESCURA del segundo factor.
 */

export type MfaReauthState = { error?: string; success?: boolean };

/** Scope de los buckets de rate-limit de este flujo (ver lib/rate-limit-keys). */
const REAUTH_RL_SCOPE = "admin-mfa-reauth";
/** Ventana de 15 min, igual que el login admin y el código de respaldo. */
const REAUTH_RL_WINDOW_SECONDS = 15 * 60;

export async function verifyAdminMfaReauthAction(
  _prev: MfaReauthState | null,
  formData: FormData,
): Promise<MfaReauthState> {
  // Sin requireAdminAction: ante sesión vencida se devuelve error al modal, no
  // redirect (la acción protegida ya hizo su propio gate antes de pedir esto).
  const session = await getCurrentAdmin();
  if (!session) return { error: "Tu sesión expiró. Inicia sesión de nuevo." };

  const activityMark = (await cookies()).get(ADMIN_ACTIVITY_COOKIE)?.value;
  const lastActivityAt = readAdminActivityMark(activityMark);
  if (lastActivityAt === null || Date.now() - lastActivityAt > ADMIN_IDLE_LIMIT_MS) {
    return { error: "Tu sesión expiró por inactividad. Inicia sesión de nuevo." };
  }

  const code = String(formData.get("code") ?? "").trim();
  // El campo vacío no gasta cuota: nunca puede acertar (patrón del recovery code).
  if (!code) return { error: "Escribe el código de 6 dígitos de tu app." };

  const ip = getClientIp(await headers());
  // Un intento fallido consume cuota igual (si no, el freno sería inútil).
  const limit = process.env.VERCEL_ENV === "production" ? 5 : 30;
  const [rlIp, rlAdmin] = await Promise.all([
    rateLimit(ipKey(REAUTH_RL_SCOPE, ip), limit, REAUTH_RL_WINDOW_SECONDS),
    rateLimit(ownerKey(REAUTH_RL_SCOPE, session.admin.id), limit, REAUTH_RL_WINDOW_SECONDS),
  ]);
  if (!rlIp.allowed || !rlAdmin.allowed) {
    logger.warn({
      event: "security.admin_mfa_reauth.rate_limited",
      ip,
      adminId: session.admin.id,
      ipCount: rlIp.count,
      adminCount: rlAdmin.count,
    });
    await recordSecurityEvent({
      event: SECURITY_EVENT.ADMIN_LOGIN_FAIL,
      outcome: "failure",
      ip,
      actorId: session.admin.id,
      metadata: {
        code: "admin_mfa_reauth_rate_limited",
        ipCount: rlIp.count,
        adminCount: rlAdmin.count,
      },
    });
    return { error: "Demasiados intentos. Por favor espera unos minutos antes de reintentar." };
  }

  if (!/^\d{6}$/.test(code)) {
    return { error: "El código tiene 6 dígitos numéricos." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const totpFactors = (factors?.all ?? []).filter(
    (f) => f.factor_type === "totp" && f.status === "verified",
  );
  if (totpFactors.length === 0) {
    // No debería pasar (el enrolamiento es obligatorio, B-1) — fail closed.
    logger.warn({ event: "security.admin_mfa_reauth.no_factor", adminId: session.admin.id });
    return { error: "Tu cuenta no tiene la verificación en 2 pasos activa." };
  }

  // Normalmente hay UN solo factor TOTP verificado; se prueban todos por si la
  // cuenta enroló dos veces (cada factor tiene su propio secreto).
  let verified = false;
  let lastError: string | null = null;
  for (const factor of totpFactors) {
    const { error: verifyErr } = await supabase.auth.mfa.challengeAndVerify({
      factorId: factor.id,
      code,
    });
    if (!verifyErr) {
      verified = true;
      break;
    }
    lastError = verifyErr.message;
  }

  if (!verified) {
    logger.warn({
      event: "security.admin_mfa_reauth.failed",
      ip,
      adminId: session.admin.id,
      err: lastError,
    });
    await Promise.all([
      recordSecurityEvent({
        event: SECURITY_EVENT.ADMIN_LOGIN_FAIL,
        outcome: "failure",
        ip,
        actorId: session.admin.id,
        metadata: { code: "admin_mfa_reauth_failed" },
      }),
      recordAdminAction({
        actorId: session.admin.id,
        action: "mfa.reauth.failure",
        entityType: "AdminUser",
        entityId: session.admin.id,
      }),
    ]);
    return { error: "Código incorrecto o vencido. Mira el código actual e intenta de nuevo." };
  }

  await recordAdminAction({
    actorId: session.admin.id,
    action: "mfa.reauth.success",
    entityType: "AdminUser",
    entityId: session.admin.id,
  });
  logger.info({ event: "security.admin_mfa_reauth.success", adminId: session.admin.id });
  return { success: true };
}
