/* Builder puro del JSON-LD `Product` del PDP (schema.org). */

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
  } = input;

  return {
    "@context": "https://schema.org/",
    "@type": "Product",
    name,
    description: description.slice(0, 5000),
    sku,
    image: images.length > 0 ? images : [`${SITE_URL}/brand/lucams-logo.png`],
    category: categoryName,
    brand: { "@type": "Brand", name: "Lucams Shop" },
    // aggregateRating solo si hay reseñas reales aprobadas (Google rechaza rating vacío/inventado).
    ...(ratingAggregate
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: ratingAggregate.ratingValue.toFixed(1),
            reviewCount: ratingAggregate.reviewCount,
          },
        }
      : {}),
    offers: buildOffers({ slug, effectivePrices, priceValidUntil, outOfStock }),
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
    seller: { "@type": "Organization", name: "Lucams Shop" },
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
