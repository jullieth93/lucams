"use client";

import { useState } from "react";
import { Truck, Clock, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCOP } from "@/lib/format";
import { selectShippingAction } from "./actions";
import type { ShippingSelectionInput } from "@/features/checkout/schemas";

export function QuoteList({
  quotes,
  preselectedQuoteId,
  onSelectionChange,
}: {
  quotes: ShippingSelectionInput[];
  preselectedQuoteId?: string;
  onSelectionChange?: (quoteId: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(
    preselectedQuoteId ?? quotes[0]?.quoteId ?? null,
  );
  const handleSelect = (quoteId: string) => {
    setSelected(quoteId);
    onSelectionChange?.(quoteId);
  };

  const chosen = quotes.find((q) => q.quoteId === selected);

  return (
    <form action={selectShippingAction} className="space-y-4">
      <ul role="radiogroup" aria-label="Opciones de envío" className="space-y-2">
        {quotes.map((q) => {
          const isSelected = selected === q.quoteId;
          return (
            <li key={q.quoteId}>
              <label
                className={
                  "flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition-all " +
                  (isSelected
                    ? "border-brand-purple bg-brand-purple/5 ring-brand-purple/30 ring-2"
                    : "border-brand-purple/15 hover:border-brand-purple/30 hover:bg-brand-purple/[0.02]")
                }
              >
                <input
                  type="radio"
                  name="quoteId-radio"
                  value={q.quoteId}
                  checked={isSelected}
                  onChange={() => handleSelect(q.quoteId)}
                  className="sr-only"
                  aria-checked={isSelected}
                />
                <span
                  className={
                    "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition-colors " +
                    (isSelected
                      ? "bg-brand-purple text-white"
                      : "bg-brand-purple/10 text-brand-muted")
                  }
                >
                  {isSelected ? <Check className="h-5 w-5" /> : <Truck className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-brand-purple-dark text-sm font-semibold">
                    {q.carrierName}
                  </div>
                  <div className="text-brand-muted mt-0.5 flex items-center gap-2 text-xs">
                    <Clock className="h-3 w-3" />
                    {/* #25 — es tiempo de TRÁNSITO, no de entrega total; nunca "Entrega hoy" a secas
                      (falta la fabricación). Ver la nota bajo la lista. */}
                    {q.deliveryDays === 0
                      ? "Envío el mismo día tras el despacho"
                      : q.deliveryDays === 1
                        ? "1 día hábil tras el despacho"
                        : `${q.deliveryDays} días hábiles tras el despacho`}
                    {q.contraentrega && (
                      <span className="bg-brand-yellow/30 ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                        Contraentrega
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-brand-purple-dark flex-shrink-0 text-right text-base font-bold tabular-nums">
                  {q.fleteCop === 0 ? (
                    <span className="text-emerald-700">Gratis</span>
                  ) : (
                    formatCOP(q.fleteCop)
                  )}
                </div>
              </label>
            </li>
          );
        })}
      </ul>

      {/* #25 — aclara que los tiempos de arriba son solo transporte; antes fabricamos a mano. */}
      <p className="text-brand-muted mt-3 flex items-start gap-1.5 text-xs">
        <Clock className="mt-0.5 h-3 w-3 flex-shrink-0" aria-hidden />
        <span>
          Son tiempos de transporte. Antes fabricamos tu pedido a mano: suma{" "}
          <strong>2 días hábiles de fabricación</strong> antes del despacho.
        </span>
      </p>

      {/* Hidden fields del seleccionado */}
      {chosen && (
        <>
          <input type="hidden" name="carrier" value={chosen.carrier} />
          <input type="hidden" name="carrierName" value={chosen.carrierName} />
          <input type="hidden" name="fleteCop" value={chosen.fleteCop} />
          <input type="hidden" name="deliveryDays" value={chosen.deliveryDays} />
          <input type="hidden" name="contraentrega" value={String(chosen.contraentrega)} />
          <input type="hidden" name="quoteId" value={chosen.quoteId} />
        </>
      )}

      <div className="flex flex-col items-end gap-2 sm:flex-row sm:justify-between">
        <a
          href="/checkout/datos"
          className="text-brand-purple-dark/70 hover:text-brand-purple-dark text-sm font-medium"
        >
          ← Cambiar dirección
        </a>
        <Button
          type="submit"
          disabled={!chosen}
          size="lg"
          className="bg-gradient-brand w-full text-white hover:brightness-110 sm:w-auto"
        >
          Continuar al pago →
        </Button>
      </div>
    </form>
  );
}
