/*
 * Fase 2 · item 2.3 (2026-10-07) — desglose de la variante EFECTIVA para la
 * Vista Previa del editor de foto, con la MISMA fuente que ya usan los
 * editores de nombre y letras (describeVariantAttributes de
 * features/products/variant-schemas).
 *
 * Antes la superficie foto solo pasaba `{ magnet: liveMagnet }` al
 * `variantLabel` de la modal, así que un calendario sin imán o una Polaroid
 * con estilo/marco/idioma no mostraba su desglose completo mientras nombre y
 * letras sí ("5×7 cm · Con imán · Español"). Acá se resuelven los attributes
 * efectivos — el personalizationSchema YA llega mergeado variante-sobre-
 * producto desde page.tsx (mergeVariantOverProduct) — más los overrides VIVOS
 * del canvas en los packs de foto (photoSlots/sizeCm/magnet, que el cliente
 * ajusta en el Estudio y no en la PDP).
 *
 * `omit` declara las dimensiones que el resumen propio de la modal YA enuncia
 * (la superficie foto pasa slotCount/sizeCm a StudioPreviewModal y su línea de
 * resumen dice "Calendario personalizado · 12 páginas · 📐 7.5×10"): repetirlas
 * en el desglose ("12 fotos · 7.5×10 cm") sería ruido duplicado en líneas
 * contiguas, no más información.
 *
 * Los attributes se extraen CLAVE A CLAVE con guards de tipo (no safeParse del
 * schema entero): el personalizationSchema trae muchas claves ajenas a la
 * variante (gridCols, backOptional, frameOptions…) y un tipo disonante en una
 * de ellas no debe tirar el desglose completo.
 *
 * Módulo PURO (client-safe, igual que describeVariantAttributes) → testeable
 * sin montar el editor.
 */

import {
  describeVariantAttributes,
  type ProductVariantAttributes,
} from "@/features/products/variant-schemas";

/** Dimensiones del desglose que la modal de foto puede ya estar mostrando. */
export type PreviewLabelOmittable = "quantity" | "photoSlots" | "sizeCm";

const SHAPES = new Set(["rectangle", "circle", "heart", "custom"]);
const FINISHES = new Set(["matte", "glossy", "soft-touch", "glass"]);
const LANGUAGES = new Set(["es", "en"]);

/**
 * Attributes efectivos de la variante para el desglose: los del schema mergeado
 * (variante sobre producto, hecho en page.tsx) con los overrides vivos del
 * canvas por encima. Solo se leen las claves que describeVariantAttributes
 * sabe describir; cualquier otra clave del schema se ignora.
 */
export function effectivePreviewAttributes(opts: {
  mergedSchema: unknown;
  live?: { photoSlots?: number; sizeCm?: string; magnet?: boolean };
}): ProductVariantAttributes {
  const schema = (opts.mergedSchema ?? {}) as Record<string, unknown>;
  const attrs: ProductVariantAttributes = {};
  if (typeof schema.quantity === "number" && Number.isInteger(schema.quantity))
    attrs.quantity = schema.quantity;
  if (typeof schema.photoSlots === "number" && Number.isInteger(schema.photoSlots))
    attrs.photoSlots = schema.photoSlots;
  if (typeof schema.sizeCm === "string" && schema.sizeCm) attrs.sizeCm = schema.sizeCm;
  if (typeof schema.shape === "string" && SHAPES.has(schema.shape))
    attrs.shape = schema.shape as ProductVariantAttributes["shape"];
  if (typeof schema.finish === "string" && FINISHES.has(schema.finish))
    attrs.finish = schema.finish as ProductVariantAttributes["finish"];
  if (typeof schema.color === "string" && schema.color) attrs.color = schema.color;
  if (typeof schema.magnet === "boolean") attrs.magnet = schema.magnet;
  if (typeof schema.language === "string" && LANGUAGES.has(schema.language))
    attrs.language = schema.language as ProductVariantAttributes["language"];
  if (typeof schema.frameStyle === "string" && schema.frameStyle)
    attrs.frameStyle = schema.frameStyle as ProductVariantAttributes["frameStyle"];
  if (typeof schema.variantStyle === "string" && schema.variantStyle)
    attrs.variantStyle = schema.variantStyle as ProductVariantAttributes["variantStyle"];
  if (typeof schema.theme === "string" && schema.theme)
    attrs.theme = schema.theme as ProductVariantAttributes["theme"];

  // Overrides VIVOS del canvas (packs de foto: el N de fotos del stepper, el
  // tamaño efectivo y el "¿Con imán?" persistido en el canvasData).
  const live = opts.live;
  if (live) {
    if (typeof live.photoSlots === "number" && Number.isInteger(live.photoSlots))
      attrs.photoSlots = live.photoSlots;
    if (typeof live.sizeCm === "string" && live.sizeCm) attrs.sizeCm = live.sizeCm;
    if (typeof live.magnet === "boolean") attrs.magnet = live.magnet;
  }
  return attrs;
}

/**
 * Línea de desglose para el `variantLabel` de la Vista Previa
 * ("Con imán · Español", "Corazón · Brillante"…). undefined cuando no hay
 * nada que describir tras omitir lo que la modal ya enuncia.
 */
export function studioPreviewVariantLabel(opts: {
  mergedSchema: unknown;
  live?: { photoSlots?: number; sizeCm?: string; magnet?: boolean };
  omit?: ReadonlyArray<PreviewLabelOmittable>;
}): string | undefined {
  const attrs = effectivePreviewAttributes(opts);
  for (const key of opts.omit ?? []) delete attrs[key];
  return describeVariantAttributes(attrs).join(" · ") || undefined;
}
