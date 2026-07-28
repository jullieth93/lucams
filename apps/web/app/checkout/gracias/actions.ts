"use server";

import { finishCheckoutSession } from "@/features/checkout/service";
import { guardTransactionalAction } from "@/lib/stage-guard";

// La cookie de checkout solo puede borrarse desde una Server Action o Route
// Handler. En el render RSC de /checkout/gracias, `cookies().delete()` revienta
// la página entera (verificado E2E sandbox 2026-07-28: el cliente que acababa
// de pagar veía "Algo salió mal de nuestro lado" en vez de la confirmación).
export async function clearCheckoutSessionAction() {
  guardTransactionalAction("clearCheckoutSession");
  await finishCheckoutSession();
}
