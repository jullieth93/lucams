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
  IG_PROFILE_PHOTO_LAYER,
  IG_HASHTAGS_LAYER_ID,
  IG_HASHTAG_BLUE,
  IG_HASHTAG_BLUE_ON_DARK,
  IG_REQUIRED_TEXT_LAYER_IDS,
  IG_DECORATIVE_TEXT_LAYER_IDS,
  igTextTop,
  igTextFill,
  igMissingRequiredTextLayerIds,
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

describe("instagram-template-spec (geometría foto de perfil — Ola 17)", () => {
  it("congela la capa profile-photo (centro 34,34 r=16, id profile_photo)", () => {
    expect(IG_PROFILE_PHOTO_LAYER).toEqual({
      id: "profile_photo",
      type: "profile-photo",
      x: 34,
      y: 34,
      radius: 16,
    });
  });

  it("el círculo cubre EXACTAMENTE el avatar placeholder horneado del SVG", () => {
    // SVG public/templates/ig_post_3x4.svg: avatar placeholder = circle cx=34 cy=34 r=16.
    expect(IG_PROFILE_PHOTO_LAYER.x).toBe(34);
    expect(IG_PROFILE_PHOTO_LAYER.y).toBe(34);
    expect(IG_PROFILE_PHOTO_LAYER.radius).toBe(16);
  });

  it("la foto queda DENTRO del anillo de historia sin comérselo", () => {
    // Anillo: circle r=20 con stroke-width 2.5 → borde externo ≈ 21.25, interno ≈ 18.75.
    const ringInner = 20 - 2.5 / 2;
    expect(IG_PROFILE_PHOTO_LAYER.radius).toBeLessThanOrEqual(ringInner);
  });

  it("el avatar entero cae dentro de la tarjeta 450×600 y en el header (y<58)", () => {
    const { x, y, radius } = IG_PROFILE_PHOTO_LAYER;
    expect(x - radius).toBeGreaterThanOrEqual(0);
    expect(y - radius).toBeGreaterThanOrEqual(0);
    expect(x + radius).toBeLessThanOrEqual(IG_CARD.width);
    expect(y + radius).toBeLessThanOrEqual(58); // inicio de la foto y=58
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Ola 26 (Lucy 2026-09-09) — color de texto por capa + textos requeridos.
// ──────────────────────────────────────────────────────────────────────────

describe("instagram-template-spec (color de texto por capa — Ola 26)", () => {
  it("hashtags SIEMPRE azul link IG: clásico sobre tarjeta clara, variante legible sobre oscura", () => {
    expect(igTextFill(IG_HASHTAGS_LAYER_ID, "#00376B", false)).toBe(IG_HASHTAG_BLUE);
    expect(igTextFill(IG_HASHTAGS_LAYER_ID, "#00376B", true)).toBe(IG_HASHTAG_BLUE_ON_DARK);
    // Nunca cae al blanco/negro del contraste automático.
    expect(igTextFill(IG_HASHTAGS_LAYER_ID, "#00376B", true)).not.toBe("#FFFFFF");
    expect(IG_HASHTAG_BLUE).toBe("#00376B");
    expect(IG_HASHTAG_BLUE_ON_DARK).toBe("#0095F6");
  });

  it("el azul oscuro es legible sobre el negro de marca #221E25 (contraste AA ≥ 4.5)", () => {
    // Luminancia relativa WCAG: el azul clásico #00376B sobre #221E25 sería
    // ilegible; la variante #0095F6 supera 4.5:1 (texto pequeño 13px).
    const lum = (hex: string) => {
      const ch = (i: number) => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * ch(1) + 0.7152 * ch(3) + 0.0722 * ch(5);
    };
    const contrast = (a: string, b: string) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    expect(contrast(IG_HASHTAG_BLUE_ON_DARK, "#221E25")).toBeGreaterThanOrEqual(4.5);
    expect(contrast(IG_HASHTAG_BLUE, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
  });

  it("resto de capas: tarjeta oscura → blanco; tarjeta clara → fill de la plantilla", () => {
    expect(igTextFill("user_name", "#262626", true)).toBe("#FFFFFF");
    expect(igTextFill("caption", "#262626", true)).toBe("#FFFFFF");
    expect(igTextFill("location", "#8E8E8E", true)).toBe("#FFFFFF");
    expect(igTextFill("likes_count", "#262626", true)).toBe("#FFFFFF");
    expect(igTextFill("user_name", "#262626", false)).toBe("#262626");
    expect(igTextFill("location", "#8E8E8E", false)).toBe("#8E8E8E");
    // Sin fill en la capa → fallback oscuro de IG (no el morado de marca).
    expect(igTextFill("caption", undefined, false)).toBe("#262626");
  });
});

describe("instagram-template-spec (textos requeridos para finalizar — Ola 26)", () => {
  // Mini-plantilla IG: asset chrome (marca isInstagramTemplate) + las 5 capas de texto.
  const igLayers = [
    { id: "frame", type: "asset", src: "/templates/ig_post_3x4.svg" },
    { id: "user_name", type: "text", editable: true },
    { id: "location", type: "text", editable: true },
    { id: "likes_count", type: "text", editable: true },
    { id: "caption", type: "text", editable: true },
    { id: "hashtags", type: "text", editable: true },
  ];
  const canvasWith = (
    layers: typeof igLayers,
    slots: ReadonlyArray<{
      textOverrides?: Record<
        string,
        | {
            text?: unknown;
            fill?: unknown;
            fontSize?: unknown;
            fontFamily?: unknown;
            fontWeight?: unknown;
          }
        | undefined
      >;
    }>,
  ) => ({ unitTemplate: { layers }, slots });

  it("requeridos = usuario, ubicación, título y hashtags (likes queda decorativo)", () => {
    expect([...IG_REQUIRED_TEXT_LAYER_IDS]).toEqual([
      "user_name",
      "location",
      "caption",
      "hashtags",
    ]);
    expect(IG_REQUIRED_TEXT_LAYER_IDS).not.toContain("likes_count");
    expect([...IG_DECORATIVE_TEXT_LAYER_IDS]).toEqual(["likes_count"]);
  });

  it("tarjeta recién creada (sin overrides) → faltan los 4 campos requeridos, en orden de plantilla", () => {
    const missing = igMissingRequiredTextLayerIds(
      canvasWith(igLayers, [{ textOverrides: undefined }]),
    );
    expect(missing).toEqual(["user_name", "location", "caption", "hashtags"]);
  });

  it("un campo cuenta faltante si ALGÚN slot no lo tiene (cada imán es un post)", () => {
    const missing = igMissingRequiredTextLayerIds(
      canvasWith(igLayers, [
        {
          textOverrides: {
            user_name: { text: "@lucy" },
            location: { text: "Bogotá" },
            caption: { text: "Mi recuerdo" },
            hashtags: { text: "#amor" },
          },
        },
        {
          textOverrides: {
            user_name: { text: "@lucy" },
            location: { text: "Bogotá" },
            caption: { text: "Otro" },
            // hashtags sin llenar en el slot 2
          },
        },
      ]),
    );
    expect(missing).toEqual(["hashtags"]);
  });

  it("override con solo espacios o solo estilo cuenta como vacío", () => {
    const missing = igMissingRequiredTextLayerIds(
      canvasWith(igLayers, [
        {
          textOverrides: {
            user_name: { text: "   " },
            location: { fill: "#FF0000" }, // solo estilo, sin texto
            caption: { text: "Mi recuerdo" },
            hashtags: { text: "#amor" },
          },
        },
      ]),
    );
    expect(missing).toEqual(["user_name", "location"]);
  });

  it("todo lleno → []; plantillas no-IG → [] (la regla solo aplica a la Polaroid IG)", () => {
    const full = igMissingRequiredTextLayerIds(
      canvasWith(igLayers, [
        {
          textOverrides: {
            user_name: { text: "@lucy" },
            location: { text: "Bogotá" },
            caption: { text: "Mi recuerdo" },
            hashtags: { text: "#amor" },
          },
        },
      ]),
    );
    expect(full).toEqual([]);

    const notIg = igMissingRequiredTextLayerIds(
      canvasWith(
        [
          { id: "card", type: "frame-card" },
          { id: "message", type: "text", editable: true },
        ] as unknown as typeof igLayers,
        [{ textOverrides: undefined }],
      ),
    );
    expect(notIg).toEqual([]);
  });
});
