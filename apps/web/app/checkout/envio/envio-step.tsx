"use client";

/*
 * Wrapper client del step 2 (Envío) — comparte el state de la selección
 * de transportadora entre <QuoteList> y <OrderSummary>. Sin esto, al
 * cambiar la radio button el costo de envío en el sidebar no se refresca
 * hasta el siguiente request (porque OrderSummary leía del cookie state
 * server-side).
 *
 * Renderiza los 2 col-span del grid (col-span-2 lista + col-span-1 sidebar)
 * — el padre se encarga del wrapper grid.
 */

import { useState } from "react";
import { Truck } from "lucide-react";
import { QuoteList } from "./quote-list";
import { OrderSummary } from "../_components/order-summary";
import { formatCityDept, splitCityTemplate } from "@/lib/format";
import type { ShippingSelectionInput } from "@/features/checkout/schemas";
import type { CartDetail } from "@/features/cart/service";
import type { CheckoutTexts } from "../checkout-texts";

export function EnvioStep({
  cart,
  quotes,
  offersToken,
  quotesEstimated,
  preselectedQuoteId,
  destinationCity,
  destinationDepartment,
  headingText,
  subtextTemplate,
  summaryTexts,
  shippingTexts,
}: {
  cart: CartDetail;
  quotes: ShippingSelectionInput[];
  /** Set de cotizaciones sellado HMAC por el servidor (anti-manipulación de flete). */
  offersToken: string;
  /** true = las cotizaciones vienen de la caché de fallback (la viva falló) —
   *  se muestra la nota "tarifa estimada" junto a la lista. */
  quotesEstimated: boolean;
  preselectedQuoteId?: string;
  destinationCity: string;
  destinationDepartment: string;
  /** Microcopy editable CMS (Ruta A) — lo resuelve el server page con fallback. */
  headingText: string;
  subtextTemplate: string;
  /** Textos CMS del resumen y de la lista de envío (roadmap B8). */
  summaryTexts: CheckoutTexts["summary"];
  shippingTexts: CheckoutTexts["shipping"];
}) {
  // State compartido — Lucy 2026-05-21: sidebar reactivo al cambio de radio.
  const initial = preselectedQuoteId ?? quotes[0]?.quoteId ?? null;
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(initial);

  const selected = quotes.find((q) => q.quoteId === selectedQuoteId) ?? null;
  const sub = splitCityTemplate(subtextTemplate);

  return (
    <>
      <div className="lg:col-span-2">
        <section className="border-brand-purple/10 rounded-2xl border bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-brand-purple-dark font-display mb-1 flex items-center gap-2 text-lg font-bold">
            <Truck className="h-5 w-5" />
            {headingText}
          </h2>
          <p className="text-brand-muted mb-5 text-sm">
            {sub.pre}
            <strong>{formatCityDept(destinationCity, destinationDepartment)}</strong>
            {sub.post}
          </p>
          <QuoteList
            quotes={quotes}
            offersToken={offersToken}
            preselectedQuoteId={selectedQuoteId ?? undefined}
            onSelectionChange={setSelectedQuoteId}
            texts={shippingTexts}
          />
          {quotesEstimated && (
            <p
              role="note"
              className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
            >
              {shippingTexts.estimatedNote}
            </p>
          )}
        </section>
      </div>
      <div className="lg:col-span-1">
        <OrderSummary
          cart={cart}
          shippingCost={selected?.fleteCop ?? null}
          shippingLabel={selected?.carrierName}
          texts={summaryTexts}
        />
      </div>
    </>
  );
}
