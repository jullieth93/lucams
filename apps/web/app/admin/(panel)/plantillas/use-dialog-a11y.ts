"use client";

/*
 * useDialogA11y — accesibilidad compartida para modales custom del admin.
 *
 * Implementa el patrón WAI-ARIA APG para dialog modales:
 *   1. Foco inicial al abrir.
 *   2. Focus trap con Tab / Shift+Tab.
 *   3. Escape cierra (onClose).
 *   4. Retorno de foco al cerrar.
 *
 * El contenedor debe tener role="dialog" y tabIndex={-1}.
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
      if (prevFocus && document.contains(prevFocus)) prevFocus.focus?.();
    };
  }, [ref, onClose, active]);
}
