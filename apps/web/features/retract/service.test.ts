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
  computeRetractRefundBreakdown,
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

describe("computeRetractRefundBreakdown ([FIN-01])", () => {
  it("descuenta Puntos Lucams redimidos para no devolver más efectivo del que el cliente pagó", () => {
    // Pedido de $100.000 (10_000_000 cts) pagado mitad con Puntos Lucams ($50.000 = 5_000 pts)
    // y mitad en efectivo ($50.000). Antes devolvía $100.000 en efectivo.
    const r = computeRetractRefundBreakdown({
      lineTotal: 10_000_000,
      orderSubtotal: 10_000_000,
      couponDiscount: 0,
      loyaltyDiscount: 5_000_000,
      loyaltyPointsRedeemed: 5_000,
    });
    expect(r).toEqual({
      cashRefundCents: 5_000_000,
      discountShareCents: 5_000_000,
      pointsToRestore: 5_000,
    });
  });

  it("prorratea cupón + Puntos Lucams por línea en pedidos multi-ítem", () => {
    // Subtotal $100.000 (60k + 40k), cupón $10.000, puntos $20.000 (2.000 pts) → pagó $70.000 cash.
    const itemA = computeRetractRefundBreakdown({
      lineTotal: 6_000_000,
      orderSubtotal: 10_000_000,
      couponDiscount: 1_000_000,
      couponType: "PERCENT",
      loyaltyDiscount: 2_000_000,
      loyaltyPointsRedeemed: 2_000,
    });
    expect(itemA).toEqual({
      cashRefundCents: 4_200_000,
      discountShareCents: 1_800_000,
      pointsToRestore: 1_200,
    });

    const itemB = computeRetractRefundBreakdown({
      lineTotal: 4_000_000,
      orderSubtotal: 10_000_000,
      couponDiscount: 1_000_000,
      couponType: "PERCENT",
      loyaltyDiscount: 2_000_000,
      loyaltyPointsRedeemed: 2_000,
      alreadyRefundedCents: itemA.cashRefundCents,
    });
    expect(itemB).toEqual({
      cashRefundCents: 2_800_000,
      discountShareCents: 1_200_000,
      pointsToRestore: 800,
    });
    expect(itemA.cashRefundCents + itemB.cashRefundCents).toBe(7_000_000);
  });

  it("FREE_SHIPPING no descuenta el ítem, pero loyaltyDiscount sí", () => {
    const r = computeRetractRefundBreakdown({
      lineTotal: 5_000_000,
      orderSubtotal: 5_000_000,
      couponDiscount: 1_200_000,
      couponType: "FREE_SHIPPING",
      loyaltyDiscount: 1_000_000,
      loyaltyPointsRedeemed: 1_000,
    });
    expect(r.cashRefundCents).toBe(4_000_000);
    expect(r.pointsToRestore).toBe(1_000);
  });

  it("acota contra el efectivo restante cuando el redondeo por línea excedería por 1 centavo", () => {
    // 3 ítems iguales de 33_334 cts (subtotal 100_002) con loyaltyDiscount = 1 ct → efectivo pagado = 100_001.
    // Por línea: discountShare = round(1 * 33_334 / 100_002) = 0 → rawCashRefund = 33_334.
    // Sin el cap de efectivo restante, 3 × 33_334 = 100_002 (> 100_001). Con cap: 33_334 + 33_334 + 33_333 = 100_001.
    const first = computeRetractRefundBreakdown({
      lineTotal: 33_334,
      orderSubtotal: 100_002,
      couponDiscount: 0,
      loyaltyDiscount: 1,
      loyaltyPointsRedeemed: 1,
    });
    const second = computeRetractRefundBreakdown({
      lineTotal: 33_334,
      orderSubtotal: 100_002,
      couponDiscount: 0,
      loyaltyDiscount: 1,
      loyaltyPointsRedeemed: 1,
      alreadyRefundedCents: first.cashRefundCents,
    });
    const third = computeRetractRefundBreakdown({
      lineTotal: 33_334,
      orderSubtotal: 100_002,
      couponDiscount: 0,
      loyaltyDiscount: 1,
      loyaltyPointsRedeemed: 1,
      alreadyRefundedCents: first.cashRefundCents + second.cashRefundCents,
    });
    expect(third.cashRefundCents).toBe(33_333);
    expect(first.cashRefundCents + second.cashRefundCents + third.cashRefundCents).toBe(100_001);
  });

  it("opera con precisión exacta sobre montos grandes (>$5M COP) sin overflow", () => {
    // $6.000.000 COP = 600_000_000 cts; con Number flotante 200M * 600M > MAX_SAFE_INTEGER.
    const r = computeRetractRefundBreakdown({
      lineTotal: 300_000_000,
      orderSubtotal: 600_000_000,
      couponDiscount: 60_000_000,
      loyaltyDiscount: 140_000_000,
      loyaltyPointsRedeemed: 140_000,
    });
    expect(r.cashRefundCents).toBe(200_000_000);
    expect(r.pointsToRestore).toBe(70_000);
  });
});
