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

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentProps,
} from "react";
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
const EMAIL_PATTERN =
  "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,24}$";

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
  ...inputProps
}: Props) {
  const [internalValue, setInternalValue] = useState(
    String(defaultValue ?? ""),
  );
  const [open, setOpen] = useState(false);
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
  const alreadyComplete =
    atIdx >= 0 && POPULAR_DOMAINS.some((d) => d === partial);

  const suggestions =
    atIdx >= 0 && local.length > 0 && !alreadyComplete
      ? POPULAR_DOMAINS.filter((d) => d.startsWith(partial)).slice(0, 5)
      : [];

  const shouldShow = open && suggestions.length > 0;

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
          // setTimeout para permitir que el click en sugerencia se procese
          // antes de cerrar el dropdown.
          setTimeout(() => setOpen(false), 150);
          onBlur?.(e);
        }}
        autoComplete={inputProps.autoComplete ?? "email"}
      />

      {shouldShow && (
        <ul
          role="listbox"
          aria-label="Sugerencias de dominio"
          className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-border bg-popover shadow-lg animate-in fade-in slide-in-from-top-1 duration-150"
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
                <span className="font-medium text-brand-purple-dark">
                  {domain}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
