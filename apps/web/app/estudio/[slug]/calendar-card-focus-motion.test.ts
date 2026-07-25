/*
 * Renderizado bajo demanda y `prefers-reduced-motion` en el visor de lectura del calendario.
 *
 * Modo de fallo real (auditoría de accesibilidad 2026-07-24): `CalendarCardFocus` es una vista
 * ESTÁTICA —una tarjeta acostada sobre la mesa, sin autoRotate ni ningún `useFrame`— pero el
 * `<Canvas>` de react-three-fiber arranca en `frameloop="always"`, o sea repinta a ~60 fps
 * mientras el cliente simplemente LEE los festivos del mes. En un celular eso es GPU y batería
 * quemadas por nada, y en un equipo modesto sube el ventilador durante una lectura de minutos.
 * `frameloop="demand"` pinta al montar y solo cuando algo cambia.
 *
 * El segundo hallazgo es el damping de OrbitControls: la inercia sigue girando la tarjeta después
 * de soltar el dedo, que es exactamente el movimiento post-interacción del que habla WCAG 2.3.3.
 * Con `prefers-reduced-motion: reduce` se apaga.
 *
 * Test estático: `<Canvas>` necesita un contexto WebGL real (jsdom no lo tiene) y mockear r3f
 * entero verificaría el mock, no el componente. Lo que hay que congelar es que el lienzo declare
 * el modo bajo demanda, que EXISTAN los disparos de `invalidate()` que ese modo obliga a poner
 * (sin ellos la tarjeta se queda congelada al cambiar de mes) y que el damping cuelgue de la
 * preferencia del sistema.
 *
 * Referencia: react-three-fiber, "Performance / On-demand rendering"
 * (https://r3f.docs.pmnd.rs/advanced/scaling-performance#on-demand-rendering · consultado
 * 2026-07-24): con `frameloop="demand"` hay que llamar `invalidate()` tras cambios imperativos.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FOCUS = readFileSync(join(__dirname, "calendar-card-focus.tsx"), "utf8");
const FIT_CAMERA = readFileSync(join(__dirname, "fit-camera-polar.tsx"), "utf8");

describe("CalendarCardFocus — vista de lectura, no de animación", () => {
  it("el lienzo se pinta bajo demanda", () => {
    expect(FOCUS).toMatch(/<Canvas[\s\S]*?frameloop="demand"/);
  });

  it("sigue sin animarse solo (nada que justifique volver a 60 fps continuos)", () => {
    // Se busca el USO (`useFrame(`, `autoRotate=`), no la palabra: el encabezado del archivo
    // explica justamente por qué no los hay.
    expect(FOCUS).not.toMatch(/useFrame\(/);
    expect(FOCUS).not.toMatch(/autoRotate=/);
  });

  it("hay un disparo de invalidate() para la textura, que llega asíncrona", () => {
    // Sin esto, pasar de mes deja la tarjeta anterior congelada: el modo demanda no repinta solo.
    expect(FOCUS).toMatch(/function InvalidateOnChange[\s\S]*?invalidate\(\)/);
    expect(FOCUS).toMatch(/<InvalidateOnChange token={texture} \/>/);
  });

  it("FitCameraPolar invalida tras mover la cámara (mutación imperativa que r3f no ve)", () => {
    expect(FIT_CAMERA).toMatch(/controls\?\.update\?\.\(\);\s*\n\s*invalidate\(\);/);
  });

  it("el damping (inercia al soltar) se apaga con prefers-reduced-motion — WCAG 2.3.3", () => {
    expect(FOCUS).toMatch(/usePrefersReducedMotion/);
    expect(FOCUS).toMatch(/enableDamping={!reduced}/);
  });
});
