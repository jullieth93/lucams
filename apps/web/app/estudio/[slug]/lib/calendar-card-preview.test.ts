/*
 * firstFontFamily — extrae la primera familia de un font-family CSS (para pedirle a
 * document.fonts/canvas la cara real de next/font, cuyo nombre viene hasheado).
 */

import { describe, it, expect } from "vitest";
import { firstFontFamily } from "./calendar-card-preview";

describe("firstFontFamily", () => {
  it("extrae la primera familia sin comillas", () => {
    expect(firstFontFamily('"__Fredoka_abc123", "__Fredoka_Fallback_abc123", sans-serif')).toBe(
      "__Fredoka_abc123",
    );
  });

  it("funciona sin comillas y sin fallback", () => {
    expect(firstFontFamily("__Inter_def456")).toBe("__Inter_def456");
  });

  it("recorta espacios", () => {
    expect(firstFontFamily("  __Fredoka_x  , serif")).toBe("__Fredoka_x");
  });

  it("string vacío → null", () => {
    expect(firstFontFamily("")).toBeNull();
    expect(firstFontFamily("   ")).toBeNull();
  });
});
