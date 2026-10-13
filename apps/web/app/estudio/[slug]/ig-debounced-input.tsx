"use client";

/*
 * IgDebouncedInput — input de texto con commit DEBOUNCED de los campos
 * asistidos de la Polaroid Instagram (owner 2026-10-12).
 *
 * Reemplaza al IgLocationCombobox (retirado por decisión de producto: la
 * asistencia de sugerencias se eliminó y el commit POR TECLA hacía la
 * plantilla muy lenta). El input responde al instante con estado local y
 * compromete al store tras ~350ms sin teclear o al blur
 * (lib/use-debounced-commit.ts).
 *
 * Compartido: lo usan el bloque MASIVO del sidebar (studio-ig-post-fields.tsx)
 * y la edición INDIVIDUAL por slot (studio-ig-slot-fields.tsx) — por eso
 * recibe el valor ya en formato display, el sanitize en vivo y el commit del
 * caller (que transforma el draft a override).
 */

import type { ReactNode } from "react";
import { useDebouncedCommit } from "./lib/use-debounced-commit";

/** Clase de input compartida por los controles asistidos de los campos IG. */
export const IG_INPUT_CLASS =
  "border-brand-purple/15 text-brand-purple-dark focus:border-brand-turquoise focus:ring-brand-turquoise/30 w-full rounded-md border px-3 py-2 text-sm transition-colors focus:ring-2 focus:outline-none";

export function IgDebouncedInput({
  inputId,
  value,
  placeholder,
  sanitize,
  onCommit,
  maxLength,
  inputMode,
  className,
  describedBy,
  autoCapitalize,
  footer,
}: {
  inputId: string;
  /** Valor vigente MOSTRADO (display) que viene del store. */
  value: string;
  placeholder?: string;
  /** Strip en vivo de caracteres inválidos: el draft nunca los muestra. */
  sanitize?: (raw: string) => string;
  /** Commit al store (el caller transforma el draft a override). */
  onCommit: (draft: string) => void;
  maxLength?: number;
  inputMode?: "numeric";
  className?: string;
  describedBy?: string;
  autoCapitalize?: string;
  /** Contenido bajo el input que depende del draft vivo (p. ej. el contador). */
  footer?: (draft: string) => ReactNode;
}) {
  const { draft, change, flush } = useDebouncedCommit(value, onCommit);

  return (
    <>
      <input
        id={inputId}
        type="text"
        value={draft}
        maxLength={maxLength}
        inputMode={inputMode}
        placeholder={placeholder}
        aria-describedby={describedBy}
        onChange={(e) => change(sanitize ? sanitize(e.target.value) : e.target.value)}
        onBlur={flush}
        className={className ?? IG_INPUT_CLASS}
        autoComplete="off"
        autoCapitalize={autoCapitalize}
        spellCheck={autoCapitalize === "none" ? false : undefined}
      />
      {footer?.(draft)}
    </>
  );
}
