"use client";

import { useState } from "react";

/**
 * #9 — detección de dispositivo táctil, compartida por los overlays 3D del Estudio para elegir el
 * copy del gesto de zoom ("rueda o pellizca" en desktop vs "pellizca con 2 dedos" en táctil). Mismo
 * initializer lazy que StudioGesturesHint: se calcula UNA vez en el primer render (evita el
 * setState-in-effect antipattern de React 19). Seguro contra hydration mismatch porque estos
 * overlays solo se montan tras interacción del cliente (abrir el modal / la galería 3D).
 *
 * Lucy 2026-09-08 — la detección pasa a la MEDIA QUERY `(pointer: coarse)`: el chequeo anterior
 * (`ontouchstart` / `maxTouchPoints > 0`) devolvía true en laptops/desktop CON pantalla táctil, así
 * que el hint "pellizca con 2 dedos para acercar" se mostraba también en desktop, donde el pellizco
 * es imposible. `pointer: coarse` describe el mecanismo de entrada PRINCIPAL (dedo vs mouse), que es
 * lo que el hint necesita.
 */
export function useIsTouch(): boolean {
  const [isTouch] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia("(pointer: coarse)").matches;
  });
  return isTouch;
}
