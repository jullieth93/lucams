/*
 * Fuente ÚNICA de la lista de medios de pago online (Wompi) que se muestra al cliente.
 *
 * Validado contra la API pública de Wompi (GET /v1/merchants/{public_key}, 2026-07-19): la
 * cuenta soporta Tarjeta, PSE, Nequi, Daviplata y Bancolombia (transferencia/QR). La contraentrega
 * es aparte (Aveonline), no va en esta lista.
 *
 * #31 (audit v3) — antes /ayuda listaba Daviplata pero el checkout y la home no → lista
 * inconsistente. Este módulo evita el drift: todas las superficies importan de acá.
 *
 * NOTA: la disponibilidad final en PRODUCCIÓN depende de lo que el comercio active en su contrato
 * Wompi (algunos métodos se habilitan aparte). Ajustar aquí si Wompi confirma un set distinto.
 */

/** Lista corta con separador " · " para chips/tarjetas de método. */
export const WOMPI_METHODS_SHORT = "Tarjeta · PSE · Nequi · Daviplata · Bancolombia";

/** Lista en prosa (minúscula, con "y" final) para frases de copy. */
export const WOMPI_METHODS_PROSE = "tarjeta, PSE, Nequi, Daviplata y Bancolombia";
