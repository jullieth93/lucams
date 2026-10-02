/*
 * Patrón ÚNICO del CTA de estudio ocupado (Paquete E, 2026-10-02).
 *
 * Antes había 4 implementaciones del estado «Preparando… / Agregando…» con
 * estilos distintos: el toolbar del estudio de foto caía al estilo de
 * BLOQUEADO (bg-brand-purple/30–/40, un morado casi lavanda), los editores de
 * letras atenuaban el degradado con opacidades distintas (50 vs 60) y el
 * header simple no cambiaba nada. Vocales/Abecedario y el resto de productos
 * se veían diferentes al preparar/agregar.
 *
 * El patrón acordado: el CTA ocupado CONSERVA el fondo propio de su superficie
 * (degradado `bg-gradient-brand` en los editores de letras; morado sólido
 * `bg-brand-purple` en el toolbar del estudio de foto y en el header simple),
 * muestra el label busy del CMS (studio-texts: comun.preparando /
 * comun.agregando) con spinner, queda disabled y se atenúa SIEMPRE igual
 * (70% — se lee como "trabajando", no como el bloqueado por faltantes, que
 * sigue siendo el morado /30–/40).
 */

/** Atenuado único del estado ocupado (se concatena cuando busy = true). */
export const STUDIO_CTA_BUSY_CLASSES = "cursor-not-allowed opacity-70";

/** Versión `disabled:` para los CTAs que se apagan con el atributo HTML
 *  (editores de letras: el busy y el bloqueado por validación comparten
 *  `disabled`, así que el atenuado aplica a ambos por igual). */
export const STUDIO_CTA_DISABLED_CLASSES = "disabled:cursor-not-allowed disabled:opacity-70";
