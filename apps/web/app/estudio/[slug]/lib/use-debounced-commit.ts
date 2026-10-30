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
  /**
   * 2026-10-26 (bug "la ubicación no deja poner espacios") — ECO del commit en
   * formato DISPLAY: mapea el draft comprometido al valor que el store devuelve
   * después (p.ej. ubicación: "bogotá " → "Bogotá"). Sin ella el sync externo
   * comparaba el valor TRANSFORMADO del store contra el draft CRUDO del último
   * commit, nunca igualaban y el draft se reseteaba ~350 ms después de cada
   * pausa — comiéndose el espacio que el cliente acababa de teclear. Omitirla
   * = identidad (campos sin transformación: caption y afines).
   */
  commitEcho?: (committed: string) => string,
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
  const commitEchoRef = useRef(commitEcho);
  useEffect(() => {
    draftRef.current = draft;
    onCommitRef.current = onCommit;
    commitEchoRef.current = commitEcho;
  });

  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const commitNow = useCallback((value: string) => {
    // Se registra el ECO (formato display) del commit: es lo que el store
    // devolverá como `committedValue` en el próximo render — sin esto el sync
    // confundía el eco del propio commit con un cambio externo y reseteaba el
    // draft mientras el cliente seguía escribiendo.
    const echo = commitEchoRef.current;
    lastCommitRef.current = echo ? echo(value) : value;
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

  /** Commit inmediato si hay tecleo pendiente (blur) + normalización VISIBLE. */
  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimer();
      const pending = draftRef.current;
      // La comparación va en formato ECO (display): el último commit se guarda
      // transformado y el draft es crudo — compararlos en crudo re-commitearía
      // siempre en campos con transformación (ubicación, likes).
      const echo = commitEchoRef.current;
      if ((echo ? echo(pending) : pending) !== lastCommitRef.current) commitNow(pending);
    }
    // Al BLUR (salir del campo) el draft visible se normaliza al formato
    // impreso ("bogotá" → "Bogotá, Colombia", "1234" → "1.234") — SIEMPRE,
    // también cuando el commit ya había corrido por debounce (2026-10-30, bug
    // owner: antes la normalización solo corría con commit PENDIENTE, así que
    // quien escribía pausado —debounce ya disparado— veía su texto crudo para
    // siempre). Mientras se ESCRIBE el draft NUNCA se toca: esa era la causa
    // del bug de espacios.
    const echo = commitEchoRef.current;
    if (echo) setDraft(echo(draftRef.current));
  }, [commitNow]);

  // Al desmontar (cerrar el modal, cambiar de plantilla): no perder lo
  // tecleado que aún no había cumplido el debounce.
  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        const pending = draftRef.current;
        const echo = commitEchoRef.current;
        if ((echo ? echo(pending) : pending) !== lastCommitRef.current) commitNow(pending);
      }
    },
    [commitNow],
  );

  return { draft, change, flush };
}
