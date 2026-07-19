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
import { formatCityDept } from "@/lib/format";
import type { ShippingSelectionInput } from "@/features/checkout/schemas";
import type { CartDetail } from "@/features/cart/service";

export function EnvioStep({
  cart,
  quotes,
  preselectedQuoteId,
  destinationCity,
  destinationDepartment,
}: {
  cart: CartDetail;
  quotes: ShippingSelectionInput[];
  preselectedQuoteId?: string;
  destinationCity: string;
  destinationDepartment: string;
}) {
  // State compartido — Lucy 2026-05-21: sidebar reactivo al cambio de radio.
  const initial = preselectedQuoteId ?? quotes[0]?.quoteId ?? null;
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(initial);

  const selected = quotes.find((q) => q.quoteId === selectedQuoteId) ?? null;

  return (
    <>
      <div className="lg:col-span-2">
        <section className="border-brand-purple/10 rounded-2xl border bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-brand-purple-dark font-display mb-1 flex items-center gap-2 text-lg font-bold">
            <Truck className="h-5 w-5" />
            Elige cómo te lo enviamos
          </h2>
          <p className="text-brand-muted mb-5 text-sm">
            {/* #30 — sin duplicar "Bogotá D.C., Bogotá D.C." (ciudad=departamento). */}
            Cotizamos con Aveonline para{" "}
            <strong>{formatCityDept(destinationCity, destinationDepartment)}</strong>.
          </p>
          <QuoteList
            quotes={quotes}
            preselectedQuoteId={selectedQuoteId ?? undefined}
            onSelectionChange={setSelectedQuoteId}
          />
        </section>
      </div>
      <div className="lg:col-span-1">
        <OrderSummary
          cart={cart}
          shippingCost={selected?.fleteCop ?? null}
          shippingLabel={selected?.carrierName}
        />
      </div>
    </>
  );
}
