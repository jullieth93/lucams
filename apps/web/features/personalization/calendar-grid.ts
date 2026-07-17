/*
 * Grilla de días de un mes — lógica PURA para el calendario (ADR-063 CAL1).
 *
 * El calendario magnético mes-a-mes (CALENDAR_PHOTO_MONTH) debe HORNEAR, alrededor de la foto del
 * cliente, el nombre del mes + año + la grilla de días real. Este módulo calcula la grilla; el
 * compositor (calendar-render.ts) la dibuja. Sin dependencias → 100% testeable y determinista.
 *
 * Semana inicia en DOMINGO (convención de calendarios de pared colombianos). El cálculo de día de
 * semana con `new Date(año, mes, día)` es timezone-safe: pedimos el weekday LOCAL de una fecha
 * construida con componentes locales, que es invariante entre zonas horarias.
 */

export const MONTH_NAMES_ES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

// Encabezados de la semana empezando en Domingo.
export const WEEKDAY_HEADERS_ES = ["D", "L", "M", "M", "J", "V", "S"] as const;

/** Nombre del mes en español para un índice 0-11 (0 = Enero). Cae a "" fuera de rango. */
export function monthNameEs(monthIndex0: number): string {
  return MONTH_NAMES_ES[monthIndex0] ?? "";
}

/**
 * Devuelve la grilla del mes como semanas (filas) de 7 celdas. Cada celda es el número de día o
 * null (relleno antes del día 1 o después del último). Semana inicia en Domingo.
 *
 * @param year  año de 4 dígitos (ej. 2027)
 * @param monthIndex0  0 = Enero … 11 = Diciembre
 */
export function calendarMonthGrid(year: number, monthIndex0: number): (number | null)[][] {
  const firstWeekday = new Date(year, monthIndex0, 1).getDay(); // 0=Dom … 6=Sáb
  const daysInMonth = new Date(year, monthIndex0 + 1, 0).getDate(); // día 0 del mes+1 = último del mes
  const weeks: (number | null)[][] = [];
  let week: (number | null)[] = new Array(firstWeekday).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    week.push(d);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }
  return weeks;
}
