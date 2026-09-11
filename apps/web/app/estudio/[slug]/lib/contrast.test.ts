/*
 * lib/contrast.ts — Ola 28 (owner 2026-09-11, 1.2.1.A): texto blanco sobre
 * tarjeta blanca en «Editar» era invisible. El helper detecta el bajo
 * contraste para que el preview de la pestaña Texto muestre la ayuda editorial
 * (checkerboard + aviso) en vez de un lienzo aparentemente vacío.
 */
import { describe, expect, it } from "vitest";
import { contrastRatio, isLowContrastOnCard, relativeLuminance } from "./contrast";

describe("contrastRatio — fórmula WCAG 2.2", () => {
  it("blanco/negro = 21, mismo color = 1", () => {
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 0);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBe(1);
  });

  it("parsea con o sin '#' y es simétrico", () => {
    expect(contrastRatio("FFFFFF", "#ffffff")).toBe(1);
    expect(contrastRatio("#7C6AAD", "#FFFFFF")).toBe(contrastRatio("#FFFFFF", "#7C6AAD"));
  });

  it("hex inválido → null (nunca explota)", () => {
    expect(contrastRatio("white", "#FFFFFF")).toBeNull();
    expect(relativeLuminance("#123")).toBeNull();
    expect(relativeLuminance("")).toBeNull();
  });
});

describe("isLowContrastOnCard — umbral editorial (1.2)", () => {
  it("blanco sobre tarjeta blanca → true (el caso del owner)", () => {
    expect(isLowContrastOnCard("#FFFFFF", "#FFFFFF")).toBe(true);
  });

  it("negro sobre tarjeta negra → true", () => {
    expect(isLowContrastOnCard("#262626", "#221E25")).toBe(true);
  });

  it("turquesa de marca sobre blanco (≈1.71) → false: combo suave pero legítimo", () => {
    expect(isLowContrastOnCard("#5DD9D1", "#FFFFFF")).toBe(false);
  });

  it("negro sobre blanco / blanco sobre negro → false", () => {
    expect(isLowContrastOnCard("#262626", "#FFFFFF")).toBe(false);
    expect(isLowContrastOnCard("#FFFFFF", "#221E25")).toBe(false);
  });

  it("color no parseable → false (no se sabe, no se molesta)", () => {
    expect(isLowContrastOnCard("white", "#FFFFFF")).toBe(false);
  });
});
