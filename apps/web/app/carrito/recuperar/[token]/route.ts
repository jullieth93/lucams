/*
 * GET /carrito/recuperar/[token] — link de recuperación de carrito abandonado (email).
 *
 * Restaura la sesión del carrito (setea la cookie cart_session al sessionId del carrito) y redirige
 * a /carrito. El token es aleatorio de 24 bytes (base64url) → no adivinable, tan seguro como el
 * email. Solo restaura si el carrito sigue activo (no soft-deleted = no convertido).
 */

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { setCartSessionCookie } from "@/lib/cart-session";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    if (token) {
      const ab = await prisma.abandonedCart.findUnique({
        where: { recoverToken: token },
        select: { cart: { select: { sessionId: true, deletedAt: true } } },
      });
      if (ab?.cart && !ab.cart.deletedAt) {
        await setCartSessionCookie(ab.cart.sessionId);
      }
    }
  } catch (err) {
    logger.error({
      event: "cart_recovery.restore.fail",
      err: err instanceof Error ? err.message : String(err),
    });
  }
  redirect("/carrito");
}
