/*
 * Tests de la regla única de la promesa "Envío Lucam's" (producción + hora
 * de corte — lib/delivery-estimate.ts). Matriz productionDays {0,1,2} × hora
 * {antes, después} del cutoff con `now` explícito (sin mocks de reloj).
 */

import { describe, expect, it } from "vitest";
import {
  bogotaHour,
  LUCAMS_DEFAULT_PRODUCTION_DAYS,
  lucamsDeliveryDays,
  maxProductionDaysOf,
} from "./delivery-estimate";

const CUTOFF = 12;
// 2026-09-29 14:00 UTC = 09:00 Bogotá < 12; 18:00 UTC = 13:00 Bogotá ≥ 12.
const BEFORE_CUTOFF = new Date("2026-09-29T14:00:00Z");
const AFTER_CUTOFF = new Date("2026-09-29T18:00:00Z");

describe("lucamsDeliveryDays — matriz producción × corte", () => {
  it.each([
    // [productionDays, now, expected] — regla: producción + 1 si entra al corte o después.
    [0, BEFORE_CUTOFF, 0],
    [0, AFTER_CUTOFF, 1],
    [1, BEFORE_CUTOFF, 1],
    [1, AFTER_CUTOFF, 2],
    [2, BEFORE_CUTOFF, 2],
    [2, AFTER_CUTOFF, 3],
  ])("productionDays=%i a las %s → %i días", (productionDays, now, expected) => {
    expect(
      lucamsDeliveryDays({ maxProductionDays: productionDays, cutoffHour: CUTOFF, now }),
    ).toBe(expected);
  });

  it("justo a la hora de corte ya corre desde el día siguiente (>= cutoff)", () => {
    // 2026-09-29 17:00 UTC = 12:00 Bogotá = cutoff exacto.
    expect(
      lucamsDeliveryDays({
        maxProductionDays: 0,
        cutoffHour: CUTOFF,
        now: new Date("2026-09-29T17:00:00Z"),
      }),
    ).toBe(1);
  });

  it("dato faltante/inválido → default fail-safe (2 días)", () => {
    expect(
      lucamsDeliveryDays({
        maxProductionDays: Number.NaN,
        cutoffHour: CUTOFF,
        now: BEFORE_CUTOFF,
      }),
    ).toBe(LUCAMS_DEFAULT_PRODUCTION_DAYS);
    expect(
      lucamsDeliveryDays({ maxProductionDays: -1, cutoffHour: CUTOFF, now: BEFORE_CUTOFF }),
    ).toBe(LUCAMS_DEFAULT_PRODUCTION_DAYS);
  });
});

describe("maxProductionDaysOf", () => {
  it("devuelve el máximo de los valores válidos", () => {
    expect(maxProductionDaysOf([0, 2, 1])).toBe(2);
    expect(maxProductionDaysOf([1])).toBe(1);
  });

  it("ignora datos faltantes; si ninguno es válido, default fail-safe", () => {
    expect(maxProductionDaysOf([null, 2, undefined])).toBe(2);
    expect(maxProductionDaysOf([null, undefined])).toBe(LUCAMS_DEFAULT_PRODUCTION_DAYS);
    expect(maxProductionDaysOf([])).toBe(LUCAMS_DEFAULT_PRODUCTION_DAYS);
  });
});

describe("bogotaHour", () => {
  it("convierte UTC a hora de Colombia (UTC-5)", () => {
    expect(bogotaHour(new Date("2026-09-29T14:00:00Z"))).toBe(9);
    expect(bogotaHour(new Date("2026-09-29T16:59:59Z"))).toBe(11);
    expect(bogotaHour(new Date("2026-09-29T17:00:00Z"))).toBe(12);
  });
});
