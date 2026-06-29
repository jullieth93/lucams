/*
 * Server Action — logout.
 *
 * Llama supabase.auth.signOut() que invalida la sesión server-side y
 * borra las cookies vía el adapter. Después redirige a `/`.
 *
 * Se invoca desde cualquier form con `action={logoutAction}` — típicamente
 * un botón en el header dinámico.
 */

"use server";

import { redirect } from "next/navigation";
import { logger } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function logoutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase.auth.signOut();

  if (user) {
    logger.info({ event: "auth.logout.success", userId: user.id });
  }

  redirect("/");
}

/**
 * Logout del admin (Lucy 2026-06-27, Bloque C / A8). Usa scope "global" para
 * invalidar TODAS las sesiones/dispositivos del usuario (no solo la actual) — el
 * panel ve finanzas y datos de clientes, así que un "cerrar sesión" debe cerrar
 * en todos lados. Redirige a /admin/login.
 */
export async function adminLogoutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase.auth.signOut({ scope: "global" });

  if (user) {
    logger.info({ event: "auth.admin_logout.success", userId: user.id, scope: "global" });
  }

  redirect("/admin/login");
}
