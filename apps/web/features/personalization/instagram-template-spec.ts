/*
 * Spec canónica de geometría de la plantilla "Polaroid Instagram"
 * (PersonalizationTemplate slug `photo-pack-polaroid-instagram`) — réplica fiel
 * de un post real de Instagram (stage 450×600, fuente Inter, mismo orden de
 * elementos: foto → acciones → likes → caption → hashtags).
 *
 * Fuente de verdad de las coordenadas: seed-templates.mjs + el chrome SVG
 * public/templates/ig_post_3x4.svg. El test instagram-template-spec.test.ts
 * congela estos valores: si alguien mueve el footer encima de la fila de
 * iconos (bug 2026-07-24: likes/caption/hashtags en y=486/502/518), el gate
 * de unit tests lo atrapa aunque los scripts de seed vuelvan a driftear.
 *
 * OJO: Konva dibuja el texto con top = y − fontSize/2 (el renderer resta
 * fontSize/2 a la y, que es el centro vertical del texto).
 */

export const IG_CARD = { width: 450, height: 600 } as const;

// Foto cuadrada centrada con ventana de borde blanco.
export const IG_PHOTO_SLOT = { x: 29, y: 58, width: 392, height: 392 } as const;

// Zona que ocupan los iconos like/comment/share del chrome SVG:
// translate(22,468) con glifos de 24px escalados ×1.17 → y≈468–496.
export const IG_ACTION_ICON_ZONE = { top: 468, bottom: 496 } as const;

export const igTextTop = (y: number, fontSize: number): number => y - fontSize / 2;

// Capas de texto del footer, en el orden real de un post de IG.
export const IG_FOOTER_TEXT_LAYERS = [
  { id: "likes_count", y: 510, fontSize: 15 },
  { id: "caption", y: 526, fontSize: 16 },
  { id: "hashtags", y: 542, fontSize: 13 },
] as const;
