"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { ipKey } from "@/lib/rate-limit-keys";
import {
  CheckoutError,
  finalizeCheckout,
  savePaymentMethodStep,
} from "@/features/checkout/service";
import { InsufficientStockError } from "@/features/orders/errors";

export async function payWompiAction(): Promise<void> {
  // T4 — rate-limit por IP: finalizeCheckout crea una orden + pega a Wompi, así
  // que limitamos el abuso (creación masiva de órdenes basura). Generoso para no
  // bloquear reintentos legítimos de un cliente con errores.
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const isProd = process.env.VERCEL_ENV === "production";
  const rl = await rateLimit(ipKey("checkout_pay", ip), isProd ? 20 : 100, 600);
  if (!rl.allowed) {
    logger.warn({ event: "checkout.pago.rate_limited", ip, count: rl.count });
    redirect(
      `/checkout/pago?error=${encodeURIComponent(
        "Demasiados intentos seguidos. Espera unos minutos e inténtalo de nuevo.",
      )}`,
    );
  }

  await savePaymentMethodStep("WOMPI");

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:4000";
  const redirectUrl = `${siteUrl}/checkout/gracias`;

  try {
    const result = await finalizeCheckout({ redirectUrl });
    logger.info({
      event: "checkout.pago.redirect_wompi",
      orderId: result.orderId,
      orderNumber: result.orderNumber,
    });
    redirect(result.checkoutUrl);
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    // P0-002 — Stock se agotó entre /checkout/datos y este finalizeCheckout.
    // Redirigir a /carrito con mensaje claro. El cart todavía tiene los items
    // (no se vacía hasta PAID) — cliente puede ajustar qty o quitar el item.
    if (err instanceof InsufficientStockError) {
      logger.warn({
        event: "checkout.pago.stock_unavailable",
        variantId: err.variantId,
        requested: err.requested,
        available: err.available ?? null,
      });
      redirect(
        `/carrito?error=${encodeURIComponent(
          "Uno de los productos ya no está disponible. Por favor revisa tu carrito.",
        )}`,
      );
    }
    const msg = err instanceof CheckoutError ? err.message : "Error iniciando pago";
    logger.error({
      event: "checkout.pago.finalize_fail",
      err: err instanceof Error ? err.message : String(err),
    });
    redirect(`/checkout/pago?error=${encodeURIComponent(msg)}`);
  }
}
