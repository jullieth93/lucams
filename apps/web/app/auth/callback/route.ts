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
import { recoverCustomerCartSessionId } from "@/features/cart/service";
import { CART_SESSION_COOKIE, cartSessionCookieOptions, peekCartSession } from "@/lib/cart-session";
import {
  CUSTOMER_ACTIVITY_COOKIE,
  customerActivityCookieOptions,
  sealCustomerActivityMark,
} from "@/lib/customer-activity";
import { prisma } from "@/lib/db";
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
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

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
  const response = NextResponse.redirect(new URL(destination, url));
  // El exchange PKCE crea sesión: sellar la marca de actividad del cliente
  // (idle-timeout 30 días — lib/customer-activity.ts). En type=recovery la
  // sesión es temporal (restablecer-password termina con signOut global), pero
  // sellar igual es inofensivo y mantiene el invariante "sesión ⇒ marca".
  response.cookies.set(
    CUSTOMER_ACTIVITY_COOKIE,
    sealCustomerActivityMark(Date.now()),
    customerActivityCookieOptions(),
  );

  // Recuperación de carrito (misma regla que login/OTP): si el navegador NO
  // trae cookie de carrito anónimo (el logout la borra), se escribe la cookie
  // con el sessionId del carrito vivo más reciente del cliente para que
  // reaparezca. Con cookie anónima presente se conserva el comportamiento
  // histórico de este endpoint (sin merge). En type=recovery no aplica: esa
  // sesión es temporal y termina en un signOut global al cambiar la clave.
  // Best-effort: un fallo acá NUNCA rompe el callback de auth.
  if (type !== "recovery" && data.user) {
    try {
      const anonSessionId = await peekCartSession();
      if (!anonSessionId) {
        const customer = await prisma.customer.findFirst({
          where: { supabaseUserId: data.user.id, deletedAt: null },
          select: { id: true },
        });
        const cartSessionId = customer ? await recoverCustomerCartSessionId(customer.id) : null;
        if (cartSessionId) {
          response.cookies.set(CART_SESSION_COOKIE, cartSessionId, cartSessionCookieOptions());
        }
      }
    } catch (err) {
      logger.warn({
        event: "auth.callback.cart_recover_fail",
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return response;
}
