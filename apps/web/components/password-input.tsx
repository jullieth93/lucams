"use client";

/*
 * Input de contraseña con:
 *   - Toggle ojo (mostrar/ocultar) — clave en móvil para evitar typos.
 *   - Detector de Caps Lock — alerta inline si el user tiene Mayús activado.
 *   - Strength meter opcional (4 segmentos animados + label).
 *
 * Diseñado para encajar con la paleta Lucams y el shadcn Input base.
 */

import { Eye, EyeOff, AlertTriangle } from "lucide-react";
import { useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { calculatePasswordStrength, type PasswordScore } from "@/lib/password-strength";
import { cn } from "@/lib/utils";

type Props = Omit<ComponentProps<"input">, "type"> & {
  showStrength?: boolean;
  value?: string;
  onValueChange?: (v: string) => void;
};

export function PasswordInput({
  showStrength = false,
  value: controlledValue,
  onValueChange,
  className,
  ...inputProps
}: Props) {
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [internalValue, setInternalValue] = useState("");

  const value = controlledValue ?? internalValue;
  const setValue = (v: string) => {
    if (controlledValue === undefined) setInternalValue(v);
    onValueChange?.(v);
  };

  const strength = showStrength ? calculatePasswordStrength(value) : null;

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Input
          {...inputProps}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            inputProps.onChange?.(e);
          }}
          onKeyDown={(e) => {
            setCapsLock(e.getModifierState("CapsLock"));
            inputProps.onKeyDown?.(e);
          }}
          onKeyUp={(e) => {
            setCapsLock(e.getModifierState("CapsLock"));
            inputProps.onKeyUp?.(e);
          }}
          onBlur={(e) => {
            setCapsLock(false);
            inputProps.onBlur?.(e);
          }}
          className={cn("pr-10", className)}
        />
        <button
          type="button"
          aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
          className="text-muted-foreground hover:text-brand-purple focus-visible:text-brand-purple absolute inset-y-0 right-0 flex items-center px-3 focus:outline-none"
          tabIndex={-1}
        >
          {visible ? (
            <EyeOff className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Eye className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>

      {capsLock && (
        <p
          role="status"
          className="text-warning flex items-center gap-1.5 text-xs"
          style={{ color: "var(--warning)" }}
        >
          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
          Bloq Mayús activado
        </p>
      )}

      {strength && value && (
        <div
          className="space-y-1"
          role="status"
          aria-label={`Fuerza de la contraseña: ${strength.label}`}
        >
          <div className="flex gap-1">
            {([0, 1, 2, 3] as const).map((i) => (
              <div
                key={i}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors duration-300",
                  (strength.score as number) > i ? strength.color : "bg-muted",
                )}
              />
            ))}
          </div>
          <p className="flex justify-between text-xs">
            <span className="text-foreground/80 font-medium">{strength.label}</span>
            <span className="text-muted-foreground">{strength.suggestion}</span>
          </p>
        </div>
      )}
    </div>
  );
}

export type { PasswordScore };
