/*
 * Server Action — establecer nueva contraseña tras flujo de recovery.
 *
 * Pre-condición: el usuario ya pasó por /auth/callback?type=recovery, por
 * lo que tiene una sesión temporal válida. Acá solo llamamos
 * supabase.auth.updateUser({ password }) que requiere sesión.
 *
 * En éxito: redirect a /login con mensaje, forzamos logout para que
 * inicie sesión con la nueva contraseña (UX más clara que dejarlo
 * logueado silenciosamente).
 */

"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const Schema = z.object({
  password: z
    .string()
    .min(8, "Mínimo 8 caracteres")
    .max(72, "Máximo 72 caracteres"),
});

export type RestablecerActionState = {
  error?: string;
  fieldErrors?: Partial<Record<"password", string[]>>;
};

export async function restablecerPasswordAction(
  _prev: RestablecerActionState | null,
  formData: FormData,
): Promise<RestablecerActionState> {
  const parsed = Schema.safeParse({ password: formData.get("password") });
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error);
    return {
      error: "Contraseña inválida.",
      fieldErrors: flat.fieldErrors as RestablecerActionState["fieldErrors"],
    };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error:
        "No hay sesión activa. El link puede haber expirado — solicita uno nuevo.",
    };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    logger.info({
      event: "auth.restablecer.fail",
      userId: user.id,
      code: error.code,
      status: error.status,
    });
    return {
      error: "No pudimos actualizar tu contraseña. Intenta de nuevo.",
    };
  }

  logger.info({ event: "auth.restablecer.success", userId: user.id });

  // Cerrar la sesión temporal para forzar login limpio con la nueva contraseña.
  await supabase.auth.signOut();

  redirect("/login?reset=ok");
}
