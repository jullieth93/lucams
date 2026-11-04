"use client";

/*
 * Formulario consultivo B2B / Eventos en `/empresas-y-eventos` (`Fase 12 · S24`).
 */

import { useActionState, useState } from "react";
import Link from "next/link";
import { Building2, CheckCircle2, Loader2, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TurnstileWidget } from "@/components/turnstile-widget";
import { WhatsAppIcon } from "@/components/icons/brand";
import {
  OPPORTUNITY_EVENT_LABELS,
  OPPORTUNITY_EVENT_TYPES,
  type OpportunityEventType,
} from "@/features/opportunities/schemas";
import {
  submitB2bInquiryAction,
  type B2bPublicActionState,
} from "@/features/opportunities/actions";

type Props = {
  waSupportUrl: string;
  initialUtmSource?: string;
  initialUtmMedium?: string;
  initialUtmCampaign?: string;
};

const QUICK_UNIT_TIERS = [25, 50, 100, 250, 500] as const;

export function B2bInquiryForm({
  waSupportUrl,
  initialUtmSource = "",
  initialUtmMedium = "",
  initialUtmCampaign = "",
}: Props) {
  const [state, formAction, pending] = useActionState<B2bPublicActionState, FormData>(
    submitB2bInquiryAction,
    null,
  );
  const [eventType, setEventType] = useState<OpportunityEventType>("CORPORATE_GIFT");
  const [units, setUnits] = useState<string>("50");

  if (state?.ok) {
    return (
      <div className="border-brand-purple/20 rounded-3xl border bg-gradient-to-br from-[#FFF8F0] via-white to-[#5DD9D1]/10 p-6 text-center shadow-sm sm:p-8">
        <div className="bg-brand-purple/15 text-brand-purple mx-auto flex h-14 w-14 items-center justify-center rounded-2xl">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <h3 className="font-display text-brand-purple-dark mt-4 text-2xl font-bold">
          ¡Recibimos tu solicitud de proyecto!
        </h3>
        <p className="text-brand-purple-dark/80 mx-auto mt-2 max-w-md text-sm">
          Nuestro equipo de proyectos especiales te contactará en menos de 24 horas hábiles con una
          propuesta a tu medida. Tu código de referencia es{" "}
          <span className="border-brand-purple/25 text-brand-purple-dark inline-block rounded-lg border bg-white px-2.5 py-0.5 font-mono text-xs font-bold">
            {state.opportunityNumber}
          </span>
          .
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <a
            href={waSupportUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-emerald-700"
          >
            <WhatsAppIcon className="h-4 w-4" />
            Adelantar detalles por WhatsApp
          </a>
          <Link
            href="/productos"
            className="border-brand-purple/25 text-brand-purple-dark hover:bg-brand-purple/10 inline-flex min-h-11 items-center rounded-full border bg-white px-5 py-2.5 text-sm font-semibold transition-colors"
          >
            Explorar el catálogo
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="eventType" value={eventType} />
      <input type="hidden" name="utmSource" value={initialUtmSource} />
      <input type="hidden" name="utmMedium" value={initialUtmMedium} />
      <input type="hidden" name="utmCampaign" value={initialUtmCampaign} />
      <input type="hidden" name="landingPath" value="/empresas-y-eventos" />

      {state && !state.ok && state.error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800"
        >
          {state.error}
        </div>
      )}

      {/* Selector visual interactivo de tipo de proyecto */}
      <div className="space-y-2">
        <Label className="text-brand-purple-dark text-sm font-semibold">
          1. ¿Qué tipo de celebración o proyecto tienes en mente?
        </Label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {OPPORTUNITY_EVENT_TYPES.map((type) => {
            const active = eventType === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => setEventType(type)}
                className={`flex min-h-11 items-center gap-2 rounded-xl border px-3.5 py-2.5 text-left text-xs font-semibold transition-all ${
                  active
                    ? "border-brand-purple bg-brand-purple text-white shadow-xs"
                    : "border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/5 bg-[#FFF8F0]/50"
                }`}
              >
                <Sparkles className="h-3.5 w-3.5 shrink-0" />
                <span>{OPPORTUNITY_EVENT_LABELS[type]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Estimador rápido de unidades */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="b2b-units" className="text-brand-purple-dark text-sm font-semibold">
            2. Cantidad aproximada de unidades
          </Label>
          <Input
            id="b2b-units"
            name="expectedUnits"
            type="number"
            min={10}
            max={100000}
            required
            value={units}
            onChange={(e) => setUnits(e.target.value)}
            className="border-brand-purple/20 focus-visible:ring-brand-purple/30 min-h-11 bg-white"
          />
          <div className="flex flex-wrap gap-1.5 pt-1">
            {QUICK_UNIT_TIERS.map((tier) => (
              <button
                key={tier}
                type="button"
                onClick={() => setUnits(String(tier))}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  units === String(tier)
                    ? "border-brand-purple bg-brand-purple/15 text-brand-purple-dark"
                    : "border-brand-purple/15 text-brand-muted hover:text-brand-purple-dark bg-white"
                }`}
              >
                {tier} uds.
              </button>
            ))}
          </div>
          {state && !state.ok && state.fieldErrors?.expectedUnits && (
            <p className="text-xs text-rose-700">{state.fieldErrors.expectedUnits[0]}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="b2b-date" className="text-brand-purple-dark text-sm font-semibold">
            Fecha ideal de entrega (opcional)
          </Label>
          <Input
            id="b2b-date"
            name="eventDate"
            type="date"
            className="border-brand-purple/20 focus-visible:ring-brand-purple/30 min-h-11 bg-white"
          />
          <p className="text-brand-muted text-[11px]">
            Así reservamos cupo prioritario en nuestro taller artesanal.
          </p>
        </div>
      </div>

      {/* Datos de contacto y empresa */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="b2b-name" className="text-brand-purple-dark text-sm font-semibold">
            Tu nombre completo *
          </Label>
          <Input
            id="b2b-name"
            name="contactName"
            required
            minLength={2}
            maxLength={120}
            autoComplete="name"
            placeholder="Valentina Gómez"
            className="border-brand-purple/20 focus-visible:ring-brand-purple/30 min-h-11 bg-white"
          />
          {state && !state.ok && state.fieldErrors?.contactName && (
            <p className="text-xs text-rose-700">{state.fieldErrors.contactName[0]}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="b2b-org" className="text-brand-purple-dark text-sm font-semibold">
            Empresa, colegio o evento (opcional)
          </Label>
          <div className="relative">
            <Building2 className="text-brand-muted pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <Input
              id="b2b-org"
              name="organizationName"
              maxLength={140}
              autoComplete="organization"
              placeholder="Ej. Estudio Creativo SAS / Boda Ana & Juan"
              className="border-brand-purple/20 focus-visible:ring-brand-purple/30 min-h-11 bg-white pl-9"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="b2b-email" className="text-brand-purple-dark text-sm font-semibold">
            Correo electrónico *
          </Label>
          <Input
            id="b2b-email"
            name="email"
            type="email"
            required
            maxLength={180}
            autoComplete="email"
            placeholder="valentina@empresa.co"
            className="border-brand-purple/20 focus-visible:ring-brand-purple/30 min-h-11 bg-white"
          />
          {state && !state.ok && state.fieldErrors?.email && (
            <p className="text-xs text-rose-700">{state.fieldErrors.email[0]}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="b2b-whatsapp" className="text-brand-purple-dark text-sm font-semibold">
            WhatsApp / Celular *
          </Label>
          <Input
            id="b2b-whatsapp"
            name="whatsapp"
            type="tel"
            required
            autoComplete="tel"
            placeholder="300 123 4567"
            className="border-brand-purple/20 focus-visible:ring-brand-purple/30 min-h-11 bg-white"
          />
          {state && !state.ok && state.fieldErrors?.whatsapp && (
            <p className="text-xs text-rose-700">{state.fieldErrors.whatsapp[0]}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="b2b-nit" className="text-brand-purple-dark text-sm font-semibold">
            NIT para facturación (opcional)
          </Label>
          <Input
            id="b2b-nit"
            name="nit"
            maxLength={30}
            placeholder="901234567-8"
            className="border-brand-purple/20 focus-visible:ring-brand-purple/30 min-h-11 bg-white"
          />
          {state && !state.ok && state.fieldErrors?.nit && (
            <p className="text-xs text-rose-700">{state.fieldErrors.nit[0]}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="b2b-city" className="text-brand-purple-dark text-sm font-semibold">
            Ciudad de entrega *
          </Label>
          <Input
            id="b2b-city"
            name="city"
            required
            minLength={2}
            maxLength={80}
            placeholder="Bogotá, Medellín, Cali..."
            className="border-brand-purple/20 focus-visible:ring-brand-purple/30 min-h-11 bg-white"
          />
          {state && !state.ok && state.fieldErrors?.city && (
            <p className="text-xs text-rose-700">{state.fieldErrors.city[0]}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="b2b-dept" className="text-brand-purple-dark text-sm font-semibold">
            Departamento (opcional)
          </Label>
          <Input
            id="b2b-dept"
            name="department"
            maxLength={80}
            placeholder="Cundinamarca, Antioquia..."
            className="border-brand-purple/20 focus-visible:ring-brand-purple/30 min-h-11 bg-white"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="b2b-notes" className="text-brand-purple-dark text-sm font-semibold">
          Cuéntanos sobre tu idea *
        </Label>
        <Textarea
          id="b2b-notes"
          name="notes"
          required
          minLength={10}
          maxLength={2500}
          rows={4}
          placeholder="¿Qué productos te interesan (fotoimanes con logo, calendarios corporativos, recordatorios magnéticos, empaque de regalo)? ¿Todos llevan el mismo diseño o personalización individual?"
          className="border-brand-purple/20 focus-visible:ring-brand-purple/30 bg-white"
        />
        {state && !state.ok && state.fieldErrors?.notes && (
          <p className="text-xs text-rose-700">{state.fieldErrors.notes[0]}</p>
        )}
      </div>

      {/* Consentimientos Ley 1581 de 2012 */}
      <div className="border-brand-purple/15 space-y-2.5 rounded-2xl border bg-[#FFF8F0]/70 p-4">
        <label className="flex cursor-pointer items-start gap-2.5 text-xs">
          <input
            type="checkbox"
            name="acceptHabeasData"
            required
            className="accent-brand-purple mt-0.5 h-4 w-4 shrink-0 rounded"
          />
          <span className="text-brand-purple-dark/90">
            Autorizo el tratamiento de mis datos personales para gestionar esta cotización conforme
            a la{" "}
            <Link
              href="/privacidad"
              target="_blank"
              className="text-brand-purple font-semibold underline underline-offset-2"
            >
              Política de Privacidad
            </Link>{" "}
            (Ley 1581 de 2012). *
          </span>
        </label>
        {state && !state.ok && state.fieldErrors?.acceptHabeasData && (
          <p className="text-xs text-rose-700">{state.fieldErrors.acceptHabeasData[0]}</p>
        )}

        <label className="flex cursor-pointer items-start gap-2.5 text-xs">
          <input
            type="checkbox"
            name="acceptNewsletter"
            className="accent-brand-purple mt-0.5 h-4 w-4 shrink-0 rounded"
          />
          <span className="text-brand-purple-dark/80">
            Quiero recibir ideas de regalos corporativos, temporadas especiales y descuentos por
            volumen (opcional, puedes darte de baja cuando quieras).
          </span>
        </label>
      </div>

      <TurnstileWidget />

      <Button
        type="submit"
        disabled={pending}
        className="bg-brand-purple hover:bg-brand-purple-dark min-h-12 w-full rounded-full text-sm font-semibold text-white shadow-sm"
      >
        {pending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Enviando solicitud...
          </>
        ) : (
          <>
            <Send className="mr-2 h-4 w-4" />
            Solicitar propuesta personalizada
          </>
        )}
      </Button>
    </form>
  );
}
