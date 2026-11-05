/*
 * Motor puro de SLA legal y días hábiles colombianos (`Fase 10 · S21`).
 *
 * Opera íntegramente en reloj de pared de Colombia (`UTC-5`, sin horario de verano)
 * para que un despliegue serverless en UTC jamás recorte 5 horas de un plazo legal.
 *
 * Calendario oficial colombiano contemplado:
 *  1. Festivos de fecha fija: 1 ene, 1 may, 20 jul, 7 ago, 8 dic, 25 dic.
 *  2. Festivos móviles de Semana Santa (algoritmo gregoriano de Meeus/Jones/Butcher):
 *     Jueves Santo (-3d), Viernes Santo (-2d), Ascensión (+43d lunes),
 *     Corpus Christi (+64d lunes), Sagrado Corazón (+71d lunes).
 *  3. Festivos trasladados al lunes siguiente por Ley 51 de 1983 (Ley Emiliani):
 *     6 ene (Reyes), 19 mar (San José), 29 jun (San Pedro y San Pablo),
 *     15 ago (Asunción), 12 oct (Día de la Raza), 1 nov (Todos los Santos),
 *     11 nov (Independencia de Cartagena).
 *
 * Plazos legales conectados desde `@/lib/consumer-law`:
 *  - PQR / Reclamos / Garantías: 15 días hábiles (Ley 1480 art. 58 / Ley 1581 art. 15).
 *  - Consultas Hábeas Data: 10 días hábiles (Ley 1581 art. 14).
 *  - Reembolso de retracto: 15 días calendario (Ley 2439 de 2024).
 */

import {
  HABEAS_DATA_CLAIM_BUSINESS_DAYS,
  HABEAS_DATA_CONSULTATION_BUSINESS_DAYS,
  RETRACT_REFUND_MAX_CALENDAR_DAYS,
  WARRANTY_CLAIM_RESPONSE_BUSINESS_DAYS,
} from "./consumer-law";

const COT_OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type SlaSemaphoreState = "MET" | "ON_TIME" | "DUE_SOON" | "OVERDUE" | "UNSET";

export interface SlaEvaluation {
  state: SlaSemaphoreState;
  hoursRemaining: number | null;
  label: string;
  badgeTone: "emerald" | "turquoise" | "amber" | "rose" | "slate";
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function formatYmdUtc(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** Calcula Domingo de Pascua gregoriano (UTC midnight) para `year`. */
function computeEasterSundayUtc(year: number): Date {
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
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=Mar, 4=Apr
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

/** Si `dateUtc` no cae en lunes (`getUTCDay() === 1`), lo traslada al lunes siguiente (Ley Emiliani). */
function shiftToNextMondayUtc(dateUtc: Date): Date {
  const dow = dateUtc.getUTCDay(); // 0=Dom, 1=Lun, ..., 6=Sáb
  if (dow === 1) return dateUtc;
  const daysToAdd = dow === 0 ? 1 : 8 - dow;
  return new Date(dateUtc.getTime() + daysToAdd * DAY_MS);
}

const holidayCacheByYear = new Map<number, ReadonlySet<string>>();

/** Devuelve el conjunto `YYYY-MM-DD` de festivos oficiales colombianos para `year`. */
export function getColombianHolidaysForYear(year: number): ReadonlySet<string> {
  const cached = holidayCacheByYear.get(year);
  if (cached) return cached;

  const set = new Set<string>();

  // 1. Fijos inamovibles
  const fixed: ReadonlyArray<[number, number]> = [
    [1, 1], // Año Nuevo
    [5, 1], // Día del Trabajo
    [7, 20], // Independencia de Colombia
    [8, 7], // Batalla de Boyacá
    [12, 8], // Inmaculada Concepción
    [12, 25], // Navidad
  ];
  for (const [month, day] of fixed) {
    set.add(formatYmdUtc(new Date(Date.UTC(year, month - 1, day))));
  }

  // 2. Trasladables por Ley Emiliani
  const emiliani: ReadonlyArray<[number, number]> = [
    [1, 6], // Epifanía / Reyes Magos
    [3, 19], // San José
    [6, 29], // San Pedro y San Pablo
    [8, 15], // Asunción de la Virgen
    [10, 12], // Día de la Raza
    [11, 1], // Todos los Santos
    [11, 11], // Independencia de Cartagena
  ];
  for (const [month, day] of emiliani) {
    const shifted = shiftToNextMondayUtc(new Date(Date.UTC(year, month - 1, day)));
    set.add(formatYmdUtc(shifted));
  }

  // 3. Relativos a Pascua
  const easter = computeEasterSundayUtc(year);
  const easterOffsets = [
    -3, // Jueves Santo
    -2, // Viernes Santo
    43, // Ascensión del Señor (lunes)
    64, // Corpus Christi (lunes)
    71, // Sagrado Corazón de Jesús (lunes)
  ];
  for (const offsetDays of easterOffsets) {
    set.add(formatYmdUtc(new Date(easter.getTime() + offsetDays * DAY_MS)));
  }

  holidayCacheByYear.set(year, set);
  return set;
}

/** Determina si el instante `date` cae en día hábil en Colombia (Lun–Vie y no festivo CO). */
export function isColombianBusinessDay(date: Date): boolean {
  const cotWall = new Date(date.getTime() - COT_OFFSET_MS);
  const dow = cotWall.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  const ymd = formatYmdUtc(cotWall);
  const holidays = getColombianHolidaysForYear(cotWall.getUTCFullYear());
  return !holidays.has(ymd);
}

/**
 * Avanza `businessDays` días hábiles colombianos desde `from` y sella el vencimiento
 * a las `23:59:59.999` hora Colombia (`UTC-5`) del último día hábil.
 */
export function addColombianBusinessDaysEndOfDay(from: Date, businessDays: number): Date {
  const targetDays = Math.max(0, Math.trunc(businessDays));
  const cotWall = new Date(from.getTime() - COT_OFFSET_MS);
  let added = 0;

  while (added < targetDays) {
    cotWall.setUTCDate(cotWall.getUTCDate() + 1);
    const dow = cotWall.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    const holidays = getColombianHolidaysForYear(cotWall.getUTCFullYear());
    if (holidays.has(formatYmdUtc(cotWall))) continue;
    added += 1;
  }

  cotWall.setUTCHours(23, 59, 59, 999);
  return new Date(cotWall.getTime() + COT_OFFSET_MS);
}

/**
 * Avanza `calendarDays` días calendario en Colombia y sella a las `23:59:59.999` COT.
 */
export function addColombianCalendarDaysEndOfDay(from: Date, calendarDays: number): Date {
  const targetDays = Math.max(0, Math.trunc(calendarDays));
  const cotWall = new Date(from.getTime() - COT_OFFSET_MS);
  cotWall.setUTCDate(cotWall.getUTCDate() + targetDays);
  cotWall.setUTCHours(23, 59, 59, 999);
  return new Date(cotWall.getTime() + COT_OFFSET_MS);
}

/** SLA legal para tickets de soporte / PQR (15 días hábiles; 10 días hábiles si es consulta Hábeas Data). */
export function computeSupportTicketSlaDueAt(createdAt: Date, subject?: string | null): Date {
  const normalizedSubject = (subject ?? "").trim().toUpperCase();
  const businessDays =
    normalizedSubject === "DATOS_PERSONALES" || normalizedSubject === "HABEAS_DATA_CONSULTA"
      ? HABEAS_DATA_CONSULTATION_BUSINESS_DAYS
      : HABEAS_DATA_CLAIM_BUSINESS_DAYS;
  return addColombianBusinessDaysEndOfDay(createdAt, businessDays);
}

/** SLA legal de respuesta y diagnóstico de garantía (15 días hábiles, Ley 1480 art. 58). */
export function computeWarrantySlaDueAt(requestedAt: Date): Date {
  return addColombianBusinessDaysEndOfDay(requestedAt, WARRANTY_CLAIM_RESPONSE_BUSINESS_DAYS);
}

/** SLA legal máximo de reembolso por retracto (15 días calendario, Ley 2439 de 2024). */
export function computeRetractSlaDueAt(anchorAt: Date): Date {
  return addColombianCalendarDaysEndOfDay(anchorAt, RETRACT_REFUND_MAX_CALENDAR_DAYS);
}

/**
 * Evalúa el semáforo operativo de un caso frente a su `slaDueAt`:
 *  - `MET`: caso cerrado/resuelto.
 *  - `OVERDUE`: plazo vencido (`now > slaDueAt`).
 *  - `DUE_SOON`: quedan <= `dueSoonHours` (default 48h).
 *  - `ON_TIME`: dentro del término legal con holgura.
 */
export function evaluateSlaStatus(
  slaDueAt: Date | null | undefined,
  opts?: {
    now?: Date;
    isClosed?: boolean;
    dueSoonHours?: number;
  },
): SlaEvaluation {
  if (opts?.isClosed) {
    return {
      state: "MET",
      hoursRemaining: null,
      label: "Atendido",
      badgeTone: "emerald",
    };
  }

  if (!slaDueAt) {
    return {
      state: "UNSET",
      hoursRemaining: null,
      label: "Sin SLA",
      badgeTone: "slate",
    };
  }

  const now = opts?.now ?? new Date();
  const dueSoonHours = opts?.dueSoonHours ?? 48;
  const diffMs = slaDueAt.getTime() - now.getTime();
  const hoursRemaining = Math.round(diffMs / (60 * 60 * 1000));

  if (diffMs < 0) {
    const overdueHours = Math.max(1, Math.abs(hoursRemaining));
    const overdueLabel =
      overdueHours >= 24
        ? `SLA vencido hace ${Math.round(overdueHours / 24)} d`
        : `SLA vencido hace ${overdueHours} h`;
    return {
      state: "OVERDUE",
      hoursRemaining,
      label: overdueLabel,
      badgeTone: "rose",
    };
  }

  if (diffMs <= dueSoonHours * 60 * 60 * 1000) {
    const leftHours = Math.max(1, hoursRemaining);
    return {
      state: "DUE_SOON",
      hoursRemaining,
      label: leftHours < 24 ? `Vence en ${leftHours} h` : `Vence en ${Math.ceil(leftHours / 24)} d`,
      badgeTone: "amber",
    };
  }

  const daysLeft = Math.ceil(diffMs / DAY_MS);
  return {
    state: "ON_TIME",
    hoursRemaining,
    label: `${daysLeft} d para vencer`,
    badgeTone: "turquoise",
  };
}
