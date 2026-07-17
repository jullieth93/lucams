import { describe, expect, it } from "vitest";
import {
  calendarMonthGrid,
  monthNameEs,
  MONTH_NAMES_ES,
  WEEKDAY_HEADERS_ES,
} from "./calendar-grid";

describe("calendarMonthGrid", () => {
  it("enero 2027 empieza en viernes (2 blancos: Dom, Lun, Mar, Mié, Jue)", () => {
    // 1 ene 2027 = viernes → weekday 5 → 5 celdas null antes del 1.
    const g = calendarMonthGrid(2027, 0);
    expect(g[0].slice(0, 5)).toEqual([null, null, null, null, null]);
    expect(g[0][5]).toBe(1); // viernes 1
    expect(g[0][6]).toBe(2); // sábado 2
  });

  it("todas las semanas tienen 7 celdas", () => {
    for (let m = 0; m < 12; m++) {
      for (const week of calendarMonthGrid(2027, m)) {
        expect(week).toHaveLength(7);
      }
    }
  });

  it("cubre exactamente los días del mes, sin repetir ni faltar", () => {
    const g = calendarMonthGrid(2027, 1); // febrero 2027 (no bisiesto → 28)
    const days = g.flat().filter((d): d is number => d !== null);
    expect(days).toEqual(Array.from({ length: 28 }, (_, i) => i + 1));
  });

  it("febrero bisiesto (2028) tiene 29 días", () => {
    const days = calendarMonthGrid(2028, 1)
      .flat()
      .filter((d) => d !== null);
    expect(days).toHaveLength(29);
    expect(days[days.length - 1]).toBe(29);
  });

  it("primera celda no-nula es el día 1 y la última es el último día", () => {
    const g = calendarMonthGrid(2027, 11); // diciembre → 31 días
    const flat = g.flat();
    expect(flat.find((d) => d !== null)).toBe(1);
    expect([...flat].reverse().find((d) => d !== null)).toBe(31);
  });

  it("el relleno final completa la última semana con null", () => {
    const g = calendarMonthGrid(2027, 0);
    const last = g[g.length - 1];
    expect(last).toHaveLength(7);
    // enero 2027 termina sábado 31 → última semana llena o con nulls al final
    const nonNull = last.filter((d) => d !== null);
    expect(nonNull[nonNull.length - 1]).toBe(31);
  });
});

describe("nombres", () => {
  it("12 meses en español, Enero..Diciembre", () => {
    expect(MONTH_NAMES_ES).toHaveLength(12);
    expect(monthNameEs(0)).toBe("Enero");
    expect(monthNameEs(11)).toBe("Diciembre");
    expect(monthNameEs(99)).toBe("");
  });

  it("7 encabezados de día empezando en Domingo", () => {
    expect(WEEKDAY_HEADERS_ES).toEqual(["D", "L", "M", "M", "J", "V", "S"]);
  });
});
