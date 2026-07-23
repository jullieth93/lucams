/*
 * upload-guidance — texto centralizado de formatos + resolución recomendada (Ola 4).
 * La recomendación usa la misma fórmula 300 DPI del quality-check del server.
 */

import { describe, it, expect } from "vitest";
import {
  recommendedPxForSizeCm,
  uploadGuidanceText,
  STUDIO_ACCEPTED_IMAGE_TYPES,
} from "./upload-guidance";

describe("recommendedPxForSizeCm", () => {
  it("usa el lado MENOR del tamaño físico × 118.11 px/cm (300 DPI), redondeado al alza", () => {
    // 5 cm → 591px exactos → 600 amable; 7.5×10 → 886 → 900; 6.5 → 768 → 800.
    expect(recommendedPxForSizeCm("5×5")).toBe(600);
    expect(recommendedPxForSizeCm("7.5×10")).toBe(900);
    expect(recommendedPxForSizeCm("6.5×20")).toBe(800);
    expect(recommendedPxForSizeCm("8×8")).toBe(1000);
  });

  it("acepta separador × o x; null si no parsea", () => {
    expect(recommendedPxForSizeCm("10x10")).toBe(1200);
    expect(recommendedPxForSizeCm(undefined)).toBeNull();
    expect(recommendedPxForSizeCm("grande")).toBeNull();
    expect(recommendedPxForSizeCm("")).toBeNull();
  });
});

describe("uploadGuidanceText", () => {
  it("incluye formatos, tope de MB y el px recomendado del producto", () => {
    const t = uploadGuidanceText("5×5");
    expect(t).toContain("JPG, PNG, WebP o HEIC");
    expect(t).toContain("10 MB");
    expect(t).toContain("~600 px");
    expect(t).toContain("300 DPI");
  });

  it("sin sizeCm cae a la recomendación genérica (sin px concreto)", () => {
    const t = uploadGuidanceText();
    expect(t).toContain("JPG, PNG, WebP o HEIC");
    expect(t).toContain("300 DPI");
    expect(t).not.toContain("~");
  });

  it("el accept del Estudio cubre JPG/PNG/WebP/HEIC", () => {
    expect(STUDIO_ACCEPTED_IMAGE_TYPES).toContain("image/jpeg");
    expect(STUDIO_ACCEPTED_IMAGE_TYPES).toContain("image/png");
    expect(STUDIO_ACCEPTED_IMAGE_TYPES).toContain("image/webp");
    expect(STUDIO_ACCEPTED_IMAGE_TYPES).toContain("image/heic");
  });
});
