/*
 * Step 2 — Selección de transportadora.
 *
 * Llama Aveonline para cotizar al cargar (server). Si quote falla
 * (Aveonline down, ciudad no servida, etc.), muestra fallback con CTA
 * a contacto WhatsApp.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Truck, AlertCircle } from "lucide-react";
import { CheckoutStepper } from "../_components/stepper";
import { OrderSummary } from "../_components/order-summary";
import { EnvioStep } from "./envio-step";
import { CheckoutError, loadCheckoutContext, quoteShipping } from "@/features/checkout/service";

export const metadata: Metadata = {
  title: "Envío · Checkout",
  robots: { index: false, follow: false },
};

export default async function CheckoutEnvioPage() {
  let ctx;
  try {
    ctx = await loadCheckoutContext();
  } catch (err) {
    if (err instanceof CheckoutError) {
      if (err.code === "CART_EMPTY" || err.code === "CART_NOT_FOUND") redirect("/carrito");
    }
    throw err;
  }

  // Si no completó step 1, mandar de vuelta.
  if (!ctx.state.contact || !ctx.state.address) {
    redirect("/checkout/datos");
  }

  // Cotizar Aveonline. Si falla, mostramos fallback (no crash).
  let quotes: Awaited<ReturnType<typeof quoteShipping>> | null = null;
  let quoteErrorMessage: string | null = null;
  try {
    quotes = await quoteShipping({
      destinationCity: ctx.state.address.city,
      destinationDepartment: ctx.state.address.department,
      contraentrega: false,
    });
  } catch (err) {
    quoteErrorMessage =
      err instanceof CheckoutError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Error inesperado cotizando envío";
  }

  return (
    <div className="mx-auto max-w-6xl">
      <CheckoutStepper current={2} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {quoteErrorMessage || !quotes || quotes.length === 0 ? (
          <>
            <div className="lg:col-span-2">
              <section className="border-brand-purple/10 rounded-2xl border bg-white p-5 shadow-sm sm:p-6">
                <h2 className="text-brand-purple-dark font-display mb-1 flex items-center gap-2 text-lg font-bold">
                  <Truck className="h-5 w-5" />
                  Elegí cómo te lo enviamos
                </h2>
                <p className="text-brand-purple-dark/65 mb-5 text-sm">
                  Cotizamos con Aveonline para{" "}
                  <strong>
                    {ctx.state.address.city}, {ctx.state.address.department}
                  </strong>
                  .
                </p>
                <QuoteError
                  message={
                    quoteErrorMessage ?? "No encontramos transportadoras que cubran esa ciudad."
                  }
                />
              </section>
            </div>
            <div className="lg:col-span-1">
              <OrderSummary
                cart={ctx.cart}
                shippingCost={ctx.state.shippingSelection?.fleteCop ?? null}
                shippingLabel={ctx.state.shippingSelection?.carrierName}
              />
            </div>
          </>
        ) : (
          // EnvioStep es client component que comparte state entre QuoteList
          // y OrderSummary (Lucy 2026-05-21 — sidebar reactivo al cambio de transportadora).
          <EnvioStep
            cart={ctx.cart}
            quotes={quotes}
            preselectedQuoteId={ctx.state.shippingSelection?.quoteId}
            destinationCity={ctx.state.address.city}
            destinationDepartment={ctx.state.address.department}
          />
        )}
      </div>
    </div>
  );
}

function QuoteError({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-700" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-amber-900">No pudimos cotizar el envío</h3>
          <p className="mt-1 text-xs text-amber-800">{message}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/checkout/datos"
              className="text-xs font-semibold text-amber-900 underline hover:text-amber-950"
            >
              Revisar dirección
            </Link>
            <span className="text-amber-700">·</span>
            <Link
              href="/contacto"
              className="text-xs font-semibold text-amber-900 underline hover:text-amber-950"
            >
              Contactanos por WhatsApp
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
