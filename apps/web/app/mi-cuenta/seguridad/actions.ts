/*
 * Server Action — cambiar contraseña ESTANDO logueado.
 *
 * Diferencias con restablecer-password (que usa OTP): acá ya hay sesión, así que
 * RE-AUTENTICAMOS verificando la contraseña actual con signInWithPassword antes de
 * updateUser (evita que alguien con la sesión abierta —equipo prestado— la cambie
 * sin conocer la actual). Además: Zod (8–72), checkPwnedPassword (HIBP k-anon),
 * rate-limit por cliente, y signOut de OTRAS sesiones tras el cambio.
 */

"use server";

import { z } from "zod";
import { getCurrentCustomer } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { checkPwnedPassword } from "@/lib/pwned-passwords";
import { rateLimit } from "@/lib/rate-limit";
import { ownerKey } from "@/lib/rate-limit-keys";

const ChangeSchema = z
  .object({
    currentPassword: z.string().min(1, "Ingresa tu contraseña actual."),
    newPassword: z.string().min(8, "Mínimo 8 caracteres.").max(72, "Máximo 72 caracteres."),
    confirmPassword: z.string().min(1, "Confirma la nueva contraseña."),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "Las contraseñas no coinciden.",
  });

export type ChangePasswordState = {
  error?: string;
  success?: string;
  fieldErrors?: Partial<Record<"currentPassword" | "newPassword" | "confirmPassword", string[]>>;
};

export async function changePasswordAction(
  _prev: ChangePasswordState | null,
  formData: FormData,
): Promise<ChangePasswordState> {
  const session = await getCurrentCustomer();
  if (!session) return { error: "Tu sesión expiró. Vuelve a iniciar sesión." };

  const rl = await rateLimit(ownerKey("change-password", session.customer.id), 5, 15 * 60);
  if (!rl.allowed) {
    return { error: "Demasiados intentos. Espera unos minutos antes de reintentar." };
  }

  const parsed = ChangeSchema.safeParse({
    currentPassword: String(formData.get("currentPassword") ?? ""),
    newPassword: String(formData.get("newPassword") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
  });
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error);
    return {
      error: "Revisa los datos.",
      fieldErrors: flat.fieldErrors as ChangePasswordState["fieldErrors"],
    };
  }

  const email = session.user.email;
  if (!email) return { error: "Tu cuenta no tiene correo asociado. Contáctanos." };

  const supabase = await createSupabaseServerClient();

  // 1) Re-autenticación: verificar la contraseña ACTUAL.
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email,
    password: parsed.data.currentPassword,
  });
  if (signInErr) {
    logger.info({ event: "security.change_password.reauth_fail", customerId: session.customer.id });
    return { fieldErrors: { currentPassword: ["La contraseña actual no es correcta."] } };
  }

  // 2) Bloquear contraseñas comprometidas (HIBP). Si el servicio falla, no bloquea.
  const pwned = await checkPwnedPassword(parsed.data.newPassword);
  if (pwned.pwned === true && "count" in pwned) {
    return {
      fieldErrors: {
        newPassword: ["Esa contraseña apareció en filtraciones conocidas. Elige otra."],
      },
    };
  }

  // 3) Cambiar la contraseña.
  const { error: updateErr } = await supabase.auth.updateUser({
    password: parsed.data.newPassword,
  });
  if (updateErr) {
    logger.error({
      event: "security.change_password.update_fail",
      customerId: session.customer.id,
      err: updateErr.message,
    });
    return { error: "No pudimos cambiar la contraseña. Intenta de nuevo." };
  }

  // 4) Revocar OTRAS sesiones (otros dispositivos) — la actual sigue viva. Se
  //    verifica el resultado: si falla, NO afirmamos que se cerraron (mensaje honesto).
  let othersClosed = true;
  try {
    const { error: signOutErr } = await supabase.auth.signOut({ scope: "others" });
    if (signOutErr) {
      othersClosed = false;
      logger.warn({
        event: "security.change_password.signout_others_fail",
        customerId: session.customer.id,
        err: signOutErr.message,
      });
    }
  } catch (err) {
    othersClosed = false;
    logger.warn({
      event: "security.change_password.signout_others_throw",
      customerId: session.customer.id,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  logger.info({ event: "security.change_password.success", customerId: session.customer.id });
  return {
    success: othersClosed
      ? "Tu contraseña quedó actualizada. Cerramos tus otras sesiones por seguridad."
      : "Tu contraseña quedó actualizada.",
  };
}
