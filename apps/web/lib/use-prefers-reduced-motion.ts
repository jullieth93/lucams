"use client";

/*
 * usePrefersReducedMotion — respeta la preferencia del sistema "reducir movimiento"
 * (WCAG 2.2.2 pausar movimiento + 2.3.3 animación por interacción).
 *
 * Extraído de `app/estudio/[slug]/` a `lib/` como primitiva cliente transversal
 * compartida por storefront, carruseles y Estudio (Fase 5 · #19).
 *
 * useState(false) + useEffect (NO initializer lazy): estos nodos se montan en el árbol SSR;
 * arrancar en false y actualizar tras el montaje evita hydration mismatch.
 */

import { useEffect, useState } from "react";

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return reduced;
}
