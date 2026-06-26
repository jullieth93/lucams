"use server";

import { redirect } from "next/navigation";
import { logger } from "@/lib/logger";
import {
  CheckoutError,
  finalizeCheckout,
  savePaymentMethodStep,
} from "@/features/checkout/service";
import { InsufficientStockError } from "@/features/orders/errors";

export async function payWompiAction(): Promise<void> {
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
