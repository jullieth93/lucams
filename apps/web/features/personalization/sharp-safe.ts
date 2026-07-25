/*
 * `sharp` endurecido: única puerta de entrada a la librería en todo el proyecto.
 *
 * PROBLEMA. `sharp` hereda de libvips las CVE-2026-33327, 33328, 35590 y 35591 (dos de severidad
 * alta en CVSSv4), que solo se parchean en `sharp >= 0.35.0`. Pero esta app está clavada en 0.34.4
 * a propósito: el commit `6e86f94` bajó de 0.35.3 porque libvips reventaba en el runtime de Vercel.
 * Es decir, la versión que arregla la vulnerabilidad es la que tumba producción — y 0.35.3 sigue
 * siendo la última publicada, así que no hay una versión que resuelva ambas cosas.
 *
 * Y la exposición es real, no teórica: el Estudio está vivo en modo catálogo y `finalizeDesign`
 * procesa con sharp las fotos que sube cualquier invitado.
 *
 * SOLUCIÓN. El propio advisory de sharp documenta una mitigación sin actualizar: bloquear los
 * cargadores vulnerables. Las CVE están en los decodificadores de GIF, TIFF y del formato nativo
 * VIPS — y esta tienda no acepta ninguno de los tres: `ALLOWED_MIME` en `schemas.ts` se limita a
 * jpeg, png, webp, heic y heif. Bloquearlos cierra el vector con cero impacto funcional.
 *
 * Fuente: https://github.com/advisories/GHSA-f88m-g3jw-g9cj (consultado 2026-07-25).
 *
 * POR QUÉ UN MÓDULO Y NO UNA LLAMADA SUELTA. `sharp.block()` es global y basta con ejecutarlo una
 * vez, pero si cada archivo importara `sharp` directamente bastaría con que uno nuevo olvidara el
 * bloqueo para reabrir el hueco. Importando desde acá, usar sharp implica estar endurecido.
 *
 * AL SUBIR A >= 0.35.x: este bloqueo puede retirarse, pero conviene conservarlo igual — sigue
 * siendo superficie de ataque que la tienda no usa.
 */

import sharp from "sharp";

// Cargadores de los formatos que la tienda NO acepta y donde viven las CVE de libvips.
const BLOCKED_LOADERS = ["VipsForeignLoadNsgif", "VipsForeignLoadTiff", "VipsForeignLoadVips"];

sharp.block({ operation: BLOCKED_LOADERS });

export { BLOCKED_LOADERS };
// `sharp` se publica con `export =`, así que los tipos se re-exportan uno a uno (no vale `export *`).
export type { OverlayOptions, Sharp, Metadata, ResizeOptions } from "sharp";
export default sharp;
