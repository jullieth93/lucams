"use client";

/*
 * usePrefersReducedMotion — respeta la preferencia del sistema "reducir movimiento"
 * (WCAG 2.2.2 pausar movimiento + 2.3.3 animación por interacción). #16.
 *
 * useState(false) + useEffect (NO initializer lazy): estos nodos se montan en el árbol SSR del
 * editor; arrancar en false y actualizar tras el montaje evita hydration mismatch. Escucha el
 * cambio en vivo para cubrir el toggle del sistema sin recargar.
 */

import { useEffect, useState } from "react";

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    // update() indirecto (mismo patrón que useIsMobile) — evita el flag set-state-in-effect.
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return reduced;
}
