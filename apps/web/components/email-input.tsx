/*
 * <EmailInput /> — Input de email con:
 *   1. Validación HTML5 nativa (type="email" + pattern) — feedback
 *      inmediato del browser antes incluso del submit.
 *   2. Autocomplete de dominios populares: cuando el user tipea
 *      "lucy@" o "lucy@gma", muestra sugerencias debajo del campo.
 *   3. Mantiene compatible con <form action> de Server Actions
 *      (lee el valor por `name` del input, no por ref).
 *
 * Lista de dominios:
 *   gmail.com, hotmail.com, outlook.com, yahoo.com, icloud.com,
 *   live.com, hotmail.es, yahoo.es — cubre ~95% de cuentas de
 *   consumo en LATAM/Colombia. Configurable si se necesita más.
 *
 *   4. Validación en vivo on-blur (feedback Lucy 2026-09-18 / Fase 7a):
 *      al salir del campo con valor NO vacío e inválido según EMAIL_PATTERN
 *      muestra mensaje inline (aria-invalid + aria-describedby, role="alert").
 *      Si el formato es válido pero el dominio es un typo conocido
 *      (gmial.com, hotmial.com, …) sugiere "¿Quisiste decir …?" como texto
 *      (role="status") — NO auto-corrige ni marca error. Una vez mostrado,
 *      el mensaje se re-evalúa on-change (desaparece al corregir).
 *
 * Patrón:
 *   - Uncontrolled por default — el form lee `name` del input.
 *   - Opcional `value` + `onValueChange` para uso controlado.
 *   - Click fuera del wrapper cierra el dropdown.
 *   - Click en una sugerencia auto-completa el value + dispara
 *     focus en el siguiente campo (o el submit) si el form lo tiene.
 *   - Server-side Zod (z.email) sigue validando independientemente —
 *     este componente solo mejora el UX, no reemplaza validación.
 */

"use client";

import { useEffect, useId, useRef, useState, type ChangeEvent, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const POPULAR_DOMAINS = [
  "gmail.com",
  "hotmail.com",
  "outlook.com",
  "yahoo.com",
  "icloud.com",
  "live.com",
  "hotmail.es",
  "yahoo.es",
] as const;

// Regex práctico para emails consumer (RFC 5321 simplificado).
// Más estricto que el `type=email` HTML5: requiere al menos un punto
// en el dominio + TLD de 2-24 chars.
// Ola 18 fix (auditoría 2026-07-26): los `-` de las clases van ESCAPADOS. Los
// navegadores modernos compilan el atributo `pattern` con la flag /v
// (unicodeSets), donde un `-` sin escapar dentro de […] es inválido y el
// navegador logueaba "Pattern attribute value … is not a valid regular
// expression" en TODOS los formularios (login, registro, cotización, admin).
const EMAIL_PATTERN = "^[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,24}$";
const EMAIL_REGEX = new RegExp(EMAIL_PATTERN);

// Typos de dominio comunes en ES/LATAM → dominio probable (Fase 7a).
// Solo transposiciones/omisiones evidentes: la sugerencia es texto informativo
// ("¿Quisiste decir…?"), nunca se auto-corrige el value. El autocomplete de
// dominios cubre prefijos MIENTRAS se escribe; esto cubre el typo COMPLETO
// que ya no es prefijo de ningún dominio popular (no se duplican).
const DOMAIN_TYPOS: Record<string, string> = {
  "gmial.com": "gmail.com",
  "gmal.com": "gmail.com",
  "gamil.com": "gmail.com",
  "gimail.com": "gmail.com",
  "gmail.con": "gmail.com",
  "hotmial.com": "hotmail.com",
  "hotmal.com": "hotmail.com",
  "hotmil.com": "hotmail.com",
  "hotmail.con": "hotmail.com",
  "outlok.com": "outlook.com",
  "outloook.com": "outlook.com",
  "outlook.es": "outlook.com",
  "outlook.con": "outlook.com",
  "yaho.com": "yahoo.com",
  "yahooo.com": "yahoo.com",
  "yhaoo.com": "yahoo.com",
  "yahoo.con": "yahoo.com",
  "iclou.com": "icloud.com",
  "iclod.com": "icloud.com",
  "live.con": "live.com",
};

/** Si el dominio es un typo conocido, devuelve el email corregido sugerido. */
function suggestDomainTypo(v: string): string | null {
  const at = v.lastIndexOf("@");
  if (at < 0) return null;
  const fix = DOMAIN_TYPOS[v.slice(at + 1).toLowerCase()];
  return fix ? `${v.slice(0, at)}@${fix}` : null;
}

type Props = Omit<ComponentProps<"input">, "type" | "pattern"> & {
  value?: string;
  onValueChange?: (v: string) => void;
};

export function EmailInput({
  value: controlledValue,
  onValueChange,
  defaultValue,
  className,
  onChange,
  onFocus,
  onBlur,
  "aria-invalid": ariaInvalidProp,
  "aria-describedby": ariaDescribedByProp,
  ...inputProps
}: Props) {
  const [internalValue, setInternalValue] = useState(String(defaultValue ?? ""));
  const [open, setOpen] = useState(false);
  // Fase 7a: la validación en vivo arranca en el PRIMER blur (no mientras se
  // escribe por primera vez); después se re-evalúa en cada change.
  const [touched, setTouched] = useState(false);
  const liveMsgId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);

  const value = controlledValue ?? internalValue;
  const setValue = (v: string) => {
    if (controlledValue === undefined) setInternalValue(v);
    onValueChange?.(v);
  };

  // Click fuera del wrapper cierra el dropdown.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Calcular sugerencias en base al texto después del último "@".
  const atIdx = value.lastIndexOf("@");
  const local = atIdx >= 0 ? value.slice(0, atIdx) : value;
  const partial = atIdx >= 0 ? value.slice(atIdx + 1).toLowerCase() : "";

  // Si el dominio ya está completo (matchea exacto), no mostrar sugerencias.
  const alreadyComplete = atIdx >= 0 && POPULAR_DOMAINS.some((d) => d === partial);

  const suggestions =
    atIdx >= 0 && local.length > 0 && !alreadyComplete
      ? POPULAR_DOMAINS.filter((d) => d.startsWith(partial)).slice(0, 5)
      : [];

  const shouldShow = open && suggestions.length > 0;

  // Feedback en vivo (Fase 7a): formato inválido = error; typo de dominio con
  // formato válido = sugerencia (no es error → no marca aria-invalid).
  const showFormatError = touched && value.length > 0 && !EMAIL_REGEX.test(value);
  const typoSuggestion = touched && !showFormatError ? suggestDomainTypo(value) : null;
  const liveMessage = showFormatError
    ? "Revisa el formato del correo: falta el @ o el dominio."
    : typoSuggestion
      ? `¿Quisiste decir ${typoSuggestion}?`
      : null;
  const ariaInvalid = Boolean(ariaInvalidProp) || showFormatError || undefined;
  const ariaDescribedBy =
    [ariaDescribedByProp, liveMessage ? liveMsgId : undefined].filter(Boolean).join(" ") ||
    undefined;

  const handleSelect = (domain: string) => {
    const newValue = `${local}@${domain}`;
    setValue(newValue);
    setOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <Input
        {...inputProps}
        type="email"
        pattern={EMAIL_PATTERN}
        value={value}
        className={className}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          setValue(e.target.value);
          setOpen(true);
          onChange?.(e);
        }}
        onFocus={(e) => {
          if (atIdx >= 0) setOpen(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setTouched(true);
          // setTimeout para permitir que el click en sugerencia se procese
          // antes de cerrar el dropdown.
          setTimeout(() => setOpen(false), 150);
          onBlur?.(e);
        }}
        autoComplete={inputProps.autoComplete ?? "email"}
      />

      {liveMessage && (
        <p
          id={liveMsgId}
          role={showFormatError ? "alert" : "status"}
          className={showFormatError ? "text-destructive mt-1.5 text-sm" : "mt-1.5 text-xs"}
          style={showFormatError ? undefined : { color: "var(--warning)" }}
        >
          {liveMessage}
        </p>
      )}

      {shouldShow && (
        <ul
          role="listbox"
          aria-label="Sugerencias de dominio"
          className="border-border bg-popover animate-in fade-in slide-in-from-top-1 absolute top-full right-0 left-0 z-20 mt-1 overflow-hidden rounded-lg border shadow-lg duration-150"
        >
          {suggestions.map((domain) => (
            <li key={domain} role="option" aria-selected="false">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(domain)}
                className={cn(
                  "block w-full px-3 py-2 text-left text-sm transition-colors",
                  "hover:bg-brand-cream focus:bg-brand-cream focus:outline-none",
                )}
              >
                <span className="text-muted-foreground">{local}@</span>
                <span className="text-brand-purple-dark font-medium">{domain}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
