/*
 * Fase 2 · item 2.8 (2026-10-07) — tour de onboarding POR TIPO DE PRODUCTO.
 *
 * Antes StudioOnboarding era genérico (3 pasos iguales para todo el Estudio)
 * con UN solo localStorage (`lucams_studio_onboarded`): la clienta que ya vio el
 * tutorial de los fotoimanes no aprendía las funciones específicas del lienzo
 * del calendario o de los separadores.
 *
 * Ahora el onboarding suma, tras los 3 pasos genéricos, las FEATURES del
 * lienzo del producto actual (config declarativa por superficie, textos CMS en
 * studio-texts sección `tour`), y el "ya lo vi" se persiste POR SUPERFICIE
 * (`lucams_studio_onboarded_<surface>`) — el primer ingreso a CADA tipo de
 * lienzo muestra su tour una sola vez. La clave global vieja queda sin uso (no
 * se borra: convive; los usuarios previos ven UNA vez el tour de cada
 * superficie nueva, que es justo la intención del item).
 *
 * Superficies (prioridad de arriba hacia abajo — una sola por producto):
 *  - polaroid-ig: foto de perfil editable en el avatar (pista del item 2.7,
 *    incluida acá a solicitud del plan), los 5 textos del post y el marco.
 *  - calendar: sets/unidades y el año + tipo de letra.
 *  - bookmarks: caras A y B, y la regla del respaldo EN BLANCO si B queda vacía
 *    (decisión owner 2026-10-07 — la regla nueva se enseña acá).
 *  - strips: la tira continua y las unidades con «Aplicar a todas».
 *  - cards: productos con marco de color (frameFullBleed, ej. Cuadrados).
 *  - default: solo los 3 pasos genéricos (fotoimanes sueltos).
 *
 * Módulo PURO (recibe los textos resueltos) → testeable sin montar React.
 */

import type { StudioTexts } from "../studio-texts";

export type StudioTourSurface =
  "polaroid-ig" | "calendar" | "bookmarks" | "strips" | "cards" | "default";

/** Icono de la feature (la clave la mapea el componente a un lucide). */
export type StudioTourIcon =
  | "user"
  | "type"
  | "frame"
  | "calendar"
  | "font"
  | "faces"
  | "blank"
  | "strip"
  | "units"
  | "palette";

export type StudioTourFeature = {
  icon: StudioTourIcon;
  title: string;
  body: string;
};

/** Clave del localStorage por superficie. */
export function tourStorageKey(surface: StudioTourSurface): string {
  return `lucams_studio_onboarded_${surface}`;
}

/**
 * Superficie del tour según el producto/plantilla activa. Prioridad: la
 * plantilla Instagram manda sobre el resto (una Polaroid IG con marco sigue
 * siendo IG); luego el tipo de producto; `cards` cubre los productos con
 * marcos de color (frameOptions) que no son IG; `default` al final.
 */
export function resolveTourSurface(opts: {
  isInstagramTemplate: boolean;
  isCalendarMonth: boolean;
  isBookmark: boolean;
  isStrip: boolean;
  hasFrameOptions: boolean;
}): StudioTourSurface {
  if (opts.isInstagramTemplate) return "polaroid-ig";
  if (opts.isCalendarMonth) return "calendar";
  if (opts.isBookmark) return "bookmarks";
  if (opts.isStrip) return "strips";
  if (opts.hasFrameOptions) return "cards";
  return "default";
}

/** Features del lienzo por superficie (vacío = solo los pasos genéricos). */
export function tourFeaturesFor(
  surface: StudioTourSurface,
  texts: StudioTexts,
): StudioTourFeature[] {
  const t = texts.tour;
  switch (surface) {
    case "polaroid-ig":
      return [
        { icon: "user", title: t.igPerfilTitulo, body: t.igPerfilTexto },
        { icon: "type", title: t.igTextosTitulo, body: t.igTextosTexto },
        { icon: "frame", title: t.igMarcoTitulo, body: t.igMarcoTexto },
      ];
    case "calendar":
      return [
        { icon: "calendar", title: t.calSetsTitulo, body: t.calSetsTexto },
        { icon: "font", title: t.calAnoTitulo, body: t.calAnoTexto },
      ];
    case "bookmarks":
      return [
        { icon: "faces", title: t.sepCarasTitulo, body: t.sepCarasTexto },
        { icon: "blank", title: t.sepRespaldoTitulo, body: t.sepRespaldoTexto },
      ];
    case "strips":
      return [
        { icon: "strip", title: t.tiraContinuaTitulo, body: t.tiraContinuaTexto },
        { icon: "units", title: t.tiraUnidadesTitulo, body: t.tiraUnidadesTexto },
      ];
    case "cards":
      return [{ icon: "palette", title: t.cuadMarcoTitulo, body: t.cuadMarcoTexto }];
    case "default":
      return [];
  }
}
