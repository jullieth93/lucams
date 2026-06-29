"use server";

/*
 * Acceso de emergencia con código de respaldo (Lucy 2026-06-27).
 *
 * En el reto MFA, si Lucy perdió el teléfono, puede entrar con un código de
 * respaldo. Al validarlo: se consume (un solo uso) y se DESACTIVA el factor
 * TOTP vía service role (la sesión aal1 no puede unenroll un factor verificado).
 * Queda sin MFA → entra y se le pide reconfigurarlo.
 */

import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { supabaseService } from "@/lib/supabase/service";
import { consumeRecoveryCode } from "@/features/admin-mfa/recovery-codes";

export type RecoveryLoginState = { error?: string };

export async function useRecoveryCodeAction(
  _prev: RecoveryLoginState | null,
  formData: FormData,
): Promise<RecoveryLoginState> {
  const session = await getCurrentAdmin();
  if (!session) return { error: "Sesión expirada. Inicia sesión de nuevo." };

  const code = String(formData.get("code") ?? "").trim();
  if (!code) return { error: "Escribe un código de respaldo." };

  const ok = await consumeRecoveryCode(session.admin.id, code);
  if (!ok) {
    logger.warn({ event: "security.admin_recovery_code_failed", adminId: session.admin.id });
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
      { event: "security.admin_recovery_unenroll_fail", err: err instanceof Error ? err.message : String(err) },
      "Failed to unenroll TOTP via recovery code",
    );
    return { error: "No pudimos completar el acceso de emergencia. Intenta de nuevo." };
  }

  logger.info({ event: "security.admin_recovery_code_used", adminId: session.admin.id });
  // Sin factor → la sesión queda aal1=aal1, el candado del layout no se dispara.
  redirect("/admin/seguridad?reconfig=1");
}
