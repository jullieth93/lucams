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

import { isInstagramTemplate } from "./frame-palette";

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

// ──────────────────────────────────────────────────────────────────────────
// Ola 26 (Lucy 2026-09-09) — identidad y color de las capas de texto editables.
//
// HASHTAGS: la única capa cuyo color NO sigue el contraste blanco/negro de la
// tarjeta — SIEMPRE se dibuja azul link de Instagram (legible sobre la tarjeta,
// clara u oscura; ver igTextFill).
export const IG_HASHTAGS_LAYER_ID = "hashtags";

/**
 * Azul link de Instagram para la capa de hashtags:
 *  - IG_HASHTAG_BLUE (#00376B): el azul clásico de los captions/links de IG,
 *    legible sobre la tarjeta CLARA (blanca).
 *  - IG_HASHTAG_BLUE_ON_DARK (#0095F6): el azul de marca de IG en modo oscuro,
 *    contraste ≈5.2:1 sobre el negro de marca #221E25 (AA para texto pequeño).
 * El azul oscuro clásico sobre la tarjeta oscura sería ilegible (#00376B sobre
 * #221E25) — por eso la variante. La regla "hashtags SIEMPRE azules" se mantiene:
 * nunca caen al blanco/negro del contraste automático como el resto de textos.
 */
export const IG_HASHTAG_BLUE = "#00376B";
export const IG_HASHTAG_BLUE_ON_DARK = "#0095F6";

// TEXTOS REQUERIDOS para finalizar (decisión del dueño 2026-09-09): usuario,
// ubicación, título y hashtags son OBLIGATORIOS — sin override del cliente en
// TODAS estas capas, «Vista previa» queda bloqueado (con la tarjeta que nace
// VACÍA, una polaroid IG podía finalizarse en blanco). El contador "362 me
// gusta" queda DECORATIVO (opcional): no bloquea.
export const IG_REQUIRED_TEXT_LAYER_IDS = [
  "user_name",
  "location",
  "caption",
  IG_HASHTAGS_LAYER_ID,
] as const;

/** Capas de texto editables que NO bloquean la finalización (decorativas). */
export const IG_DECORATIVE_TEXT_LAYER_IDS = ["likes_count"] as const;

/**
 * Color de letra POR DEFECTO de una capa de texto de la plantilla Instagram
 * (regla Ola 26: el color sigue al de la tarjeta, por capa — WYSIWYG entre la
 * grilla, el preview del modal y el PNG de producción, que para Instagram es
 * el snapshot del cliente: el chrome SVG → NEEDS_KONVA en los tiers server).
 *  - Hashtags: SIEMPRE azul link IG (variante según la tarjeta, por legibilidad).
 *  - Resto (usuario, ubicación, likes, título): contraste con la tarjeta —
 *    tarjeta oscura → blanco; tarjeta clara → el fill oscuro de la plantilla.
 * El override de color del cliente (textOverrides[].fill) SIEMPRE manda sobre
 * este default (regla histórica, intacta).
 */
export function igTextFill(
  layerId: string,
  layerFill: string | undefined,
  darkCard: boolean,
): string {
  if (layerId === IG_HASHTAGS_LAYER_ID) {
    return darkCard ? IG_HASHTAG_BLUE_ON_DARK : IG_HASHTAG_BLUE;
  }
  return darkCard ? "#FFFFFF" : (layerFill ?? "#262626");
}

/**
 * Ids de las capas de texto REQUERIDAS de la plantilla Instagram que aún no
 * tienen un override con texto del cliente. La tarjeta nace VACÍA (Ola 25) →
 * un campo sin override es un campo que faltaría impreso. La unión es a nivel
 * PACK: un campo cuenta como faltante si ALGÚN slot no lo tiene (cada imán del
 * pack es un post independiente con sus propios textos). Devuelve [] para
 * plantillas que no son Instagram (la regla solo aplica a la Polaroid IG).
 */
export function igMissingRequiredTextLayerIds(canvasData: {
  unitTemplate: {
    layers: ReadonlyArray<{ type: string; id?: unknown; editable?: unknown; src?: unknown }>;
  };
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
  }>;
}): string[] {
  if (!isInstagramTemplate(canvasData.unitTemplate.layers)) return [];
  const required = new Set<string>(IG_REQUIRED_TEXT_LAYER_IDS);
  const layerIds = canvasData.unitTemplate.layers
    .filter(
      (l) =>
        l.type === "text" && l.editable === true && typeof l.id === "string" && required.has(l.id),
    )
    .map((l) => l.id as string);
  if (layerIds.length === 0) return [];
  const missing = new Set<string>();
  for (const slot of canvasData.slots) {
    for (const id of layerIds) {
      const t = slot.textOverrides?.[id]?.text;
      if (typeof t !== "string" || t.trim() === "") missing.add(id);
    }
  }
  // Orden estable = el de la plantilla (usuario, ubicación, título, hashtags).
  return layerIds.filter((id) => missing.has(id));
}
