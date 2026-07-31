/*
 * Loading del paso de ENVÍO (auditoría v3 · H13). La cotización de Aveonline tarda 7-11s
 * server-side; sin este loading la transición datos→envío se sentía CONGELADA (pantalla anterior
 * quieta, sin feedback). Next lo muestra automáticamente mientras el server component streamea.
 * Mantiene el stepper para evitar layout shift.
 */

import { Loader2 } from "lucide-react";
import { CheckoutStepper } from "../_components/stepper";
import { getCheckoutTexts } from "../checkout-texts.server";

export default async function Loading() {
  // Roadmap B8 — textos del loading administrables desde /admin/contenido.
  const texts = await getCheckoutTexts();
  return (
    <div className="mx-auto max-w-6xl">
      <CheckoutStepper current={2} />

      <div className="border-brand-purple/10 mt-8 flex flex-col items-center justify-center gap-4 rounded-2xl border bg-white px-6 py-16 text-center shadow-sm">
        <Loader2 className="text-brand-purple h-10 w-10 animate-spin" />
        <div>
          <p className="text-brand-purple-dark text-lg font-bold">{texts.shipping.loading}</p>
          <p className="text-brand-muted mt-1 text-sm">{texts.shipping.loadingSub}</p>
        </div>
      </div>
    </div>
  );
}
