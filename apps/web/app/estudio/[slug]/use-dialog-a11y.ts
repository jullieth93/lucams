"use client";

/*
 * useDialogA11y — accesibilidad compartida para los modales CUSTOM del Estudio (#15).
 *
 * Estos overlays son fullscreen con WebGL/OrbitControls + AnimatePresence, donde migrar a Radix
 * pelearía con los gestos de las escenas 3D. En vez de eso, este hook les da lo que a un
 * role="dialog" le falta (WAI-ARIA APG — Dialog Modal):
 *   1. Foco inicial: al abrir, mueve el foco al primer focusable interno (o al contenedor).
 *   2. Focus trap: Tab / Shift+Tab ciclan dentro del modal, no se escapan al fondo.
 *   3. Escape cierra (onClose).
 *   4. Retorno de foco: al cerrar, devuelve el foco al elemento que lo tenía antes (si sigue vivo).
 *
 * El contenedor debe tener role="dialog" (o "alertdialog") y tabIndex={-1}.
 */

import { useEffect, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useDialogA11y(
  ref: RefObject<HTMLElement | null>,
  opts: { onClose: () => void; active?: boolean },
): void {
  const { onClose, active = true } = opts;

  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    if (!node) return;

    const prevFocus = document.activeElement as HTMLElement | null;

    // Foco inicial: primer focusable interno, o el contenedor.
    const focusables = () => Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = focusables()[0];
    (first ?? node).focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        node.focus();
        return;
      }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const activeEl = document.activeElement;
      if (e.shiftKey && (activeEl === firstEl || activeEl === node)) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && activeEl === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    node.addEventListener("keydown", onKeyDown);
    return () => {
      node.removeEventListener("keydown", onKeyDown);
      // Devolver el foco solo si el trigger sigue en el DOM (AnimatePresence pudo desmontarlo).
      if (prevFocus && document.contains(prevFocus)) prevFocus.focus?.();
    };
  }, [ref, onClose, active]);
}
