"use client";

/*
 * <QuoteForm> — formulario de cotización de 1 paso (Etapa 1, modo catálogo).
 *
 * Reemplaza al checkout completo cuando NEXT_PUBLIC_STORE_MODE=catalog: el
 * cliente ya armó su carrito, deja sus datos acá y cierra por WhatsApp. NO
 * pide dirección ni facturación — el envío se coordina en la conversación.
 *
 * Flujo: useActionState → createQuoteAction (Zod + Turnstile + rate limit en
 * features/quotes) → en éxito router.push(/cotizacion/<token>) (página de
 * confirmación con el botón grande de WhatsApp).
 *
 * Departamento/Ciudad reusan el catálogo DANE divipola (mismo patrón que
 * datos-form: el <select> guarda el CÓDIGO y un input hidden manda el NOMBRE
 * humano, que es lo que persiste Quote.city/Quote.department).
 */

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Loader2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TurnstileWidget } from "@/components/turnstile-widget";
import { createQuoteAction, type QuoteActionState } from "@/features/quotes/actions";
import type { QuoteFormInput } from "@/features/quotes/schemas";
import type { CartLineItem } from "@/features/cart/service";
import { formatCOP } from "@/lib/format";
import {
  DEPARTMENTS,
  getCitiesByDeptCode,
  getCityByCode,
  type DaneCity,
} from "@/lib/dane-divipola";
import { formatPhone, stripPhone, validatePhone } from "@/lib/colombia-validators";

export function QuoteForm({ items = [] }: { items?: CartLineItem[] }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<QuoteActionState, FormData>(
    createQuoteAction,
    null,
  );

  // Éxito → página de confirmación de la cotización (vista pública por token).
  useEffect(() => {
    if (state?.ok) router.push(`/cotizacion/${state.token}`);
  }, [state, router]);

  // WhatsApp con auto-formato "300 887 3826" (display) + hidden sin formato
  // (lo que valida Zod y persiste la cotización) — mismo patrón que datos-form.
  const [phoneDisplay, setPhoneDisplay] = useState("");
  const [phoneTouched, setPhoneTouched] = useState(false);

  // Dirección DANE: código en el select, nombre en hidden (ver header).
  const [deptCode, setDeptCode] = useState("");
  const [cityCode, setCityCode] = useState("");
  const cities = useMemo<DaneCity[]>(
    () => (deptCode ? getCitiesByDeptCode(deptCode) : []),
    [deptCode],
  );
  const selectedDept = useMemo(() => DEPARTMENTS.find((d) => d.code === deptCode), [deptCode]);
  const selectedCity = useMemo(() => getCityByCode(cityCode), [cityCode]);

  function err(field: keyof QuoteFormInput | "dataConsent"): string | null {
    if (state && !state.ok) return state.fieldErrors?.[field]?.[0] ?? null;
    return null;
  }

  // Autorización de tratamiento (Ley 1581) — obligatoria antes de enviar la PII de la cotización.
  const [dataConsent, setDataConsent] = useState(false);

  const phoneClientError =
    phoneDisplay.length > 0 && !validatePhone(phoneDisplay) && phoneTouched
      ? "Móvil colombiano: 10 dígitos empezando con 3"
      : null;

  return (
    <form action={formAction} className="space-y-6">
      {/* Ola 2A — resumen de lo que estás cotizando, con el PREVIEW del diseño personalizado
          por ítem cuando existe (compositado del Estudio en Supabase Storage); si no hay
          diseño, la imagen normal del producto. En móvil queda arriba del form (el resumen
          lateral del checkout baja hasta el fondo). */}
      {items.length > 0 && (
        <section
          aria-label="Productos de tu cotización"
          className="border-brand-purple/10 rounded-2xl border bg-white p-5 shadow-sm sm:p-6"
        >
          <h2 className="text-brand-purple-dark font-display text-lg font-bold">
            Lo que estás cotizando
          </h2>
          <p className="text-brand-muted mt-1 text-sm">
            Esto es exactamente lo que vas a recibir. Revísalo con calma antes de enviarnos tu
            cotización.
          </p>
          <ul className="divide-brand-purple/10 mt-3 divide-y">
            {items.map((item) => {
              const imgUrl = item.designPreviewUrl ?? item.imageUrl ?? null;
              return (
                <li key={item.itemId} className="flex items-start gap-4 py-4">
                  {/* `object-contain` sobre fondo crema, no `object-cover`: el preview del Estudio es
                      el MOSAICO de todas las piezas, así que recortarlo cuadrado se come justo lo
                      que el cliente quiere revisar (Lucy 2026-07-25). */}
                  <div className="from-brand-cream/60 border-brand-purple/10 relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-xl border bg-gradient-to-b to-white sm:h-28 sm:w-28">
                    {imgUrl ? (
                      <Image
                        src={imgUrl}
                        alt={
                          item.designPreviewUrl
                            ? `Vista previa de tu diseño de ${item.productName}`
                            : item.productName
                        }
                        fill
                        sizes="112px"
                        className="object-contain p-1.5 drop-shadow-sm"
                        unoptimized
                      />
                    ) : (
                      <span className="text-brand-purple/40 flex h-full items-center justify-center text-2xl">
                        ✨
                      </span>
                    )}
                    {item.qty > 1 && (
                      <span className="bg-brand-purple-dark/85 absolute top-0 right-0 inline-flex h-6 min-w-6 items-center justify-center rounded-bl-lg px-1.5 text-xs font-bold text-white">
                        ×{item.qty}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-brand-purple-dark text-sm leading-snug font-semibold">
                      {item.productName}
                    </p>
                    <p className="text-brand-muted mt-0.5 text-xs">{item.variantName}</p>
                    {item.pieceSummary && (
                      <p className="text-brand-purple-dark/80 mt-1 text-xs">
                        📐 {item.pieceSummary}
                      </p>
                    )}
                    {item.designPreviewUrl && (
                      <p className="text-brand-purple mt-1 text-xs font-medium">
                        ✨ Con tu diseño personalizado
                      </p>
                    )}
                    {/* Con cantidad > 1 el precio unitario evita que el total de línea se lea como
                        el precio del producto. */}
                    {item.qty > 1 && (
                      <p className="text-brand-muted mt-1 text-xs tabular-nums">
                        {item.qty} × {formatCOP(item.unitPrice)}
                      </p>
                    )}
                  </div>
                  <div className="text-brand-purple-dark flex-shrink-0 text-sm font-semibold tabular-nums">
                    {formatCOP(item.lineTotal)}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="border-brand-purple/10 mt-1 flex items-center justify-between border-t pt-3">
            <span className="text-brand-purple-dark text-sm font-semibold">Total</span>
            <span className="text-brand-purple-dark font-display text-lg font-bold tabular-nums">
              {formatCOP(items.reduce((sum, i) => sum + i.lineTotal, 0))}
            </span>
          </div>
        </section>
      )}

      <section className="border-brand-purple/10 rounded-2xl border bg-white p-5 shadow-sm sm:p-6">
        <h1 className="text-brand-purple-dark font-display text-xl font-bold sm:text-2xl">
          Pide tu cotización ✨
        </h1>
        <p className="text-brand-purple-dark/75 mt-2 text-sm">
          Déjanos tus datos y te contactamos por WhatsApp para confirmar precio, pago y entrega.{" "}
          <strong className="text-brand-purple-dark">
            El envío se coordina por WhatsApp al confirmar tu cotización.
          </strong>
        </p>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Nombre */}
          <div>
            <Label
              htmlFor="customerName"
              className="text-brand-purple-dark mb-1 block text-xs font-semibold"
            >
              Nombre completo <span className="text-rose-600">*</span>
            </Label>
            <Input
              id="customerName"
              name="customerName"
              required
              minLength={2}
              maxLength={80}
              placeholder="Ej. Valentina Rojas"
              autoComplete="name"
              className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
            />
            <FieldError message={err("customerName")} />
          </div>

          {/* WhatsApp */}
          <div>
            <Label
              htmlFor="whatsapp-display"
              className="text-brand-purple-dark mb-1 block text-xs font-semibold"
            >
              Tu WhatsApp <span className="text-rose-600">*</span>
            </Label>
            <Input
              id="whatsapp-display"
              type="tel"
              required
              placeholder="300 887 3826"
              value={phoneDisplay}
              onChange={(e) => {
                setPhoneDisplay(formatPhone(e.target.value));
                setPhoneTouched(false);
              }}
              onBlur={() => setPhoneTouched(true)}
              maxLength={12} // 10 dígitos + 2 espacios
              autoComplete="tel-national"
              inputMode="numeric"
              className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
            />
            <input type="hidden" name="customerWhatsapp" value={stripPhone(phoneDisplay)} />
            <FieldError
              message={phoneClientError ?? err("customerWhatsapp")}
              hint="Acá te escribimos para concretar"
            />
          </div>

          {/* Email — obligatorio: la cotización también se envía por correo. */}
          <div>
            <Label
              htmlFor="customerEmail"
              className="text-brand-purple-dark mb-1 block text-xs font-semibold"
            >
              Email
            </Label>
            <Input
              id="customerEmail"
              name="customerEmail"
              type="email"
              required
              maxLength={254}
              placeholder="tu@correo.com"
              autoComplete="email"
              className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
            />
            <FieldError
              message={err("customerEmail")}
              hint="Te enviamos la cotización por WhatsApp y también por correo"
            />
          </div>

          {/* Departamento */}
          <div>
            <Label
              htmlFor="deptCode"
              className="text-brand-purple-dark mb-1 block text-xs font-semibold"
            >
              Departamento <span className="text-rose-600">*</span>
            </Label>
            <select
              id="deptCode"
              required
              value={deptCode}
              onChange={(e) => {
                setDeptCode(e.target.value);
                setCityCode("");
              }}
              className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 h-9 w-full rounded-md border bg-white px-2 text-sm focus:ring-2 focus:outline-none"
            >
              <option value="">Elige departamento...</option>
              {DEPARTMENTS.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.name}
                </option>
              ))}
            </select>
            <input type="hidden" name="department" value={selectedDept?.name ?? ""} />
            <FieldError message={err("department")} />
          </div>

          {/* Ciudad */}
          <div>
            <Label
              htmlFor="cityCode"
              className="text-brand-purple-dark mb-1 block text-xs font-semibold"
            >
              Ciudad <span className="text-rose-600">*</span>
            </Label>
            <select
              id="cityCode"
              required
              value={cityCode}
              onChange={(e) => setCityCode(e.target.value)}
              disabled={!deptCode}
              className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 h-9 w-full rounded-md border bg-white px-2 text-sm focus:ring-2 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
            >
              <option value="">
                {deptCode ? "Elige ciudad..." : "Elige departamento primero"}
              </option>
              {cities.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
            <input type="hidden" name="city" value={selectedCity?.name ?? ""} />
            <FieldError message={err("city")} />
          </div>

          {/* Notas */}
          <div className="sm:col-span-2">
            <Label
              htmlFor="notes"
              className="text-brand-purple-dark mb-1 block text-xs font-semibold"
            >
              Notas (opcional)
            </Label>
            <Textarea
              id="notes"
              name="notes"
              rows={3}
              maxLength={500}
              placeholder="Ej. es para un regalo, lo necesito antes del viernes..."
              className="border-brand-purple/20 focus-visible:ring-brand-purple/30 resize-y"
            />
            <FieldError message={err("notes")} />
          </div>
        </div>

        <div className="pt-4">
          <TurnstileWidget size="flexible" />
        </div>
      </section>

      {state && !state.ok && state.error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          ⚠️ {state.error}
        </div>
      )}

      <div className="flex flex-col items-end gap-2 sm:flex-row sm:justify-end">
        <Button
          type="submit"
          disabled={pending}
          size="lg"
          className="w-full bg-emerald-600 text-white hover:bg-emerald-700 sm:w-auto"
        >
          {pending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creando tu cotización…
            </>
          ) : (
            <>
              <MessageCircle className="mr-2 h-4 w-4" /> Pedir cotización por WhatsApp
            </>
          )}
        </Button>
      </div>

      <div className="border-brand-purple/15 bg-brand-cream/40 rounded-2xl border p-4">
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="dataConsent"
            required
            checked={dataConsent}
            onChange={(e) => setDataConsent(e.target.checked)}
            aria-invalid={err("dataConsent") ? true : undefined}
            className="accent-brand-purple mt-0.5 h-4 w-4 flex-shrink-0"
          />
          <span className="text-brand-purple-dark/90 leading-relaxed">
            Autorizo el <strong>tratamiento de mis datos personales</strong> para responder esta
            cotización por WhatsApp, conforme a la{" "}
            <a
              href="/legal/privacidad"
              target="_blank"
              rel="noreferrer"
              className="text-brand-purple underline underline-offset-2"
            >
              Política de Privacidad
            </a>{" "}
            (Ley 1581 de 2012).
          </span>
        </label>
        <FieldError message={err("dataConsent")} />
        <p className="text-brand-muted mt-2 text-xs">
          Sin spam: solo te escribimos por esta cotización.
        </p>
      </div>
    </form>
  );
}

function FieldError({ message, hint }: { message: string | null; hint?: string }) {
  if (message) return <p className="mt-1 text-xs text-rose-600">{message}</p>;
  if (hint) return <p className="text-brand-muted mt-1 text-xs">{hint}</p>;
  return null;
}
