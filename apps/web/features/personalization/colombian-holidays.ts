/*
 * Festivos de Colombia — cálculo determinista por año (feedback Lucy 2026-07-18: los calendarios
 * "uno los busca con festivos").
 *
 * Fuente de las reglas: Ley 51 de 1983 ("Ley Emiliani") — traslada varios festivos al LUNES
 * siguiente cuando no caen en lunes. Los festivos relativos a la Pascua se derivan del cómputo
 * gregoriano del Domingo de Resurrección (algoritmo anónimo gregoriano / Meeus). Verificado contra
 * fechas conocidas en colombian-holidays.test.ts.
 *
 * Son 18 festivos oficiales al año:
 *   - 6 de fecha FIJA (no se trasladan): Año Nuevo, Trabajo, Independencia, Boyacá, Inmaculada, Navidad.
 *   - 7 trasladables por Emiliani (al lunes siguiente si no caen en lunes): Reyes, San José, San Pedro
 *     y San Pablo, Asunción, Día de la Raza, Todos los Santos, Independencia de Cartagena.
 *   - 5 relativos a Pascua: Jueves y Viernes Santo (NO se trasladan) + Ascensión, Corpus Christi y
 *     Sagrado Corazón (trasladados al lunes por Emiliani).
 */

export type Holiday = {
  /** Mes 0-11. */
  month: number;
  /** Día del mes (1-31), ya con el traslado de Emiliani aplicado. */
  day: number;
  /** Nombre completo del festivo. */
  name: string;
  /** Etiqueta corta para pintar en el calendario (cabe en poco espacio). */
  short: string;
};

/** Domingo de Resurrección (Pascua) para un año gregoriano. Devuelve {month:0-11, day}. */
export function computeEaster(year: number): { month: number; day: number } {
  // Algoritmo anónimo gregoriano (Meeus/Jones/Butcher).
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=marzo, 4=abril
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month: month - 1, day }; // a 0-index
}

/** UTC para evitar corrimientos por zona horaria; solo usamos aritmética de fechas/día-de-semana. */
function utc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

/** Traslada al LUNES siguiente si la fecha NO cae en lunes (Ley Emiliani). Lunes se queda igual. */
function toNextMonday(date: Date): Date {
  const dow = date.getUTCDay(); // 0=domingo … 1=lunes … 6=sábado
  const add = (8 - dow) % 7; // lunes→0, martes→6, … domingo→1
  return new Date(date.getTime() + add * 86_400_000);
}

/** Suma días a una fecha (UTC). */
function addDays(date: Date, n: number): Date {
  return new Date(date.getTime() + n * 86_400_000);
}

/**
 * Todos los festivos oficiales de Colombia para `year`, ordenados por fecha. Cada uno con la fecha
 * YA trasladada (Emiliani) lista para pintar.
 */
export function colombianHolidays(year: number): Holiday[] {
  const easter = utc(year, computeEaster(year).month, computeEaster(year).day);

  const raw: Array<{ date: Date; name: string; short: string; movable: boolean }> = [
    // Fecha fija (no se trasladan).
    { date: utc(year, 0, 1), name: "Año Nuevo", short: "Año Nuevo", movable: false },
    { date: utc(year, 4, 1), name: "Día del Trabajo", short: "Trabajo", movable: false },
    {
      date: utc(year, 6, 20),
      name: "Día de la Independencia",
      short: "Independencia",
      movable: false,
    },
    { date: utc(year, 7, 7), name: "Batalla de Boyacá", short: "Boyacá", movable: false },
    { date: utc(year, 11, 8), name: "Inmaculada Concepción", short: "Inmaculada", movable: false },
    { date: utc(year, 11, 25), name: "Navidad", short: "Navidad", movable: false },

    // Trasladables por Emiliani (al lunes siguiente).
    { date: utc(year, 0, 6), name: "Reyes Magos", short: "Reyes", movable: true },
    { date: utc(year, 2, 19), name: "Día de San José", short: "San José", movable: true },
    { date: utc(year, 5, 29), name: "San Pedro y San Pablo", short: "San Pedro", movable: true },
    { date: utc(year, 7, 15), name: "Asunción de la Virgen", short: "Asunción", movable: true },
    { date: utc(year, 9, 12), name: "Día de la Raza", short: "Raza", movable: true },
    {
      date: utc(year, 10, 1),
      name: "Día de Todos los Santos",
      short: "Todos los Santos",
      movable: true,
    },
    {
      date: utc(year, 10, 11),
      name: "Independencia de Cartagena",
      short: "Cartagena",
      movable: true,
    },

    // Relativos a Pascua. Jueves/Viernes Santo NO se trasladan; los otros 3 sí (Emiliani).
    { date: addDays(easter, -3), name: "Jueves Santo", short: "J. Santo", movable: false },
    { date: addDays(easter, -2), name: "Viernes Santo", short: "V. Santo", movable: false },
    { date: addDays(easter, 43), name: "Ascensión del Señor", short: "Ascensión", movable: true },
    { date: addDays(easter, 64), name: "Corpus Christi", short: "Corpus", movable: true },
    { date: addDays(easter, 71), name: "Sagrado Corazón", short: "S. Corazón", movable: true },
  ];

  return raw
    .map(({ date, name, short, movable }) => {
      const final = movable ? toNextMonday(date) : date;
      return { month: final.getUTCMonth(), day: final.getUTCDate(), name, short };
    })
    .sort((x, y) => x.month - y.month || x.day - y.day);
}

/** Festivos de un mes concreto (year, month 0-11), ordenados por día. */
export function holidaysForMonth(year: number, month: number): Holiday[] {
  return colombianHolidays(year).filter((h) => h.month === month);
}
