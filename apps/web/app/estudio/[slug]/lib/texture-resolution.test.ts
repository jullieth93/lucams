/*
 * Tests de texture-resolution.ts — la propuesta de ancho de textura por tamaño
 * físico de pieza (pendiente de integración en buildMagnetTextures de
 * studio-editor.tsx, que hoy fija 512 px para todas).
 */

import { describe, expect, it } from "vitest";
import {
  LARGE_PIECE_CM,
  MAGNET_TEXTURE_WIDTH_DEFAULT,
  MAGNET_TEXTURE_WIDTH_LARGE,
  magnetTextureWidth,
} from "./texture-resolution";

describe("magnetTextureWidth — ancho de textura por tamaño físico de la pieza", () => {
  it("defaults: 1024 base / 2048 grande, umbral 10 cm", () => {
    expect(MAGNET_TEXTURE_WIDTH_DEFAULT).toBe(1024);
    expect(MAGNET_TEXTURE_WIDTH_LARGE).toBe(2048);
    expect(LARGE_PIECE_CM).toBe(10);
  });

  it("piezas chicas/medianas → 1024 (el 512 fijo actual queda atrás)", () => {
    expect(magnetTextureWidth({ sizeCm: "6.5" })).toBe(1024); // fotoimán cuadrado
    expect(magnetTextureWidth({ sizeCm: "5×5" })).toBe(1024);
    expect(magnetTextureWidth({ sizeCm: "2×6" })).toBe(1024); // separador
    expect(magnetTextureWidth({ sizeCm: "8×10" })).toBe(2048); // lado mayor 10 → grande
  });

  it("piezas grandes (lado mayor ≥ 10 cm) → 2048", () => {
    expect(magnetTextureWidth({ sizeCm: "6.5×20" })).toBe(2048); // tira photobooth
    expect(magnetTextureWidth({ sizeCm: "4×12" })).toBe(2048); // alargado
    expect(magnetTextureWidth({ sizeCm: "4×15" })).toBe(2048);
    expect(magnetTextureWidth({ sizeCm: "10×15" })).toBe(2048);
  });

  it("mide por el lado MAYOR (una tira 6.5×20 es grande aunque sea angosta)", () => {
    expect(magnetTextureWidth({ sizeCm: "2×12" })).toBe(2048);
    expect(magnetTextureWidth({ sizeCm: "9.9×2" })).toBe(1024);
  });

  it("sin sizeCm o no parseable → default seguro (1024, nunca menos que hoy)", () => {
    expect(magnetTextureWidth()).toBe(1024);
    expect(magnetTextureWidth({ sizeCm: undefined })).toBe(1024);
    expect(magnetTextureWidth({ sizeCm: null })).toBe(1024);
    expect(magnetTextureWidth({ sizeCm: "grande" })).toBe(1024);
    expect(magnetTextureWidth({ sizeCm: "0×0" })).toBe(1024);
  });

  it("acepta coma decimal y mayúsculas en la X", () => {
    expect(magnetTextureWidth({ sizeCm: "6,5x20" })).toBe(2048);
  });

  it("los anchos son parametrizables (p.ej. gama baja puede bajar el large)", () => {
    expect(magnetTextureWidth({ sizeCm: "6.5×20", large: 1536 })).toBe(1536);
    expect(magnetTextureWidth({ sizeCm: "5×5", base: 768 })).toBe(768);
    expect(magnetTextureWidth({ sizeCm: "8×8", largePieceCm: 8 })).toBe(2048);
  });
});
