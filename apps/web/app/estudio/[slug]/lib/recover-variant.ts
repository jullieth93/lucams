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
 *  - Diseños previos a la clave (y packs de foto, cuya variante exacta se deriva
 *    del canvasData en el carrito) → undefined: la página cae a la primera
 *    variante, el comportamiento histórico.
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
