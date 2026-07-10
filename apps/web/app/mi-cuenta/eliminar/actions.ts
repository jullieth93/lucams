/*
 * Server Action — eliminar la cuenta del cliente (Ley 1581).
 * Confirmación fuerte: escribir "ELIMINAR" + re-autenticación con la contraseña.
 * Irreversible → rate-limit + doble verificación antes de ejecutar.
 */

"use server";

import { redirect } from "next/navigation";
import { getCurrentCustomer } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { deleteCustomerAccount } from "@/features/account/delete-service";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { ownerKey } from "@/lib/rate-limit-keys";

export type DeleteAccountState = { error?: string };

const CONFIRM_WORD = "ELIMINAR";

export async function deleteAccountAction(
  _prev: DeleteAccountState | null,
  formData: FormData,
): Promise<DeleteAccountState> {
  const session = await getCurrentCustomer();
  if (!session) return { error: "Tu sesión expiró. Vuelve a iniciar sesión." };

  const rl = await rateLimit(ownerKey("delete-account", session.customer.id), 5, 15 * 60);
  if (!rl.allowed) {
    return { error: "Demasiados intentos. Espera unos minutos antes de reintentar." };
  }

  const confirm = String(formData.get("confirm") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (confirm !== CONFIRM_WORD) {
    return { error: `Escribe ${CONFIRM_WORD} (en mayúsculas) para confirmar.` };
  }

  const email = session.user.email;
  if (!email) return { error: "Tu cuenta no tiene correo asociado. Contáctanos." };

  // Re-autenticación con la contraseña actual (acción destructiva e irreversible).
  const supabase = await createSupabaseServerClient();
  const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
  if (signInErr) {
    logger.info({ event: "account.delete.reauth_fail", customerId: session.customer.id });
    return { error: "La contraseña no es correcta." };
  }

  await deleteCustomerAccount(session.customer.id, session.user.id);

  // Limpiar la sesión actual (el auth user ya no existe).
  await supabase.auth.signOut({ scope: "global" }).catch(() => {});

  redirect("/?cuenta_eliminada=1");
}
