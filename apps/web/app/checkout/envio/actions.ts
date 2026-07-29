"use server";

import { redirect } from "next/navigation";
import { logger } from "@/lib/logger";
import { ShippingSelectionSchema } from "@/features/checkout/schemas";
import { CheckoutError, saveShippingSelectionStep } from "@/features/checkout/service";
import { guardTransactionalAction } from "@/lib/stage-guard";

export async function selectShippingAction(formData: FormData): Promise<void> {
  // Etapa 1: no hay envío que seleccionar. Antes del parseo — el flete llega del FormData.
  guardTransactionalAction("selectShippingAction");

  const raw = {
    carrier: String(formData.get("carrier") ?? ""),
    carrierName: String(formData.get("carrierName") ?? ""),
    fleteCop: Number(formData.get("fleteCop") ?? 0),
    deliveryDays: Number(formData.get("deliveryDays") ?? 0),
    contraentrega: formData.get("contraentrega") === "true",
    quoteId: String(formData.get("quoteId") ?? ""),
  };
  const parsed = ShippingSelectionSchema.safeParse(raw);
  if (!parsed.success) {
    redirect(`/checkout/envio?error=${encodeURIComponent("Selección inválida")}`);
  }

  // Los campos sueltos del form NO se confían: saveShippingSelectionStep valida la
  // selección contra el set de cotizaciones sellado HMAC en `offersToken` (si el
  // cliente manipuló fleteCop/carrier, no hay match → rebota a re-cotizar).
  const offersToken = String(formData.get("offersToken") ?? "");
  try {
    await saveShippingSelectionStep(parsed.data, offersToken);
  } catch (err) {
    if (err instanceof CheckoutError && err.code === "SHIPPING_SELECTION_INVALID") {
      logger.warn({ event: "checkout.step.envio.selection_rejected" });
      redirect(`/checkout/envio?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }
  logger.info({
    event: "checkout.step.envio.saved",
    carrier: parsed.data.carrier,
    fleteCop: parsed.data.fleteCop,
  });
  redirect("/checkout/pago");
}
