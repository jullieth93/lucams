/*
 * Unit tests del núcleo puro de retracto (Bloque F3). Sin DB.
 *
 * La ventana se calcula en hora Colombia (COT, UTC-5 fijo), NO en la del servidor.
 * Los tests usan instantes UTC explícitos y verifican en semántica COT para ser
 * independientes de la zona horaria del runner.
 */

import { describe, it, expect } from "vitest";
import {
  addBusinessDays,
  retractWindowEnd,
  isWithinRetractWindow,
  isItemPersonalized,
  RETRACT_WINDOW_BUSINESS_DAYS,
} from "./service";

const COT = 5 * 60 * 60 * 1000;
/** Partes de fecha en hora Colombia. */
function cot(d: Date) {
  const c = new Date(d.getTime() - COT);
  return {
    date: c.getUTCDate(),
    month: c.getUTCMonth(),
    day: c.getUTCDay(),
    hours: c.getUTCHours(),
  };
}

// Lunes 2024-01-01, 10:00 COT (= 15:00 UTC). 2024-01-01 es lunes.
const MON = new Date(Date.UTC(2024, 0, 1, 15, 0));
// Viernes 2024-01-05, 10:00 COT.
const FRI = new Date(Date.UTC(2024, 0, 5, 15, 0));

describe("addBusinessDays (hora Colombia)", () => {
  it("5 días hábiles desde lunes → lunes siguiente (en COT)", () => {
    const r = cot(addBusinessDays(MON, 5));
    expect(r.date).toBe(8); // 2024-01-08
    expect(r.day).toBe(1); // lunes
  });

  it("salta el fin de semana (viernes + 1 → lunes, en COT)", () => {
    const r = cot(addBusinessDays(FRI, 1));
    expect(r.date).toBe(8);
    expect(r.day).toBe(1);
  });

  it("la ventana por defecto son 5 días hábiles", () => {
    expect(RETRACT_WINDOW_BUSINESS_DAYS).toBe(5);
  });
});

describe("isWithinRetractWindow (hora Colombia)", () => {
  it("dentro el mismo día de entrega", () => {
    expect(isWithinRetractWindow(MON, new Date(Date.UTC(2024, 0, 1, 17, 0)))).toBe(true);
  });

  it("dentro en la noche del último día hábil (lunes 23:00 COT)", () => {
    // Lunes 2024-01-08 23:00 COT = 2024-01-09 04:00 UTC.
    expect(isWithinRetractWindow(MON, new Date(Date.UTC(2024, 0, 9, 4, 0)))).toBe(true);
  });

  it("fuera pasado el cierre (martes 00:30 COT)", () => {
    // 2024-01-09 00:30 COT = 05:30 UTC — ya venció (cerró a las 23:59:59 del día 8 COT).
    expect(isWithinRetractWindow(MON, new Date(Date.UTC(2024, 0, 9, 5, 30)))).toBe(false);
  });

  it("retractWindowEnd cae a las 23:xx COT del último día hábil", () => {
    const end = cot(retractWindowEnd(MON));
    expect(end.date).toBe(8);
    expect(end.hours).toBe(23);
  });
});

describe("isItemPersonalized", () => {
  it("con customDesign → personalizado (exceptuado)", () => {
    expect(isItemPersonalized({ customDesign: { layers: [] }, designId: null })).toBe(true);
  });
  it("con designId → personalizado", () => {
    expect(isItemPersonalized({ customDesign: null, designId: "d1" })).toBe(true);
  });
  it("item de catálogo estándar → NO personalizado (retracto aplica)", () => {
    expect(isItemPersonalized({ customDesign: null, designId: null })).toBe(false);
  });
});
