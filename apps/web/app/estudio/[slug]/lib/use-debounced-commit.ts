/*
 * useDebouncedCommit — patrón de commit DEBOUNCED para los campos de texto de
 * la Polaroid Instagram (owner 2026-10-12: la plantilla se ponía MUY LENTA
 * porque cada tecla llamaba setTextOverrideAllSlots → reescribía el override
 * en los N slots + empujaba undo + armaba auto-save).
 *
 * Patrón:
 *  - Estado LOCAL inmediato (`draft`): el input responde al instante.
 *  - Commit al store tras ~350ms sin teclear, al BLUR (`flush`) o al
 *    desmontar — nunca por tecla.
 *  - Sync desde afuera (undo, «Aplicar a todas», valor pack-level): solo
 *    cuando el valor que viene del store NO es el de nuestro propio commit,
 *    para no pisar lo que el cliente está tecleando.
 */

import { useCallback, useEffect, useRef, useState } from "react";

/** Espera sin teclear antes de comprometer el campo al store. */
export const IG_FIELD_COMMIT_DEBOUNCE_MS = 350;

export function useDebouncedCommit(
  /** Valor vigente MOSTRADO que viene del store (display, no override crudo). */
  committedValue: string,
  /** Commit al store; recibe el draft (el caller lo transforma a override). */
  onCommit: (value: string) => void,
  debounceMs: number = IG_FIELD_COMMIT_DEBOUNCE_MS,
): { draft: string; change: (next: string) => void; flush: () => void } {
  const [draft, setDraft] = useState(committedValue);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCommitRef = useRef(committedValue);
  // Refs "de último valor" para que el flush de blur/desmontaje no dependa de
  // closures viejas ni re-suscriba effects en cada render. Se actualizan en
  // effect (nunca durante el render — regla react-hooks/refs): los handlers de
  // evento y el cleanup de desmontaje siempre corren después de este effect.
  const draftRef = useRef(draft);
  const onCommitRef = useRef(onCommit);
  useEffect(() => {
    draftRef.current = draft;
    onCommitRef.current = onCommit;
  });

  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const commitNow = useCallback((value: string) => {
    lastCommitRef.current = value;
    onCommitRef.current(value);
  }, []);

  // Sync externo: undo / «aplicar a todas» / cambio pack-level. Si el valor
  // que llega es el de nuestro propio commit, no tocar el draft.
  useEffect(() => {
    if (committedValue !== lastCommitRef.current) {
      lastCommitRef.current = committedValue;
      clearTimer();
      setDraft(committedValue);
    }
  }, [committedValue]);

  const change = useCallback(
    (next: string) => {
      setDraft(next);
      clearTimer();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        commitNow(next);
      }, debounceMs);
    },
    [commitNow, debounceMs],
  );

  /** Commit inmediato si hay tecleo pendiente (blur). Sin pendiente → no-op. */
  const flush = useCallback(() => {
    if (timerRef.current === null) return;
    clearTimer();
    const pending = draftRef.current;
    if (pending !== lastCommitRef.current) commitNow(pending);
  }, [commitNow]);

  // Al desmontar (cerrar el modal, cambiar de plantilla): no perder lo
  // tecleado que aún no había cumplido el debounce.
  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        const pending = draftRef.current;
        if (pending !== lastCommitRef.current) commitNow(pending);
      }
    },
    [commitNow],
  );

  return { draft, change, flush };
}
