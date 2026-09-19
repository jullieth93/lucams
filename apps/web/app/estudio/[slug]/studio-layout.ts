/*
 * Layout compartido de las superficies del Estudio (Ola 32, 2026-09-18).
 *
 * STUDIO_MAX_WIDTH — ancho máximo (px lógicos) del contenedor de los editores
 * simples (nombre / set de letras) y del chrome de sus headers. Es el MISMO cap
 * que aplica el grid del estudio de foto (MAX_VIEWPORT_WIDTH, inline en
 * studio-canvas-grid.tsx — ese archivo está congelado en esta fase, así que la
 * constante no se pudo extraer de allí: si cambia uno, cambiar el otro).
 *
 * ¿Por qué un cap y no `max-w-*` de Tailwind? 1600px no existe en la escala
 * default (max-w-7xl = 1280) y la referencia visual del owner es el estudio de
 * separadores: el lienzo usa el ancho disponible sin llegar a estirarse de más
 * en monitores ultra-anchos.
 */
export const STUDIO_MAX_WIDTH = 1600;
