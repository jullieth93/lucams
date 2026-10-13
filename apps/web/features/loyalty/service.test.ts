/*
 * Unit tests del núcleo puro de "Puntos Lucams" (features/loyalty/service):
 *  - computeEarnedPoints: floor(totalPagado / earnCopPerPoint) en centavos→pesos.
 *  - pointValueCents: equivalencia por punto según la tasa de redención.
 *  - quoteRedemption: mínimo, balance, tope % del subtotal tras cupón y
 *    consumo proporcional (un tope que recorta no cobra puntos de más).
 *
 * Sin DB: solo las funciones puras (patrón de features/coupons/redemption.test.ts).
 */

import { describe, expect, it } from "vitest";
import { computeEarnedPoints, pointValueCents, quoteRedemption } from "./service";

// Config por defecto del negocio: 1 punto por cada $1.000 pagados,
// 100 puntos = $1.000 de descuento, mínimo 100, tope 50% del subtotal.
const SETTINGS = {
  earnCopPerPoint: 1_000,
  redeemPointsPer1000: 100,
  redeemMinPoints: 100,
  redeemMaxPercent: 50,
};

describe("computeEarnedPoints", () => {
  it("1 punto por cada $1.000 COP pagados (floor del total / 1000)", () => {
    // $59.900 pagados = 5_990_000 centavos → 59 puntos.
    expect(computeEarnedPoints(5_990_000, SETTINGS)).toBe(59);
    // $999 → 0 puntos.
    expect(computeEarnedPoints(99_900, SETTINGS)).toBe(0);
    // $1.000 exactos → 1 punto.
    expect(computeEarnedPoints(100_000, SETTINGS)).toBe(1);
  });

  it("total cero o negativo → 0 puntos", () => {
    expect(computeEarnedPoints(0, SETTINGS)).toBe(0);
    expect(computeEarnedPoints(-500, SETTINGS)).toBe(0);
  });

  it("respeta una tasa distinta configurada ($2.000 por punto)", () => {
    expect(computeEarnedPoints(5_990_000, { earnCopPerPoint: 2_000 })).toBe(29);
  });
});

describe("pointValueCents", () => {
  it("100 puntos = $1.000 → 1 punto = 1.000 centavos", () => {
    expect(pointValueCents(SETTINGS)).toBe(1_000);
  });
  it("200 puntos = $1.000 → 1 punto = 500 centavos", () => {
    expect(pointValueCents({ redeemPointsPer1000: 200 })).toBe(500);
  });
});

describe("quoteRedemption", () => {
  const BASE = { balance: 5_000, merchandiseAfterCouponCents: 10_000_000, settings: SETTINGS };

  it("redención plena: 500 puntos = $5.000 de descuento", () => {
    const q = quoteRedemption({ ...BASE, requestedPoints: 500 });
    expect(q).toEqual({ ok: true, points: 500, discountCents: 500_000, cappedBy: null });
  });

  it("rechaza menos del mínimo de redención", () => {
    const q = quoteRedemption({ ...BASE, requestedPoints: 50 });
    expect(q.ok).toBe(false);
    if (!q.ok) expect(q.message).toContain("100");
  });

  it("rechaza entrada inválida o cero", () => {
    expect(quoteRedemption({ ...BASE, requestedPoints: 0 }).ok).toBe(false);
    expect(quoteRedemption({ ...BASE, requestedPoints: -10 }).ok).toBe(false);
  });

  it("clamp por balance: pide 6.000, tiene 5.000 → consume 5.000", () => {
    const q = quoteRedemption({ ...BASE, requestedPoints: 6_000 });
    expect(q).toEqual({ ok: true, points: 5_000, discountCents: 5_000_000, cappedBy: "balance" });
  });

  it("clamp por tope % del subtotal tras cupón (50% de $80.000 = $40.000 → 4.000 puntos)", () => {
    const q = quoteRedemption({
      requestedPoints: 5_000,
      balance: 9_999,
      merchandiseAfterCouponCents: 8_000_000,
      settings: SETTINGS,
    });
    expect(q).toEqual({ ok: true, points: 4_000, discountCents: 4_000_000, cappedBy: "cap" });
  });

  it("el envío no se cubre con puntos: el tope se mide solo sobre productos", () => {
    // Subtotal de productos tras cupón $20.000 → tope $10.000 = 1.000 puntos,
    // aunque el total con envío sea mucho mayor.
    const q = quoteRedemption({
      requestedPoints: 3_000,
      balance: 3_000,
      merchandiseAfterCouponCents: 2_000_000,
      settings: SETTINGS,
    });
    expect(q).toEqual({ ok: true, points: 1_000, discountCents: 1_000_000, cappedBy: "cap" });
  });

  it("si el tope/balance deja menos que el mínimo, rechaza con mensaje claro", () => {
    const q = quoteRedemption({
      requestedPoints: 500,
      balance: 500,
      merchandiseAfterCouponCents: 1_000_000, // tope 50% = $5.000 → 500 pts… ajustemos abajo
      settings: SETTINGS,
    });
    expect(q.ok).toBe(true); // 500 pts = $5.000 exactos, cabe justo en el tope
    const tight = quoteRedemption({
      requestedPoints: 500,
      balance: 60,
      merchandiseAfterCouponCents: 10_000_000,
      settings: SETTINGS,
    });
    expect(tight.ok).toBe(false); // balance 60 < mínimo 100
  });

  it("tope 0% (config extrema) → no se puede redimir", () => {
    const q = quoteRedemption({
      requestedPoints: 500,
      balance: 500,
      merchandiseAfterCouponCents: 10_000_000,
      settings: { ...SETTINGS, redeemMaxPercent: 0 },
    });
    expect(q.ok).toBe(false);
  });
});
