/*
 * Test puro de la máquina de estados de Order (post-launch Bloque A #10).
 *
 * processFailedPaymentOrder elige el estado terminal según el estado actual.
 * Estos tests fijan las transiciones legales que esa lógica asume — si alguien
 * cambia ORDER_TRANSITIONS, estos tests avisan antes de romper el revert de
 * stock en producción.
 */

import { describe, expect, it } from "vitest";
import { canTransition } from "./schemas";

describe("ORDER_TRANSITIONS — legalidad asumida por processFailedPaymentOrder (#10)", () => {
  it("PAID → REFUNDED es legal (target elegido para VOIDED sobre orden pagada)", () => {
    expect(canTransition("PAID", "REFUNDED")).toBe(true);
  });

  it("PAID → CANCELLED NO es legal (el bug: forzar CANCELLED se tragaba el error y no revertía stock)", () => {
    expect(canTransition("PAID", "CANCELLED")).toBe(false);
  });

  it("DELIVERED → REFUNDED es legal", () => {
    expect(canTransition("DELIVERED", "REFUNDED")).toBe(true);
  });

  it("PENDING_PAYMENT → CANCELLED es legal (DECLINED antes del pago)", () => {
    expect(canTransition("PENDING_PAYMENT", "CANCELLED")).toBe(true);
  });

  it("FULFILLING → CANCELLED es legal (revierte stock desde producción)", () => {
    expect(canTransition("FULFILLING", "CANCELLED")).toBe(true);
  });

  it("SHIPPED → CANCELLED es legal", () => {
    expect(canTransition("SHIPPED", "CANCELLED")).toBe(true);
  });

  it("estados terminales no transicionan", () => {
    expect(canTransition("CANCELLED", "REFUNDED")).toBe(false);
    expect(canTransition("REFUNDED", "CANCELLED")).toBe(false);
  });

  it("PENDING_PAYMENT → PAID es legal (happy path)", () => {
    expect(canTransition("PENDING_PAYMENT", "PAID")).toBe(true);
  });
});
