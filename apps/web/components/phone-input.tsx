"use client";

/*
 * <PhoneInput> — teléfono con indicativo de país (bandera + código) al lado
 * del número. Colombia (+57 🇨🇴) por defecto; lista corta LatAm + USA.
 *
 * El <form> recibe UN hidden `name` con el valor "+<indicativo> <nacional>"
 * (ej. "+57 3208873826"). El server lo normaliza/valida con
 * normalizePhoneWithDial (lib/colombia-validators): Colombia se persiste como
 * los 10 dígitos locales (mismo formato del checkout/courier), otro país como
 * "+<indicativo><número>".
 *
 * Para Colombia el input visible se auto-formatea "320 887 3826" (formatPhone)
 * y se limita a 10 dígitos; otros países aceptan 6-15 dígitos (E.164).
 */

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { formatPhone } from "@/lib/colombia-validators";

export type PhoneDialCode = {
  iso: string;
  flag: string;
  dial: string;
  label: string;
};

// Lista corta LatAm + Colombia primero (default). Sin exóticos: cubre la
// diáspora típica de clientes de la tienda.
export const PHONE_DIAL_CODES: PhoneDialCode[] = [
  { iso: "CO", flag: "🇨🇴", dial: "57", label: "Colombia" },
  { iso: "MX", flag: "🇲🇽", dial: "52", label: "México" },
  { iso: "AR", flag: "🇦🇷", dial: "54", label: "Argentina" },
  { iso: "CL", flag: "🇨🇱", dial: "56", label: "Chile" },
  { iso: "PE", flag: "🇵🇪", dial: "51", label: "Perú" },
  { iso: "EC", flag: "🇪🇨", dial: "593", label: "Ecuador" },
  { iso: "VE", flag: "🇻🇪", dial: "58", label: "Venezuela" },
  { iso: "UY", flag: "🇺🇾", dial: "598", label: "Uruguay" },
  { iso: "PA", flag: "🇵🇦", dial: "507", label: "Panamá" },
  { iso: "CR", flag: "🇨🇷", dial: "506", label: "Costa Rica" },
  { iso: "US", flag: "🇺🇸", dial: "1", label: "Estados Unidos" },
];

// Prefijos más largos primero (593 antes que 59…) para el split de un valor
// persistido con indicativo.
const BY_LENGTH_DESC = [...PHONE_DIAL_CODES].sort((a, b) => b.dial.length - a.dial.length);

/** Reconstruye indicativo + número nacional desde el valor persistido. */
function parseStoredPhone(value: string): { dial: string; national: string } {
  const v = value.trim();
  if (v.startsWith("+")) {
    const digits = v.replace(/\D/g, "");
    for (const c of BY_LENGTH_DESC) {
      if (digits.startsWith(c.dial)) {
        return { dial: c.dial, national: digits.slice(c.dial.length) };
      }
    }
    return { dial: "57", national: digits };
  }
  // Sin "+": legado = móvil colombiano de 10 dígitos (o con el 57 pegado).
  const digits = v.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("57")) {
    return { dial: "57", national: digits.slice(2) };
  }
  return { dial: "57", national: digits };
}

export function PhoneInput({
  name,
  id,
  defaultValue = "",
  disabled,
  required,
  error,
  placeholder,
  onChange,
  onBlur,
}: {
  /** Nombre del hidden que viaja en el FormData ("+<indicativo> <nacional>"). */
  name: string;
  id?: string;
  /** Valor persistido: "3208873826" (CO) o "+54 9112345678" (otro país). */
  defaultValue?: string;
  disabled?: boolean;
  required?: boolean;
  /** Error efectivo (server o del padre) — se renderiza y marca aria-invalid. */
  error?: string | null;
  placeholder?: string;
  /** Notifica (dígitos nacionales, indicativo) para validación live del padre. */
  onChange?: (national: string, dial: string) => void;
  onBlur?: () => void;
}) {
  const parsed = parseStoredPhone(defaultValue);
  const [dial, setDial] = useState(parsed.dial);
  const [national, setNational] = useState(parsed.national);
  const isColombia = dial === "57";

  const display = isColombia ? formatPhone(national) : national;

  function emit(nextNational: string, nextDial: string) {
    setNational(nextNational);
    setDial(nextDial);
    onChange?.(nextNational, nextDial);
  }

  const selectClass =
    "border-brand-purple/25 focus:border-brand-purple h-9 rounded-md border bg-white px-1.5 text-sm focus:outline-none disabled:bg-slate-50 disabled:text-slate-400";

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <select
          aria-label="Indicativo de país"
          value={dial}
          disabled={disabled}
          onChange={(e) => emit(national, e.target.value)}
          className={`${selectClass} w-[7.5rem] flex-shrink-0`}
        >
          {PHONE_DIAL_CODES.map((c) => (
            <option key={c.iso} value={c.dial}>
              {c.flag} +{c.dial}
            </option>
          ))}
        </select>
        <Input
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          required={required}
          disabled={disabled}
          value={display}
          placeholder={placeholder ?? (isColombia ? "300 000 0000" : "Número")}
          maxLength={isColombia ? 12 : 15}
          aria-invalid={Boolean(error)}
          aria-describedby={error && id ? `${id}-error` : undefined}
          onChange={(e) => emit(e.target.value.replace(/\D/g, "").slice(0, 15), dial)}
          onBlur={onBlur}
        />
      </div>
      {/* Lo que valida/persiste el server: indicativo + dígitos nacionales. */}
      <input type="hidden" name={name} value={national ? `+${dial} ${national}` : ""} />
      {error && id && (
        <p id={`${id}-error`} className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
