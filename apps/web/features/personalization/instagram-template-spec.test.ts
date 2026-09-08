/*
 * Test de regresión de la geometría del footer de la plantilla Polaroid
 * Instagram: el texto ("me gusta" + caption + hashtags) debe caer BAJO la
 * fila de iconos like/comment/share del chrome SVG, nunca encima.
 *
 * Bug 2026-07-24: los seeds tenían likes/caption/hashtags en y=486/502/518;
 * con top = y − fontSize/2 eso montaba el texto sobre los iconos (zona
 * y≈468–496). El fix las movió a y=510/526/542 con ~7px de aire.
 */

import { describe, expect, it } from "vitest";
import {
  IG_CARD,
  IG_PHOTO_SLOT,
  IG_ACTION_ICON_ZONE,
  IG_FOOTER_TEXT_LAYERS,
  igTextTop,
} from "./instagram-template-spec";

describe("instagram-template-spec (geometría footer vs fila de iconos)", () => {
  it("congela las coordenadas canónicas del footer (y=510/526/542)", () => {
    expect(IG_FOOTER_TEXT_LAYERS).toEqual([
      { id: "likes_count", y: 510, fontSize: 15 },
      { id: "caption", y: 526, fontSize: 16 },
      { id: "hashtags", y: 542, fontSize: 13 },
    ]);
  });

  it('"me gusta" cae bajo la fila de iconos, con aire (bug 2026-07-24)', () => {
    const likes = IG_FOOTER_TEXT_LAYERS[0];
    const top = igTextTop(likes.y, likes.fontSize);
    expect(top).toBe(502.5);
    // El texto no puede invadir la zona de iconos (y≈468–496)...
    expect(top).toBeGreaterThan(IG_ACTION_ICON_ZONE.bottom);
    // ...y debe quedar ~7px de aire entre el último icono y el texto.
    expect(top - IG_ACTION_ICON_ZONE.bottom).toBeGreaterThanOrEqual(6);
  });

  it("los tops van en orden creciente sin solaparse entre sí", () => {
    const tops = IG_FOOTER_TEXT_LAYERS.map((l) => igTextTop(l.y, l.fontSize));
    for (let i = 1; i < tops.length; i++) {
      // Separación mínima de 14px entre líneas (gaps reales: 15.5 y 17.5).
      expect(tops[i] - tops[i - 1]).toBeGreaterThanOrEqual(14);
      // La línea siguiente arranca debajo del final (top + fontSize) de la anterior.
      const prev = IG_FOOTER_TEXT_LAYERS[i - 1];
      expect(tops[i]).toBeGreaterThanOrEqual(tops[i - 1] + prev.fontSize);
    }
    expect(tops).toEqual([502.5, 518, 535.5]);
  });

  it("el footer entero cabe dentro de la tarjeta 450×600", () => {
    const last = IG_FOOTER_TEXT_LAYERS[IG_FOOTER_TEXT_LAYERS.length - 1];
    const bottom = igTextTop(last.y, last.fontSize) + last.fontSize;
    expect(bottom).toBeLessThanOrEqual(IG_CARD.height);
  });

  it("los iconos quedan bajo la foto y sobre el footer (orden foto → acciones → texto)", () => {
    const photoBottom = IG_PHOTO_SLOT.y + IG_PHOTO_SLOT.height;
    expect(photoBottom).toBeLessThanOrEqual(IG_ACTION_ICON_ZONE.top);
    expect(IG_ACTION_ICON_ZONE.bottom).toBeLessThan(
      igTextTop(IG_FOOTER_TEXT_LAYERS[0].y, IG_FOOTER_TEXT_LAYERS[0].fontSize),
    );
    expect(IG_PHOTO_SLOT.width).toBe(IG_PHOTO_SLOT.height); // cuadrada
  });
});
