"use server";

import { redirect } from "next/navigation";
import { logger } from "@/lib/logger";
import { ShippingSelectionSchema } from "@/features/checkout/schemas";
import { saveShippingSelectionStep } from "@/features/checkout/service";

export async function selectShippingAction(formData: FormData): Promise<void> {
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

  await saveShippingSelectionStep(parsed.data);
  logger.info({
    event: "checkout.step.envio.saved",
    carrier: parsed.data.carrier,
    fleteCop: parsed.data.fleteCop,
  });
  redirect("/checkout/pago");
}
