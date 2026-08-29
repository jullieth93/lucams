"use server";

/*
 * Acceso de emergencia con código de respaldo (Lucy 2026-06-27).
 *
 * En el reto MFA, si Lucy perdió el teléfono, puede entrar con un código de
 * respaldo. Al validarlo: se consume (un solo uso) y se DESACTIVA el factor
 * TOTP vía service role (la sesión aal1 no puede unenroll un factor verificado).
 * Queda sin MFA → entra y se le pide reconfigurarlo.
 *
 * Rate-limit (auditoría 2026-07-21 · B3): este es el ÚNICO camino que baja el
 * segundo factor, y no tenía freno — quien ya tuviera la contraseña podía
 * disparar intentos hasta acertar uno de los 10 códigos vivos. Mismo bucket
 * doble que /admin/login (IP + identidad) para cubrir los dos vectores: muchas
 * IPs contra un admin (botnet) y una IP probando sin parar.
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/auth";
import { getClientIp } from "@/lib/client-ip";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { ipKey, ownerKey } from "@/lib/rate-limit-keys";
import { supabaseService } from "@/lib/supabase/service";
import { consumeRecoveryCode } from "@/features/admin-mfa/recovery-codes";

export type RecoveryLoginState = { error?: string };

/** Scope de los buckets de rate-limit de este flujo (ver lib/rate-limit-keys). */
const RL_SCOPE = "admin-recovery-code";
/** Ventana de 15 min, igual que el login admin. */
const RL_WINDOW_SECONDS = 15 * 60;

export async function useRecoveryCodeAction(
  _prev: RecoveryLoginState | null,
  formData: FormData,
): Promise<RecoveryLoginState> {
  const session = await getCurrentAdmin();
  if (!session) return { error: "Sesión expirada. Inicia sesión de nuevo." };

  const code = String(formData.get("code") ?? "").trim();
  // El campo vacío no gasta cuota: nunca puede acertar un código.
  if (!code) return { error: "Escribe un código de respaldo." };

  const ip = getClientIp(await headers());
  // Admin es blanco de alto valor y Lucy usa este camino de emergencia una vez cada mucho:
  // 5 intentos por ventana alcanzan de sobra. En dev se relaja para no estorbar las pruebas.
  const limit = process.env.VERCEL_ENV === "production" ? 5 : 30;
  const [rlIp, rlAdmin] = await Promise.all([
    rateLimit(ipKey(RL_SCOPE, ip), limit, RL_WINDOW_SECONDS),
    rateLimit(ownerKey(RL_SCOPE, session.admin.id), limit, RL_WINDOW_SECONDS),
  ]);
  if (!rlIp.allowed || !rlAdmin.allowed) {
    logger.warn({
      event: "security.admin_recovery_code.rate_limited",
      ip,
      adminId: session.admin.id,
      ipCount: rlIp.count,
      adminCount: rlAdmin.count,
    });
    return { error: "Demasiados intentos. Por favor espera unos minutos antes de reintentar." };
  }

  const ok = await consumeRecoveryCode(session.admin.id, code);
  if (!ok) {
    // Con la IP el intento fallido sirve de rastro forense del brute force, no solo de contador.
    logger.warn({ event: "security.admin_recovery_code_failed", ip, adminId: session.admin.id });
    return { error: "Código de respaldo inválido o ya usado." };
  }

  // Desactivar el TOTP vía service role (auth.admin) — la sesión aal1 no puede.
  try {
    const { data } = await supabaseService.auth.admin.mfa.listFactors({
      userId: session.user.id,
    });
    for (const f of data?.factors ?? []) {
      if (f.factor_type === "totp") {
        await supabaseService.auth.admin.mfa.deleteFactor({ id: f.id, userId: session.user.id });
      }
    }
  } catch (err) {
    logger.error(
      {
        event: "security.admin_recovery_unenroll_fail",
        err: err instanceof Error ? err.message : String(err),
      },
      "Failed to unenroll TOTP via recovery code",
    );
    return { error: "No pudimos completar el acceso de emergencia. Intenta de nuevo." };
  }

  logger.info({ event: "security.admin_recovery_code_used", adminId: session.admin.id });
  // Sin factor → la sesión queda aal1=aal1 (el candado aal2 no se dispara) y
  // /admin/seguridad es la excepción del gate de enrolamiento obligatorio (B-1):
  // aterriza directo a reconfigurar el 2º factor.
  redirect("/admin/seguridad?reconfig=1");
}
