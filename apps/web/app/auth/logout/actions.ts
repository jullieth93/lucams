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

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CUSTOMER_ACTIVITY_COOKIE } from "@/lib/customer-activity";
import { logger } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function logoutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase.auth.signOut();

  // Borrar también la marca de actividad del cliente (idle-timeout 30 días):
  // si quedara, la próxima sesión heredaría un timestamp viejo y podría
  // expirar de inmediato (o peor: un navegador compartido mezclaría marcas).
  (await cookies()).delete(CUSTOMER_ACTIVITY_COOKIE);

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
