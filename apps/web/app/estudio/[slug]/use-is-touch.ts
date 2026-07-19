"use client";

import { useState } from "react";

/**
 * #9 — detección de dispositivo táctil, compartida por los overlays 3D del Estudio para elegir el
 * copy del gesto de zoom ("rueda o pellizca" en desktop vs "pellizca con 2 dedos" en táctil). Mismo
 * initializer lazy que StudioGesturesHint: se calcula UNA vez en el primer render (evita el
 * setState-in-effect antipattern de React 19). Seguro contra hydration mismatch porque estos
 * overlays solo se montan tras interacción del cliente (abrir el modal / la galería 3D).
 */
export function useIsTouch(): boolean {
  const [isTouch] = useState(() => {
    if (typeof window === "undefined") return false;
    return (
      "ontouchstart" in window || (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0)
    );
  });
  return isTouch;
}
