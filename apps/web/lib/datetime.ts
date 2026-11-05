/*
 * Utilidades de fecha/hora — SIEMPRE en hora de Colombia (`America/Bogota`, UTC-5).
 *
 * Por qué existe (bug PRD 2026-11-03, pedido LCM-2026-0004): las páginas creaban
 * `Intl.DateTimeFormat("es-CO", …)` SIN `timeZone`, así que en Vercel (servidor en UTC)
 * las fechas renderizaban en UTC — una compra del 3-nov 8:22 p.m. COT aparecía como
 * "4 de noviembre 01:22 a.m.". Toda fecha visible para humanos (admin y tienda) sale
 * de estos helpers; está prohibido crear `Intl.DateTimeFormat` ad hoc en `app/` o
 * `components/` (lo gatea `datetime-convention.test.ts`).
 *
 * Los formatters se instancian UNA vez a nivel de módulo (Intl.DateTimeFormat es
 * costoso de construir y es inmutable/seguro de compartir).
 *
 * Zona fija a propósito (no la del navegador): el negocio, el equipo y la operación
 * legal (retractos, PQR, SLA) son colombianos; que admin y cliente vean la MISMA hora
 * evita confusiones de soporte ("lo pedí ayer" vs "el sistema dice hoy").
 */

export const COLOMBIA_TIME_ZONE = "America/Bogota";

type DateInput = Date | string | number;

function toDate(d: DateInput): Date {
  return d instanceof Date ? d : new Date(d);
}

/** `04 nov 2026` — fecha corta, sin hora. */
const DATE_SHORT = new Intl.DateTimeFormat("es-CO", {
  timeZone: COLOMBIA_TIME_ZONE,
  day: "2-digit",
  month: "short",
  year: "numeric",
});

/** `4 de noviembre de 2026` — fecha larga, sin hora. */
const DATE_LONG = new Intl.DateTimeFormat("es-CO", {
  timeZone: COLOMBIA_TIME_ZONE,
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** `04 nov 2026, 8:22 p. m.` — fecha corta con hora. */
const DATE_TIME_SHORT = new Intl.DateTimeFormat("es-CO", {
  timeZone: COLOMBIA_TIME_ZONE,
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** `4 de noviembre de 2026, 8:22 p. m.` — fecha larga con hora. */
const DATE_TIME_LONG = new Intl.DateTimeFormat("es-CO", {
  timeZone: COLOMBIA_TIME_ZONE,
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** `04 nov, 8:22 p. m.` — fecha+hora sin año (logs/eventos recientes del año en curso). */
const DATE_TIME_NO_YEAR = new Intl.DateTimeFormat("es-CO", {
  timeZone: COLOMBIA_TIME_ZONE,
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** `noviembre de 2026` — cohortes y agrupaciones mensuales. */
const MONTH_YEAR = new Intl.DateTimeFormat("es-CO", {
  timeZone: COLOMBIA_TIME_ZONE,
  month: "long",
  year: "numeric",
});

/** `4 nov` — día y mes compactos (chips de cupones, badges). */
const DAY_MONTH = new Intl.DateTimeFormat("es-CO", {
  timeZone: COLOMBIA_TIME_ZONE,
  day: "numeric",
  month: "short",
});

/** `8:22 p. m.` — solo hora (eventos de hoy). */
const TIME_ONLY = new Intl.DateTimeFormat("es-CO", {
  timeZone: COLOMBIA_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
});

/** `2026-11-03` — ISO YYYY-MM-DD en Bogotá (valores de <input type="date">, llaves). */
const ISO_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: COLOMBIA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function formatDateCO(d: DateInput): string {
  return DATE_SHORT.format(toDate(d));
}

export function formatDateLongCO(d: DateInput): string {
  return DATE_LONG.format(toDate(d));
}

export function formatDateTimeCO(d: DateInput): string {
  return DATE_TIME_SHORT.format(toDate(d));
}

export function formatDateTimeLongCO(d: DateInput): string {
  return DATE_TIME_LONG.format(toDate(d));
}

export function formatDateTimeNoYearCO(d: DateInput): string {
  return DATE_TIME_NO_YEAR.format(toDate(d));
}

export function formatMonthYearCO(d: DateInput): string {
  return MONTH_YEAR.format(toDate(d));
}

export function formatDayMonthCO(d: DateInput): string {
  return DAY_MONTH.format(toDate(d));
}

export function formatTimeCO(d: DateInput): string {
  return TIME_ONLY.format(toDate(d));
}

/** ISO `YYYY-MM-DD` en hora Colombia — para inputs de fecha y llaves de agregación. */
export function formatIsoDateCO(d: DateInput): string {
  return ISO_DATE.format(toDate(d));
}
