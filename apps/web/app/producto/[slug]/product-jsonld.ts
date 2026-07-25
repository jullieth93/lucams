/*
 * Builder puro del JSON-LD `Product` del PDP (schema.org).
 *
 * Vive fuera de page.tsx porque la decisión "¿emitimos una oferta comprable?" depende del modo de
 * tienda y hay que poder testearla sin renderizar el RSC. El escape XSS, el nonce CSP y el render
 * los sigue haciendo <JsonLd>.
 *
 * Etapa 1 (modo catálogo): la tienda NO vende en línea, solo cotiza por WhatsApp. Emitir
 * `offers` con `availability: InStock` le decía a Google que el producto se puede comprar acá
 * → rich results de precio/disponibilidad y elegibilidad para listados de Shopping sobre una
 * tienda sin checkout. En ese modo se omite la oferta y queda solo lo que sí es cierto
 * (nombre, descripción, SKU, imágenes, categoría, marca y el rating real).
 */

import { SITE_URL } from "@/lib/seo/structured-data";

export type ProductJsonLdInput = {
  name: string;
  description: string;
  sku: string;
  slug: string;
  images: string[];
  categoryName: string;
  /** Rating REAL de reseñas aprobadas; null si el producto todavía no tiene. */
  ratingAggregate: { ratingValue: number; reviewCount: number } | null;
  /** Precios comprables en CENTAVOS COP (enteros), uno por opción seleccionable. */
  effectivePrices: number[];
  /** Fecha `yyyy-mm-dd` hasta la que se sostiene el precio publicado. */
  priceValidUntil: string;
  outOfStock: boolean;
  /** true = Etapa 1 (catálogo + cotización por WhatsApp) → sin Offer/AggregateOffer. */
  catalogMode: boolean;
};

export function buildProductJsonLd(input: ProductJsonLdInput): Record<string, unknown> {
  const {
    name,
    description,
    sku,
    slug,
    images,
    categoryName,
    ratingAggregate,
    effectivePrices,
    priceValidUntil,
    outOfStock,
    catalogMode,
  } = input;

  return {
    "@context": "https://schema.org/",
    "@type": "Product",
    name,
    description: description.slice(0, 5000),
    sku,
    image: images.length > 0 ? images : ["/brand/lucams-logo.png"],
    category: categoryName,
    brand: { "@type": "Brand", name: "Lucams_shop" },
    // aggregateRating solo si hay reseñas reales aprobadas (Google rechaza rating vacío/inventado).
    // El valor es visible en la página (sección Reseñas) — requisito de la política de rich results.
    ...(ratingAggregate
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: ratingAggregate.ratingValue.toFixed(1),
            reviewCount: ratingAggregate.reviewCount,
          },
        }
      : {}),
    // #17 — Offer (precio único) o AggregateOffer (rango) coincidente con el precio visible.
    ...(catalogMode
      ? {}
      : { offers: buildOffers({ slug, effectivePrices, priceValidUntil, outOfStock }) }),
  };
}

function buildOffers(opts: {
  slug: string;
  effectivePrices: number[];
  priceValidUntil: string;
  outOfStock: boolean;
}): Record<string, unknown> {
  const lowPrice = Math.min(...opts.effectivePrices);
  const highPrice = Math.max(...opts.effectivePrices);
  const availability = opts.outOfStock
    ? "https://schema.org/OutOfStock"
    : "https://schema.org/InStock";
  const common = {
    url: `${SITE_URL}/producto/${opts.slug}`,
    priceCurrency: "COP",
    priceValidUntil: opts.priceValidUntil,
    availability,
    itemCondition: "https://schema.org/NewCondition",
    seller: { "@type": "Organization", name: "Lucams_shop" },
  };
  // Los precios llegan en CENTAVOS COP (enteros); schema.org los quiere en pesos.
  return lowPrice === highPrice
    ? { "@type": "Offer", ...common, price: (lowPrice / 100).toFixed(0) }
    : {
        "@type": "AggregateOffer",
        ...common,
        lowPrice: (lowPrice / 100).toFixed(0),
        highPrice: (highPrice / 100).toFixed(0),
      };
}
