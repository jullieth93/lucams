/*
 * Unit tests del núcleo puro de retracto (Bloque F3). Sin DB.
 * Ancla determinista: 2024-01-01 es LUNES.
 */

import { describe, it, expect } from "vitest";
import {
  addBusinessDays,
  retractWindowEnd,
  isWithinRetractWindow,
  isItemPersonalized,
  RETRACT_WINDOW_BUSINESS_DAYS,
} from "./service";

const MON = new Date(2024, 0, 1, 10); // Lunes 2024-01-01 10:00 local
const FRI = new Date(2024, 0, 5, 10); // Viernes 2024-01-05 10:00 local

describe("addBusinessDays", () => {
  it("5 días hábiles desde lunes → lunes siguiente", () => {
    const r = addBusinessDays(MON, 5);
    expect(r.getDate()).toBe(8); // 2024-01-08
    expect(r.getDay()).toBe(1); // lunes
  });

  it("salta el fin de semana (viernes + 1 → lunes)", () => {
    const r = addBusinessDays(FRI, 1);
    expect(r.getDate()).toBe(8);
    expect(r.getDay()).toBe(1);
  });

  it("la ventana por defecto son 5 días hábiles", () => {
    expect(RETRACT_WINDOW_BUSINESS_DAYS).toBe(5);
  });
});

describe("isWithinRetractWindow", () => {
  it("dentro de la ventana (mismo día de entrega)", () => {
    expect(isWithinRetractWindow(MON, new Date(2024, 0, 1, 12))).toBe(true);
  });

  it("dentro en el último día hábil (lunes siguiente por la noche)", () => {
    expect(isWithinRetractWindow(MON, new Date(2024, 0, 8, 23, 0))).toBe(true);
  });

  it("fuera al día siguiente del cierre de ventana", () => {
    expect(isWithinRetractWindow(MON, new Date(2024, 0, 9, 0, 1))).toBe(false);
  });

  it("retractWindowEnd cae a fin del último día hábil", () => {
    const end = retractWindowEnd(MON);
    expect(end.getDate()).toBe(8);
    expect(end.getHours()).toBe(23);
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
