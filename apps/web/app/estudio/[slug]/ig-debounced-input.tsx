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
import { useState } from "react";
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
  commitEcho,
  warningFor,
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
  /**
   * 2026-10-26 — eco del commit en formato DISPLAY (el valor que el store
   *  devuelve tras el commit): sin él, en campos cuyo commit TRANSFORMA el
   *  texto (ubicación: capitaliza y normaliza la coma), el sync del hook
   *  reseteaba el draft a los ~350 ms y se comía el espacio que el cliente
   *  estaba tecleando ("Santa Marta" imposible).
   */
  commitEcho?: (committed: string) => string;
  /**
   * 2026-10-27 (owner) — AVISO de formato inline (hoy: Ubicación «Ciudad,
   *  País»): devuelve el mensaje cuando el draft NO cumple, null si está bien
   *  (o vacío — el campo es opcional y vacío es válido). El aviso solo aparece
   *  tras el primer commit/blur (touched): nunca mientras escribe por primera
   *  vez, nunca bloquea guardar ni finalizar; se reevalúa en vivo sobre el
   *  draft y desaparece al corregir.
   */
  warningFor?: (draft: string) => string | null;
  /** Contenido bajo el input que depende del draft vivo (p. ej. el contador). */
  footer?: (draft: string) => ReactNode;
}) {
  const [touched, setTouched] = useState(false);
  const { draft, change, flush } = useDebouncedCommit(
    value,
    (d) => {
      // El commit (debounce o blur) marca el campo como tocado: a partir de
      // ahí el aviso de formato puede mostrarse.
      setTouched(true);
      onCommit(d);
    },
    undefined,
    commitEcho,
  );
  const warning = touched && warningFor ? warningFor(draft) : null;
  const warningId = `${inputId}-warning`;
  const describedByMerged =
    [describedBy, warning ? warningId : null].filter(Boolean).join(" ") || undefined;

  return (
    <>
      <input
        id={inputId}
        type="text"
        value={draft}
        maxLength={maxLength}
        inputMode={inputMode}
        // 2026-10-29 (owner) — la tecla de acción del teclado virtual se rotula
        // «siguiente»; el salto real lo hace focusNextFieldOnEnter del contenedor.
        enterKeyHint="next"
        placeholder={placeholder}
        aria-describedby={describedByMerged}
        aria-invalid={warning ? true : undefined}
        onChange={(e) => change(sanitize ? sanitize(e.target.value) : e.target.value)}
        onBlur={() => {
          flush();
          setTouched(true);
        }}
        className={className ?? IG_INPUT_CLASS}
        autoComplete="off"
        autoCapitalize={autoCapitalize}
        spellCheck={autoCapitalize === "none" ? false : undefined}
      />
      {warning && (
        // Ámbar suave (patrón de los avisos del estudio, p.ej. los chips de
        // calidad amber-100/amber-900): es ORIENTATIVO, no un error bloqueante.
        <p id={warningId} role="alert" className="mt-1 text-xs font-semibold text-amber-700">
          {warning}
        </p>
      )}
      {footer?.(draft)}
    </>
  );
}
