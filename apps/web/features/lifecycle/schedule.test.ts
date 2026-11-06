import { describe, expect, it } from "vitest";
import type { LifecycleJourney } from "@lucams/db";
import { nextAllowedAt, nextBogotaDay, startOfBogotaDay } from "./schedule";

function journey(quietStartHour: number, quietEndHour: number): LifecycleJourney {
  return { quietStartHour, quietEndHour } as LifecycleJourney;
}

describe("lifecycle schedule", () => {
  it("no cambia la fecha cuando está fuera del silencio", () => {
    const date = new Date("2026-11-06T17:00:00Z");
    expect(nextAllowedAt(date, journey(20, 8))).toEqual(date);
  });

  it("reprograma al final del silencio cuando cruza medianoche", () => {
    const date = new Date("2026-11-06T02:00:00Z");
    expect(nextAllowedAt(date, journey(20, 8)).toISOString()).toBe("2026-11-06T13:00:00.000Z");
  });

  it("respeta el silencio al reanudar el límite del siguiente día", () => {
    const date = new Date("2026-11-06T20:00:00Z");
    expect(nextAllowedAt(nextBogotaDay(date), journey(20, 8)).toISOString()).toBe(
      "2026-11-07T13:00:00.000Z",
    );
  });

  it("calcula el inicio y el siguiente día en Colombia", () => {
    const date = new Date("2026-11-06T02:30:00Z");
    expect(startOfBogotaDay(date).toISOString()).toBe("2026-11-05T05:00:00.000Z");
    expect(nextBogotaDay(date).toISOString()).toBe("2026-11-06T05:00:00.000Z");
  });
});
