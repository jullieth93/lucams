"use server";

import { redirect } from "next/navigation";
import { logger } from "@/lib/logger";
import {
  CheckoutError,
  finalizeCheckout,
  savePaymentMethodStep,
} from "@/features/checkout/service";

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
    const msg = err instanceof CheckoutError ? err.message : "Error iniciando pago";
    logger.error({
      event: "checkout.pago.finalize_fail",
      err: err instanceof Error ? err.message : String(err),
    });
    redirect(`/checkout/pago?error=${encodeURIComponent(msg)}`);
  }
}
