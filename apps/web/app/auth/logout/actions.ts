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
