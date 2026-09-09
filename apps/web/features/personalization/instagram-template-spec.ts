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
 *
 * PLACEHOLDERS NO IMPRIMIBLES (regla global, Ola 23 2026-09-08; estricta Ola 25
 * 2026-09-09): los textos por defecto de esta plantilla ("@tu_usuario",
 * "Bogotá, Colombia", "362 me gusta", "Tu título acá", "#mirecuerdo #lucamsshop")
 * son capas `editable: true` — NADA de eso aparece en la tarjeta (grilla, preview
 * del modal, 3D, confirmación) hasta que el cliente escribe su propio texto; en la
 * grilla el campo se descubre como ZONA DE EDICIÓN vacía (recuadro punteado
 * turquesa, `edit-indicator`) y en el editor el input muestra el default como
 * placeholder gris. NUNCA se hornean en el PNG de producción: solo se imprime el
 * texto que el cliente escribió explícitamente (TextOverride). Misma regla en el
 * render server-side (production-render-canvas) y en el snapshot del cliente
 * (edit-indicator).
 */

export const IG_CARD = { width: 450, height: 600 } as const;

// Foto cuadrada centrada con ventana de borde blanco.
export const IG_PHOTO_SLOT = { x: 29, y: 58, width: 392, height: 392 } as const;

// Zona que ocupan los iconos like/comment/share del chrome SVG:
// translate(22,468) con glifos de 24px escalados ×1.17 → y≈468–496.
export const IG_ACTION_ICON_ZONE = { top: 468, bottom: 496 } as const;

// Capa de FOTO DE PERFIL (Ola 17, Lucy 2026-09-07) — el chrome SVG trae un avatar
// placeholder horneado (circle cx=34 cy=34 r=16 + silueta gris) rodeado por el anillo
// de historia (circle r=20, stroke 2.5 → borde externo ~21.25). La capa Konva cubre
// EXACTAMENTE el círculo horneado con la foto real del cliente recortada a círculo,
// dejando el anillo de historia visible alrededor. Centro/radio copiados del SVG:
// el círculo nuevo coincide con el avatar placeholder (mismo centro y radio).
// En el orden de capas va INMEDIATAMENTE DESPUÉS del asset "frame" (queda por encima
// del SVG). Sin foto elegida, la capa no dibuja nada y se ve el placeholder horneado.
export const IG_PROFILE_PHOTO_LAYER = {
  id: "profile_photo",
  type: "profile-photo",
  x: 34,
  y: 34,
  radius: 16,
} as const;

export const igTextTop = (y: number, fontSize: number): number => y - fontSize / 2;

// Capas de texto del footer, en el orden real de un post de IG.
export const IG_FOOTER_TEXT_LAYERS = [
  { id: "likes_count", y: 510, fontSize: 15 },
  { id: "caption", y: 526, fontSize: 16 },
  { id: "hashtags", y: 542, fontSize: 13 },
] as const;
