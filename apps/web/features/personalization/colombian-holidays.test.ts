/*
 * Festivos de Colombia — verificación del cómputo de Pascua (computus gregoriano) y de los traslados
 * de la Ley Emiliani contra fechas conocidas.
 */

import { describe, it, expect } from "vitest";
import { computeEaster, colombianHolidays, holidaysForMonth } from "./colombian-holidays";

/** Día de la semana UTC (0=domingo … 1=lunes). */
function utcDow(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month, day)).getUTCDay();
}

describe("computeEaster — domingo de Resurrección (fechas conocidas)", () => {
  const known: Record<number, [number, number]> = {
    2024: [2, 31], // 31 marzo 2024
    2025: [3, 20], // 20 abril 2025
    2026: [3, 5], // 5 abril 2026
    2027: [2, 28], // 28 marzo 2027
  };
  for (const [year, [month, day]] of Object.entries(known)) {
    it(`${year} → ${day}/${month + 1}`, () => {
      expect(computeEaster(Number(year))).toEqual({ month, day });
    });
  }
});

describe("colombianHolidays", () => {
  it("son 19 festivos oficiales (18 + Virgen de Chiquinquirá, Ley 2578 de 2026)", () => {
    expect(colombianHolidays(2026)).toHaveLength(19);
    expect(colombianHolidays(2027)).toHaveLength(19);
  });

  it("los de fecha FIJA no se trasladan", () => {
    const h = colombianHolidays(2026);
    const has = (month: number, day: number, name: string) =>
      expect(h.some((x) => x.month === month && x.day === day && x.name === name)).toBe(true);
    has(0, 1, "Año Nuevo");
    has(4, 1, "Día del Trabajo");
    has(6, 20, "Día de la Independencia");
    has(7, 7, "Batalla de Boyacá");
    has(11, 8, "Inmaculada Concepción");
    has(11, 25, "Navidad");
  });

  it("Reyes Magos 2026 (6 ene = martes) se traslada al lunes 12 de enero", () => {
    const reyes = colombianHolidays(2026).find((x) => x.name === "Reyes Magos")!;
    expect(reyes).toMatchObject({ month: 0, day: 12 });
    expect(utcDow(2026, reyes.month, reyes.day)).toBe(1); // lunes
  });

  it("Virgen de Chiquinquirá (9 jul, Ley 2578 de 2026) se traslada por Emiliani", () => {
    // 2026: 9 jul = jueves → descanso el lunes 13 de julio (fecha real celebrada).
    const h2026 = colombianHolidays(2026).find((x) => x.name === "Virgen de Chiquinquirá")!;
    expect(h2026).toMatchObject({ month: 6, day: 13 });
    expect(utcDow(2026, h2026.month, h2026.day)).toBe(1);
    // 2027: 9 jul = viernes → lunes 12 de julio.
    const h2027 = colombianHolidays(2027).find((x) => x.name === "Virgen de Chiquinquirá")!;
    expect(h2027).toMatchObject({ month: 6, day: 12 });
    expect(utcDow(2027, h2027.month, h2027.day)).toBe(1);
  });

  it("Jueves y Viernes Santo 2026 NO se trasladan (Pascua 5 abr → 2 y 3 abr)", () => {
    const h = colombianHolidays(2026);
    expect(h.find((x) => x.name === "Jueves Santo")).toMatchObject({ month: 3, day: 2 });
    expect(h.find((x) => x.name === "Viernes Santo")).toMatchObject({ month: 3, day: 3 });
  });

  it("Ascensión/Corpus/Sagrado Corazón caen en lunes (Emiliani)", () => {
    const h = colombianHolidays(2026);
    for (const name of ["Ascensión del Señor", "Corpus Christi", "Sagrado Corazón"]) {
      const f = h.find((x) => x.name === name)!;
      expect(utcDow(2026, f.month, f.day), name).toBe(1);
    }
  });

  it("TODOS los trasladables por Emiliani caen en lunes en varios años", () => {
    const emiliani = new Set([
      "Reyes Magos",
      "Día de San José",
      "San Pedro y San Pablo",
      "Virgen de Chiquinquirá",
      "Asunción de la Virgen",
      "Día de la Raza",
      "Día de Todos los Santos",
      "Independencia de Cartagena",
      "Ascensión del Señor",
      "Corpus Christi",
      "Sagrado Corazón",
    ]);
    for (const year of [2025, 2026, 2027, 2028]) {
      for (const h of colombianHolidays(year)) {
        if (emiliani.has(h.name)) {
          expect(utcDow(year, h.month, h.day), `${h.name} ${year}`).toBe(1);
        }
      }
    }
  });

  it("holidaysForMonth filtra por mes (enero 2026 = Año Nuevo + Reyes)", () => {
    const ene = holidaysForMonth(2026, 0);
    expect(ene.map((h) => h.name).sort()).toEqual(["Año Nuevo", "Reyes Magos"]);
  });

  it("holidaysForMonth julio 2026 = Chiquinquirá (13) + Independencia (20)", () => {
    const jul = holidaysForMonth(2026, 6);
    expect(jul.map((h) => `${h.day} ${h.name}`)).toEqual([
      "13 Virgen de Chiquinquirá",
      "20 Día de la Independencia",
    ]);
  });
});
