/*
 * GET /carrito/recuperar/[token] — link de recuperación de carrito abandonado (email).
 *
 * Restaura la sesión del carrito (cookie cart_session) y redirige a /carrito. El token es aleatorio
 * de 24 bytes (base64url) → no adivinable. Solo restaura si el carrito sigue activo (no convertido).
 *
 * #18 — si el cliente YA tiene un carrito activo, se folda (merge sin pérdida) en el recuperado en vez
 * de pisarlo. #19 — redirige con un aviso claro según el resultado. #20 — rate-limit por IP.
 */

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { setCartSessionCookie, peekCartSession } from "@/lib/cart-session";
import { mergeCartsAdopt } from "@/features/cart/service";
import { getClientIp } from "@/lib/client-ip";
import { rateLimit } from "@/lib/rate-limit";
import { ipKey } from "@/lib/rate-limit-keys";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // #20 — rate-limit por IP (generoso: click desde email es legítimo; frena la enumeración de tokens).
  const rl = await rateLimit(ipKey("cart_recover", getClientIp(req.headers)), 60, 60);
  if (!rl.allowed) {
    return new Response("Too many requests", { status: 429, headers: { "Retry-After": "60" } });
  }

  // #19 — el destino codifica el resultado con un ?success= (RouteToasts lo muestra y limpia el query).
  let dest = "/carrito?success=cart-link-invalido";
  try {
    if (token) {
      const ab = await prisma.abandonedCart.findUnique({
        where: { recoverToken: token },
        select: { cart: { select: { sessionId: true, deletedAt: true } } },
      });
      if (ab?.cart?.deletedAt) {
        // El carrito ya se convirtió en pedido → no hay nada que recuperar.
        dest = "/carrito?success=cart-ya-comprado";
      } else if (ab?.cart) {
        // #18 — foldar el carrito actual (si lo hay) en el recuperado ANTES de cambiar la cookie.
        const current = await peekCartSession();
        if (current && current !== ab.cart.sessionId) {
          await mergeCartsAdopt(current, ab.cart.sessionId);
        }
        await setCartSessionCookie(ab.cart.sessionId);
        dest = "/carrito?success=cart-recuperado";
      }
    }
  } catch (err) {
    logger.error({
      event: "cart_recovery.restore.fail",
      err: err instanceof Error ? err.message : String(err),
    });
    dest = "/carrito";
  }
  redirect(dest); // fuera del try/catch: redirect lanza NEXT_REDIRECT
}
