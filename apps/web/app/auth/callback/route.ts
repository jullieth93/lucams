/*
 * GET /auth/callback — Supabase Auth callback URL.
 *
 * Estado actual del repo (2026-05-11): este endpoint NO es disparado
 * por los flujos principales:
 *   - Signup confirmation → usa OTP, no link. Página: /confirmar-codigo.
 *   - Reset password → usa OTP, no link. Página: /restablecer-password.
 *
 * Se mantiene activo como fallback defensivo + para futuros flujos que
 * podrían querer link (ej. magic link auth, email change confirmation
 * — no implementados todavía).
 *
 * Funcionamiento (cuando se usa):
 *   1. Supabase pone `?code=XXX&type=...` en el URL del email.
 *   2. exchangeCodeForSession(code) valida + escribe cookies de sesión.
 *   3. Redirige a `/` o a `/restablecer-password` según `type`.
 *
 * Si el code es inválido o expiró, redirige a /login con mensaje de error.
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
