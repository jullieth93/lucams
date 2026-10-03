/*
 * Step 1 — Datos del cliente: contacto + dirección de envío + facturación opcional.
 *
 * Etapa 1 (modo catálogo): este paso ES todo el checkout — en vez del formulario
 * completo se renderiza <QuoteForm> (cotización de 1 paso, cierra por WhatsApp)
 * y el stepper se oculta (no hay pasos 2 ni 3: envio/pago redirigen acá).
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isCatalogMode } from "@/lib/store-mode";
import { CheckoutStepper } from "../_components/stepper";
import { OrderSummary } from "../_components/order-summary";
import { DatosForm } from "./datos-form";
import { QuoteForm } from "./quote-form";
import {
  loadCheckoutContext,
  assertCheckoutAvailability,
  CheckoutError,
} from "@/features/checkout/service";
import { getSavedAddressesForCheckout } from "@/features/addresses/service";
import { getLucamsShippingSettings } from "@/features/shipping/settings";
import { getCheckoutTexts } from "../checkout-texts.server";

// Mensaje único cuando un item se agotó mientras estaba en el carrito (auditoría 2026-07-16).
const STOCK_GONE_MSG = "Uno de los productos ya no está disponible. Por favor revisa tu carrito.";

export const metadata: Metadata = {
  title: "Datos · Checkout",
  robots: { index: false, follow: false },
};

export default async function CheckoutDatosPage() {
  let ctx;
  try {
    ctx = await loadCheckoutContext();
    await assertCheckoutAvailability(ctx);
  } catch (err) {
    if (err instanceof CheckoutError && err.code === "CART_EMPTY") redirect("/carrito");
    if (err instanceof CheckoutError && err.code === "CART_NOT_FOUND") redirect("/carrito");
    if (err instanceof CheckoutError && err.code === "STOCK_UNAVAILABLE") {
      // El mensaje ya es customer-safe y nombra el producto cuando el service lo
      // conoce (2026-09-29); STOCK_GONE_MSG queda como fallback defensivo.
      const msg = err.message && err.message !== err.code ? err.message : STOCK_GONE_MSG;
      redirect(`/carrito?error=${encodeURIComponent(msg)}`);
    }
    throw err;
  }

  const catalog = isCatalogMode();
  // Las direcciones guardadas solo las usa el formulario full (DatosForm).
  const savedAddresses =
    !catalog && ctx.customerId ? await getSavedAddressesForCheckout(ctx.customerId) : [];
  // Roadmap B8 — textos CMS del paso (formulario de datos o cotización + resumen).
  const texts = await getCheckoutTexts();
  // Paquete G (2026-10-02) — zonas con envío propio habilitado, para que el
  // select de localidad marque cuáles NO lo tienen ("sin Envío Lucam's"). Es
  // solo informativo: la localidad es dato de dirección y sigue seleccionable
  // (puede haber transportadoras Aveonline para esa zona).
  const lucamsSettings = catalog ? null : await getLucamsShippingSettings();

  return (
    <div className="mx-auto max-w-6xl">
      {!catalog && <CheckoutStepper current={1} />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {catalog ? (
            <QuoteForm items={ctx.cart.items} texts={texts.quote} />
          ) : (
            <DatosForm
              initial={ctx.state}
              savedAddresses={savedAddresses}
              canSaveAddress={Boolean(ctx.customerId)}
              lucamsOwnShipping={
                lucamsSettings
                  ? { enabled: lucamsSettings.enabled, zones: lucamsSettings.zones }
                  : null
              }
              texts={texts.datos}
            />
          )}
        </div>
        <div className="lg:col-span-1">
          <OrderSummary cart={ctx.cart} texts={texts.summary} />
        </div>
      </div>
    </div>
  );
}
