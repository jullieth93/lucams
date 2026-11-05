/*
 * Tests de lib/datetime.ts — la invariante que se certifica acá es la del bug
 * LCM-2026-0004: un instante UTC DEBE renderizarse en hora de Colombia (UTC-5)
 * sin importar la zona horaria del servidor que ejecuta el render (Vercel = UTC).
 */

import { describe, expect, it } from "vitest";
import {
  formatDateCO,
  formatDateLongCO,
  formatDateTimeCO,
  formatDateTimeLongCO,
  formatDateTimeNoYearCO,
  formatDayMonthCO,
  formatIsoDateCO,
  formatMonthYearCO,
  formatTimeCO,
} from "./datetime";

// 2026-11-04 01:22:00 UTC === 2026-11-03 8:22 p. m. en Bogotá (el pedido real del bug).
const ORDER_INSTANT_UTC = new Date("2026-11-04T01:22:00.000Z");

describe("datetime (hora Colombia fija)", () => {
  it("un instante UTC de madrugada muestra el DÍA ANTERIOR en Bogotá (bug LCM-2026-0004)", () => {
    expect(formatDateCO(ORDER_INSTANT_UTC)).toContain("3");
    expect(formatDateCO(ORDER_INSTANT_UTC)).toContain("2026");
    expect(formatDateCO(ORDER_INSTANT_UTC)).not.toContain("04 nov");
  });

  it("fecha+hora corta muestra 8:22 p. m. del 3 de noviembre", () => {
    const out = formatDateTimeCO(ORDER_INSTANT_UTC);
    expect(out).toContain("nov");
    expect(out).toContain("2026");
    expect(out).toMatch(/8:22\s*p\.\s*m\./i);
  });

  it("acepta Date, string ISO y epoch ms indistintamente", () => {
    const iso = "2026-11-04T01:22:00.000Z";
    const ms = ORDER_INSTANT_UTC.getTime();
    expect(formatDateCO(iso)).toBe(formatDateCO(ORDER_INSTANT_UTC));
    expect(formatDateCO(ms)).toBe(formatDateCO(ORDER_INSTANT_UTC));
  });

  it("fecha larga con y sin hora", () => {
    expect(formatDateLongCO(ORDER_INSTANT_UTC)).toContain("3 de noviembre de 2026");
    const longDt = formatDateTimeLongCO(ORDER_INSTANT_UTC);
    expect(longDt).toContain("3 de noviembre de 2026");
    expect(longDt).toMatch(/8:22\s*p\.\s*m\./i);
  });

  it("variantes compactas: sin año, día-mes, mes-año y solo hora", () => {
    const noYear = formatDateTimeNoYearCO(ORDER_INSTANT_UTC);
    expect(noYear).toContain("nov");
    expect(noYear).not.toContain("2026");
    expect(formatDayMonthCO(ORDER_INSTANT_UTC)).toContain("3");
    expect(formatMonthYearCO(ORDER_INSTANT_UTC)).toContain("noviembre de 2026");
    expect(formatTimeCO(ORDER_INSTANT_UTC)).toMatch(/8:22\s*p\.\s*m\./i);
  });

  it("formatIsoDateCO devuelve la fecha CIVIL de Bogotá (no la UTC)", () => {
    expect(formatIsoDateCO(ORDER_INSTANT_UTC)).toBe("2026-11-03");
    // Un instante al mediodía UTC sigue siendo el mismo día en Bogotá.
    expect(formatIsoDateCO("2026-11-04T12:00:00.000Z")).toBe("2026-11-04");
  });

  it("el borde de medianoche Bogotá se respeta en ambos sentidos", () => {
    // 04:59:59 UTC = 11:59:59 p. m. del día anterior en Bogotá.
    expect(formatIsoDateCO("2026-11-04T04:59:59.000Z")).toBe("2026-11-03");
    // 05:00:00 UTC = medianoche exacta en Bogotá → ya es el día nuevo.
    expect(formatIsoDateCO("2026-11-04T05:00:00.000Z")).toBe("2026-11-04");
  });
});
