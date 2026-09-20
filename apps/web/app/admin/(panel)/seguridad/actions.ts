"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { recordAdminAction } from "@/lib/admin-audit";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { isMfaReauthRequired, MFA_REAUTH_MESSAGE, requireRecentMfa } from "@/lib/admin-reauth";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { getCurrentAdmin } from "@/lib/auth";
import { getClientIp } from "@/lib/client-ip";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { ipKey, ownerKey } from "@/lib/rate-limit-keys";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateRecoveryCodes } from "@/features/admin-mfa/recovery-codes";

/**
 * F-06 (auditoría integral 2026-09-19): la autogestión de MFA (desactivar,
 * cambiar de dispositivo, regenerar recovery codes) exige aal2 RECIENTE — una
 * sesión robada con aal2 viejo no puede enrolar el TOTP del atacante ni
 * cosechar recovery codes nuevos (que se devuelven en claro al cliente).
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

/** Desactiva (unenroll) los factores TOTP del admin actual + borra recovery codes. */
export async function disableMfaAction(): Promise<{ reauthRequired: true } | void> {
  // Autoservicio de la PROPIA cuenta (session.admin.id): con MFA obligatorio para
  // todo rol (B-1), la pantalla y sus acciones son ALL_PLUS_CMS. aal2 se mantiene.
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.ALL_PLUS_CMS });

  const reauth = await requireRecentMfaOrMarker();
  if (reauth) return reauth;

  await unenrollAllTotp();
  await prismaDeleteRecoveryCodes(session.admin.id);

  logger.info({ event: "security.admin_mfa_disabled", adminId: session.admin.id });
  await recordAdminAction({
    actorId: session.admin.id,
    action: "admin.mfa.disable",
    entityType: "AdminUser",
    entityId: session.admin.id,
  });
  revalidatePath("/admin/seguridad");
}

/**
 * Cambiar de autenticador/dispositivo: desactiva el TOTP actual y manda a
 * configurar uno nuevo. Tras el unenroll la sesión queda sin factor: el gate de
 * enrolamiento obligatorio (B-1) la deja justo donde va el redirect de abajo
 * (/admin/seguridad, la excepción abierta a todos los roles).
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

/** Genera (o regenera) los códigos de respaldo y los devuelve para mostrarlos una vez. */
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
  revalidatePath("/admin/seguridad");
  return { codes };
}

// Import perezoso para no acoplar el delete al feature module en disable.
async function prismaDeleteRecoveryCodes(adminUserId: string): Promise<void> {
  const { prisma } = await import("@/lib/db");
  await prisma.adminRecoveryCode.deleteMany({ where: { adminUserId } });
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
    await recordAdminAction({
      actorId: session.admin.id,
      action: "mfa.reauth.failure",
      entityType: "AdminUser",
      entityId: session.admin.id,
    });
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
