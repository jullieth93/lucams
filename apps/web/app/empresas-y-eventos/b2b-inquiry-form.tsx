"use client";

/*
 * Formulario consultivo B2B / Eventos en `/empresas-y-eventos` (`Fase 12 · S24`).
 * Validadores estandarizados Colombia (nombre máx 5 palabras + capitalización,
 * EmailInput con dominios y corrección de typos en 1 clic, PhoneInput con indicativo,
 * NIT DIAN módulo 11 y catálogo DANE departamento/ciudad). Estado controlado para
 * nunca perder datos digitados ante un error de servidor o Turnstile.
 */

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { Building2, CheckCircle2, Loader2, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmailInput } from "@/components/email-input";
import { PhoneInput } from "@/components/phone-input";
import { TurnstileWidget } from "@/components/turnstile-widget";
import { WhatsAppIcon } from "@/components/icons/brand";
import {
  DEPARTMENTS,
  getCitiesByDeptCode,
  getCityByCode,
  type DaneCity,
} from "@/lib/dane-divipola";
import {
  capitalizeName,
  normalizeAndValidateNit,
  normalizePhoneWithDial,
  personNameError,
} from "@/lib/colombia-validators";
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
const MAX_FULL_NAME_WORDS = 5;

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
  const [eventDate, setEventDate] = useState<string>("");
  const [contactName, setContactName] = useState<string>("");
  const [organizationName, setOrganizationName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [phone, setPhone] = useState<{ national: string; dial: string }>({
    national: "",
    dial: "57",
  });
  const [nit, setNit] = useState<string>("");
  const [deptCode, setDeptCode] = useState<string>("");
  const [cityCode, setCityCode] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [acceptHabeasData, setAcceptHabeasData] = useState<boolean>(false);
  const [acceptNewsletter, setAcceptNewsletter] = useState<boolean>(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const markTouched = (field: string) => setTouched((prev) => ({ ...prev, [field]: true }));

  const todayIso = useMemo(
    () =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Bogota",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date()),
    [],
  );

  const cities = useMemo<DaneCity[]>(
    () => (deptCode ? getCitiesByDeptCode(deptCode) : []),
    [deptCode],
  );
  const selectedDept = useMemo(() => DEPARTMENTS.find((d) => d.code === deptCode), [deptCode]);
  const selectedCity = useMemo(() => getCityByCode(cityCode), [cityCode]);

  const srvErr = (field: string): string | null => {
    if (!state || state.ok) return null;
    const map = state.fieldErrors as Record<string, string[] | undefined> | undefined;
    return map?.[field]?.[0] ?? null;
  };

  const contactNameLiveErr = touched.contactName
    ? personNameError(contactName, MAX_FULL_NAME_WORDS)
    : null;
  const contactNameErr = contactNameLiveErr ?? srvErr("contactName");

  const phoneLiveErr =
    touched.whatsapp &&
    phone.national.length > 0 &&
    normalizePhoneWithDial(`+${phone.dial} ${phone.national}`) === null
      ? phone.dial === "57"
        ? "Móvil colombiano: 10 dígitos empezando con 3 (ej. 300 123 4567)."
        : "Revisa el número: debe tener entre 6 y 15 dígitos."
      : null;
  const whatsappErr = phoneLiveErr ?? srvErr("whatsapp");

  const nitCheck = useMemo(() => (nit.trim() ? normalizeAndValidateNit(nit) : null), [nit]);
  const nitLiveErr = touched.nit && nitCheck && !nitCheck.valid ? nitCheck.error : null;
  const nitErr = nitLiveErr ?? srvErr("nit");
  const nitAutoDvHint =
    nitCheck && nitCheck.valid && nitCheck.providedDv === null
      ? `Dígito de verificación DIAN: ${nitCheck.expectedDv} (se guardará ${nitCheck.normalized})`
      : null;

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
          Te enviamos copia de tu solicitud por correo electrónico y nuestro equipo te contactará en
          menos de 24 horas hábiles con una propuesta a tu medida. Tu código de referencia es{" "}
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
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-emerald-800"
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

      {/* Estimador rápido de unidades + fecha */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="b2b-units" className="text-brand-purple-dark text-sm font-semibold">
            2. Cantidad aproximada de unidades *
          </Label>
          <Input
            id="b2b-units"
            name="expectedUnits"
            type="number"
            inputMode="numeric"
            min={10}
            max={100000}
            required
            value={units}
            onChange={(e) => setUnits(e.target.value.replace(/\D/g, ""))}
            aria-invalid={Boolean(srvErr("expectedUnits"))}
            className="border-brand-purple/20 focus-visible:ring-brand-purple/30 h-10 bg-white"
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
          {srvErr("expectedUnits") && (
            <p className="text-xs text-rose-700">{srvErr("expectedUnits")}</p>
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
            min={todayIso}
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            aria-invalid={Boolean(srvErr("eventDate"))}
            className="border-brand-purple/20 focus-visible:ring-brand-purple/30 h-10 bg-white"
          />
          {srvErr("eventDate") ? (
            <p className="text-xs text-rose-700">{srvErr("eventDate")}</p>
          ) : (
            <p className="text-brand-muted text-[11px]">
              Así reservamos cupo prioritario en nuestro taller artesanal.
            </p>
          )}
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
            placeholder="Ej. Valentina Gómez Rojas"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            onBlur={() => {
              if (contactName.trim()) setContactName(capitalizeName(contactName));
              markTouched("contactName");
            }}
            aria-invalid={Boolean(contactNameErr)}
            aria-describedby={contactNameErr ? "b2b-name-error" : undefined}
            className="border-brand-purple/20 focus-visible:ring-brand-purple/30 h-10 bg-white"
          />
          {contactNameErr ? (
            <p id="b2b-name-error" className="text-xs text-rose-700">
              {contactNameErr}
            </p>
          ) : (
            <p className="text-brand-muted text-[11px]">Solo letras, máximo 5 palabras.</p>
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
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              onBlur={() => {
                if (organizationName.trim()) {
                  setOrganizationName(organizationName.trim().replace(/\s+/g, " "));
                }
              }}
              className="border-brand-purple/20 focus-visible:ring-brand-purple/30 h-10 bg-white pl-9"
            />
          </div>
          {srvErr("organizationName") && (
            <p className="text-xs text-rose-700">{srvErr("organizationName")}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="b2b-email" className="text-brand-purple-dark text-sm font-semibold">
            Correo electrónico *
          </Label>
          <EmailInput
            id="b2b-email"
            name="email"
            required
            maxLength={180}
            autoComplete="email"
            placeholder="valentina@empresa.co"
            value={email}
            onValueChange={setEmail}
            aria-invalid={Boolean(srvErr("email"))}
            aria-describedby={srvErr("email") ? "b2b-email-error" : undefined}
            className="border-brand-purple/20 focus-visible:ring-brand-purple/30 h-10 bg-white"
          />
          {srvErr("email") && (
            <p id="b2b-email-error" className="text-xs text-rose-700">
              {srvErr("email")}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="b2b-whatsapp" className="text-brand-purple-dark text-sm font-semibold">
            WhatsApp / Celular *
          </Label>
          <PhoneInput
            id="b2b-whatsapp"
            name="whatsapp"
            required
            disabled={pending}
            error={whatsappErr}
            onChange={(national, dial) => setPhone({ national, dial })}
            onBlur={() => markTouched("whatsapp")}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="b2b-nit" className="text-brand-purple-dark text-sm font-semibold">
            NIT para facturación (opcional)
          </Label>
          <Input
            id="b2b-nit"
            name="nit"
            inputMode="numeric"
            maxLength={12}
            placeholder="900123456-8"
            value={nit}
            onChange={(e) => setNit(e.target.value.replace(/[^\d-]/g, "").slice(0, 12))}
            onBlur={() => {
              markTouched("nit");
              if (nitCheck?.valid) setNit(nitCheck.normalized);
            }}
            aria-invalid={Boolean(nitErr)}
            aria-describedby={nitErr ? "b2b-nit-error" : undefined}
            className="border-brand-purple/20 focus-visible:ring-brand-purple/30 h-10 bg-white"
          />
          {nitErr ? (
            <p id="b2b-nit-error" className="text-xs text-rose-700">
              {nitErr}
            </p>
          ) : nitAutoDvHint ? (
            <p className="text-brand-purple text-[11px] font-medium">{nitAutoDvHint}</p>
          ) : (
            <p className="text-brand-muted text-[11px]">
              9 dígitos + dígito DIAN (si escribes los 9 dígitos te calculamos el DV).
            </p>
          )}
        </div>
      </div>

      {/* Destino DANE oficial (Departamento -> Ciudad) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="b2b-dept" className="text-brand-purple-dark text-sm font-semibold">
            Departamento de entrega *
          </Label>
          <select
            id="b2b-dept"
            required
            value={deptCode}
            onChange={(e) => {
              setDeptCode(e.target.value);
              setCityCode("");
            }}
            aria-invalid={Boolean(srvErr("department"))}
            className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 h-10 w-full rounded-md border bg-white px-3 text-sm focus:ring-2 focus:outline-none"
          >
            <option value="">Selecciona departamento...</option>
            {DEPARTMENTS.map((d) => (
              <option key={d.code} value={d.code}>
                {d.name}
              </option>
            ))}
          </select>
          <input type="hidden" name="department" value={selectedDept?.name ?? ""} />
          {srvErr("department") && <p className="text-xs text-rose-700">{srvErr("department")}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="b2b-city" className="text-brand-purple-dark text-sm font-semibold">
            Ciudad / Municipio de entrega *
          </Label>
          <select
            id="b2b-city"
            required
            disabled={!deptCode}
            value={cityCode}
            onChange={(e) => setCityCode(e.target.value)}
            aria-invalid={Boolean(srvErr("city"))}
            className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 h-10 w-full rounded-md border bg-white px-3 text-sm focus:ring-2 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
          >
            <option value="">
              {deptCode ? "Selecciona ciudad o municipio..." : "Elige primero el departamento"}
            </option>
            {cities.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
          <input type="hidden" name="city" value={selectedCity?.name ?? ""} />
          {srvErr("city") && <p className="text-xs text-rose-700">{srvErr("city")}</p>}
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
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="¿Qué productos te interesan (fotoimanes con logo, calendarios corporativos, recordatorios magnéticos, empaque de regalo)? ¿Todos llevan el mismo diseño o personalización individual?"
          aria-invalid={Boolean(srvErr("notes"))}
          className="border-brand-purple/20 focus-visible:ring-brand-purple/30 bg-white"
        />
        {srvErr("notes") && <p className="text-xs text-rose-700">{srvErr("notes")}</p>}
      </div>

      {/* Consentimientos Ley 1581 de 2012 */}
      <div className="border-brand-purple/15 space-y-2.5 rounded-2xl border bg-[#FFF8F0]/70 p-4">
        <label className="flex cursor-pointer items-start gap-2.5 text-xs">
          <input
            type="checkbox"
            name="acceptHabeasData"
            required
            checked={acceptHabeasData}
            onChange={(e) => setAcceptHabeasData(e.target.checked)}
            className="accent-brand-purple mt-0.5 h-4 w-4 shrink-0 rounded"
          />
          <span className="text-brand-purple-dark/90">
            Autorizo el tratamiento de mis datos personales para gestionar esta cotización conforme
            a la{" "}
            <Link
              href="/legal/privacidad"
              target="_blank"
              className="text-brand-purple-dark hover:text-brand-purple font-semibold underline underline-offset-2"
            >
              Política de Privacidad
            </Link>{" "}
            (Ley 1581 de 2012). *
          </span>
        </label>
        {srvErr("acceptHabeasData") && (
          <p className="text-xs text-rose-700">{srvErr("acceptHabeasData")}</p>
        )}

        <label className="flex cursor-pointer items-start gap-2.5 text-xs">
          <input
            type="checkbox"
            name="acceptNewsletter"
            checked={acceptNewsletter}
            onChange={(e) => setAcceptNewsletter(e.target.checked)}
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
