/**
 * Recover flow (?designId=) — resuelve la variante con la que entrar al Estudio.
 *
 * La variante con la que se creó el diseño viaja en `Design.metadata.variantId`
 * (2026-10-05): el link «Editar» del carrito solo trae designId y sin esta clave
 * la página caía a la PRIMERA variante del producto, mostrando el precio equivocado
 * en productos con varias variantes.
 *
 * Reglas:
 *  - Un `?variant=` explícito en la URL siempre manda (deep-link de la PDP).
 *  - El variantId de metadata solo se acepta si sigue existiendo entre las
 *    variantes del producto (una archivada cae al fallback, nunca a un id colgado).
 *  - Packs de foto (2026-10-12): el Estudio persiste la variante EFECTIVA (match
 *    del N de fotos + magnet del canvas) en metadata al crear y en cada auto-save
 *    (saveCanvas) → el recover reabre con ELLA. Diseños de pack LEGACY sin la
 *    clave → undefined: la página cae a la primera variante y el canvasData sigue
 *    mandando sobre photoSlots/sizeCm/magnet efectivos (fallback histórico; el
 *    cobro siempre deriva la variante del canvasData en el servidor).
 */
export function resolveRecoverVariantId(opts: {
  urlVariantId?: string;
  designMetadata: unknown;
  productVariantIds: string[];
}): string | undefined {
  if (opts.urlVariantId) return opts.urlVariantId;
  const meta = opts.designMetadata as { variantId?: unknown } | null;
  const id = meta && typeof meta.variantId === "string" ? meta.variantId : undefined;
  return id && opts.productVariantIds.includes(id) ? id : undefined;
}
