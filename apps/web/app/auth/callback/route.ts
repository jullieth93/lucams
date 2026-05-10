/*
 * GET /auth/callback — Supabase Auth callback URL.
 *
 * Esta es la URL a la que apuntan los emails que envía Supabase Auth:
 *   - Confirmación de email tras signup: type=signup (o sin type, depende
 *     de configuración).
 *   - Recovery flow de contraseña: type=recovery → tras exchange el user
 *     queda logueado temporalmente y lo redirigimos a /restablecer-password
 *     para que ponga la nueva contraseña.
 *   - Magic links (no usados aún): type=magiclink → exchange y home.
 *
 * Funcionamiento:
 *   1. Supabase pone `?code=XXX&type=...` en el URL del email.
 *   2. Acá llamamos `supabase.auth.exchangeCodeForSession(code)` que
 *      valida el código + escribe las cookies de sesión (vía el adapter
 *      getAll/setAll de createSupabaseServerClient).
 *   3. Redirigimos según `type`:
 *        recovery → /restablecer-password (form de nueva contraseña)
 *        cualquier otro → / (home, ya autenticado)
 *
 * Si el code es inválido o expiró, redirigimos a /login con mensaje de error.
 *
 * Referencias:
 *   - @supabase/ssr exchange flow.
 *   - docs/SECURITY.md § Auth callbacks.
 */

import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const type = url.searchParams.get("type");

  if (!code) {
    logger.info({ event: "auth.callback.missing_code", type });
    return NextResponse.redirect(new URL("/login?error=link-invalido", url));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    logger.info({
      event: "auth.callback.exchange_fail",
      type,
      code: error.code,
      status: error.status,
    });
    return NextResponse.redirect(new URL("/login?error=link-expirado", url));
  }

  logger.info({ event: "auth.callback.success", type });

  const destination = type === "recovery" ? "/restablecer-password" : "/";
  return NextResponse.redirect(new URL(destination, url));
}
