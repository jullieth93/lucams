"use client";

import { useState } from "react";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { Truck, Clock, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { carrierLogo, formatCarrierName } from "@/lib/carrier-logos";
import { formatCOP } from "@/lib/format";
import { selectShippingAction } from "./actions";
import type { ShippingSelectionInput } from "@/features/checkout/schemas";
import { resolveLucamsPromise, type CheckoutTexts } from "../checkout-texts";

export function QuoteList({
  quotes,
  offersToken,
  preselectedQuoteId,
  onSelectionChange,
  texts,
  lucamsCutoffHour,
}: {
  quotes: ShippingSelectionInput[];
  /** Set de cotizaciones sellado HMAC por el servidor (anti-manipulación de flete). */
  offersToken: string;
  preselectedQuoteId?: string;
  onSelectionChange?: (quoteId: string) => void;
  /** Textos CMS de la lista de envío (roadmap B8). */
  texts: CheckoutTexts["shipping"];
  /** Hora límite del envío propio (settings LUCAMS_SHIPPING_CUTOFF_HOUR) — la
   *  inyecta la página server; NUNCA se hardcodea en el copy del cliente. */
  lucamsCutoffHour: number;
}) {
  const [selected, setSelected] = useState<string | null>(
    preselectedQuoteId ?? quotes[0]?.quoteId ?? null,
  );
  const handleSelect = (quoteId: string) => {
    setSelected(quoteId);
    onSelectionChange?.(quoteId);
  };

  const chosen = quotes.find((q) => q.quoteId === selected);

  // Promesas "Envío Lucam's" (CMS con tokens): {{cutoff}} = hora límite de
  // settings, {{daysLabel}} = días hábiles con plural (calculados server-side
  // con la regla producción + corte, lib/delivery-estimate.ts — ya vienen
  // sellados en la oferta). La resolución vive en resolveLucamsPromise
  // (checkout-texts) para que el resumen del paso de pago la lea IDÉNTICA.
  const lucamsPromise = (days: number) => resolveLucamsPromise(texts, days, lucamsCutoffHour);

  return (
    <form action={selectShippingAction} className="space-y-4">
      <ul role="radiogroup" aria-label={texts.listTitle} className="space-y-2">
        {quotes.map((q) => {
          const isSelected = selected === q.quoteId;
          const logo = carrierLogo(q.carrier);
          const price =
            // Precio (o "Gratis"): se renderiza DOS veces — una en la fila
            // superior de la tarjeta móvil (<sm) y otra al final de la fila en
            // ≥sm. El `hidden` de cada copia la saca del árbol de accesibilidad,
            // así que el lector de pantalla solo anuncia una.
            q.fleteCop === 0 ? (
              <span className="text-emerald-700">{texts.free}</span>
            ) : (
              formatCOP(q.fleteCop)
            );
          return (
            <li key={q.quoteId}>
              <label
                className={
                  // has-[:focus-visible]: el radio real es sr-only, así que el anillo de foco
                  // se pinta sobre el label (WCAG 2.4.7 — indicador de foco visible).
                  // <sm: tarjeta apilada (fila superior logo+nombre+precio, fila
                  // inferior estimado/badges) — en una sola fila sin wrap los
                  // textos largos se comprimían/solapaban en pantallas angostas.
                  "has-[:focus-visible]:ring-brand-purple flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-all has-[:focus-visible]:ring-2 sm:items-center " +
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
                {logo ? (
                  // Logo oficial de la transportadora (o marca Lucam's). Caja
                  // blanca redondeada: unifica el área visual y da contraste a
                  // los assets transparentes/oscuros. max-w + object-contain:
                  // los logos muy anchos (Servientrega 5.9:1) se letterboxean
                  // sin distorsionar ni romper la fila.
                  <span className="border-brand-purple/10 flex h-10 flex-shrink-0 items-center justify-center rounded-lg border bg-white px-2">
                    <Image
                      src={logo.src}
                      alt={logo.alt}
                      width={logo.width}
                      height={logo.height}
                      unoptimized={logo.src.endsWith(".svg")}
                      className="h-7 w-auto max-w-24 object-contain"
                    />
                  </span>
                ) : (
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
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-brand-purple-dark min-w-0 text-sm font-semibold">
                      {/* Sin logo en el mapa el crudo de Aveonline llega en
                          MAYÚSCULAS → se muestra formateado (title case). */}
                      {logo ? q.carrierName : formatCarrierName(q.carrierName)}
                    </div>
                    <div className="text-brand-purple-dark flex-shrink-0 text-right text-base font-bold tabular-nums sm:hidden">
                      {price}
                    </div>
                  </div>
                  <div className="text-brand-muted mt-0.5 flex flex-wrap items-center gap-2 text-xs">
                    <Clock className="h-3 w-3" />
                    {q.carrier === "lucams" ? (
                      <>
                        {/* Envío propio Lucam's: deliveryDays YA incluye la
                            fabricación a mano + la hora de corte (lo calculó el
                            servidor con lib/delivery-estimate.ts). 0 = entrega
                            hoy (solo posible sin fabricación pendiente y antes
                            del cutoff); >0 = días hábiles hasta la entrega. */}
                        {lucamsPromise(q.deliveryDays)}
                        <span className="bg-brand-turquoise/40 rounded px-1.5 py-0.5 text-[10px] font-semibold text-teal-900">
                          {q.deliveryDays === 0 ? "Envío Lucam's · mismo día" : "Envío Lucam's"}
                        </span>
                      </>
                    ) : (
                      <>
                        {/* #25 — es tiempo de TRÁNSITO, no de entrega total; nunca "Entrega hoy" a secas
                          (falta la fabricación). Ver la nota bajo la lista. */}
                        {q.deliveryDays === 0
                          ? "Estimado de la transportadora: el mismo día del despacho"
                          : q.deliveryDays === 1
                            ? "Estimado de la transportadora: 1 día hábil tras el despacho"
                            : `Estimado de la transportadora: ${q.deliveryDays} días hábiles tras el despacho`}
                      </>
                    )}
                    {q.contraentrega && (
                      <span className="bg-brand-yellow/30 ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                        Contraentrega
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-brand-purple-dark hidden flex-shrink-0 text-right text-base font-bold tabular-nums sm:block">
                  {price}
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
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
            {texts.note}
          </ReactMarkdown>
        </span>
      </p>

      {/* Hidden fields del seleccionado + sello HMAC del set de cotizaciones
          (el server action valida la selección contra ESTE set firmado — los
          campos sueltos son solo eco visual, no se confía en ellos). */}
      <input type="hidden" name="offersToken" value={offersToken} />
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
          {texts.back}
        </a>
        <Button
          type="submit"
          disabled={!chosen}
          size="lg"
          className="bg-gradient-brand w-full text-white hover:brightness-110 sm:w-auto"
        >
          {texts.next}
        </Button>
      </div>
    </form>
  );
}
