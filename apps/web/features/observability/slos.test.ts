/*
 * Unit — evaluateSlo: clasificación pura de un SLO (cumplido / en riesgo / incumplido / sin datos).
 * ADR-066.
 */

import { describe, expect, it } from "vitest";
import { evaluateSlo } from "./slos";

describe("evaluateSlo", () => {
  it("sin datos suficientes cuando la muestra es menor al mínimo", () => {
    expect(evaluateSlo(100, 90, 5, 20)).toBe("insufficient_data");
    expect(evaluateSlo(null, 90, 1000, 20)).toBe("insufficient_data");
  });

  it("incumplido cuando el SLI cae por debajo del objetivo", () => {
    expect(evaluateSlo(88, 90, 100, 20)).toBe("breached");
    expect(evaluateSlo(0, 90, 50, 20)).toBe("breached");
  });

  it("en riesgo cuando está por encima del objetivo pero dentro del margen (2pp)", () => {
    expect(evaluateSlo(90, 90, 100, 20)).toBe("at_risk"); // justo en el objetivo
    expect(evaluateSlo(91.5, 90, 100, 20)).toBe("at_risk");
  });

  it("cumplido cuando supera el objetivo con holgura", () => {
    expect(evaluateSlo(95, 90, 100, 20)).toBe("met");
    expect(evaluateSlo(100, 99, 500, 20)).toBe("met");
  });

  it("respeta el mínimo de muestra por SLO", () => {
    // 30 requerido (Web Vitals): 29 no alcanza aunque el % sea perfecto.
    expect(evaluateSlo(100, 75, 29, 30)).toBe("insufficient_data");
    expect(evaluateSlo(100, 75, 30, 30)).toBe("met");
  });
});
