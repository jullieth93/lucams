import { describe, expect, it } from "vitest";
import { addMonthsClampedIsoCO } from "./datetime";

describe("addMonthsClampedIsoCO", () => {
  it.each([
    ["2026-02-01T02:00:00.000Z", 1, "2026-02-28"],
    ["2024-02-01T02:00:00.000Z", 1, "2024-02-29"],
    ["2026-05-01T02:00:00.000Z", 1, "2026-05-30"],
    ["2026-12-01T02:00:00.000Z", 1, "2026-12-30"],
    ["2027-01-01T02:00:00.000Z", 1, "2027-01-31"],
  ])(
    "conserva el calendario Bogotá y limita el día al fin de mes real",
    (instant, months, expected) => {
      expect(addMonthsClampedIsoCO(new Date(instant), months)).toBe(expected);
    },
  );

  it("usa la fecha civil Bogotá antes de sumar meses", () => {
    expect(addMonthsClampedIsoCO(new Date("2026-03-01T04:59:59.999Z"), 1)).toBe("2026-03-28");
    expect(addMonthsClampedIsoCO(new Date("2026-03-01T05:00:00.000Z"), 1)).toBe("2026-04-01");
  });

  it("rechaza cantidades fraccionarias e instantes inválidos", () => {
    expect(() => addMonthsClampedIsoCO(new Date("2026-01-01"), 1.5)).toThrow(RangeError);
    expect(() => addMonthsClampedIsoCO(new Date("invalid"), 1)).toThrow(RangeError);
  });
});
