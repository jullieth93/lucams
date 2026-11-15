import { describe, expect, it } from "vitest";
import { SITE_URL } from "@/lib/seo/structured-data";
import { buildProductJsonLd, type ProductJsonLdInput } from "./product-jsonld";

const BASE: ProductJsonLdInput = {
  name: "Imán Polaroid",
  description: "Imán con tu foto",
  sku: "IMA-001",
  slug: "iman-polaroid",
  images: ["/productos/iman-polaroid.jpg"],
  categoryName: "Imanes",
  ratingAggregate: null,
  effectivePrices: [1_500_000],
  priceValidUntil: "2027-07-24",
  outOfStock: false,
};

describe("buildProductJsonLd", () => {
  it("emite Offer con el precio en pesos y disponibilidad InStock", () => {
    const jsonLd = buildProductJsonLd(BASE);
    expect(jsonLd.offers).toEqual({
      "@type": "Offer",
      url: `${SITE_URL}/producto/iman-polaroid`,
      priceCurrency: "COP",
      price: "15000",
      priceValidUntil: "2027-07-24",
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@type": "Organization", name: "Lucams Shop" },
    });
  });

  it("emite AggregateOffer con el rango cuando las opciones tienen precios distintos", () => {
    const jsonLd = buildProductJsonLd({ ...BASE, effectivePrices: [1_500_000, 2_500_000] });
    expect(jsonLd.offers).toMatchObject({
      "@type": "AggregateOffer",
      lowPrice: "15000",
      highPrice: "25000",
    });
  });

  it("marca OutOfStock cuando no queda stock", () => {
    const jsonLd = buildProductJsonLd({ ...BASE, outOfStock: true });
    expect(jsonLd.offers).toMatchObject({ availability: "https://schema.org/OutOfStock" });
  });

  it("omite aggregateRating cuando el producto no tiene reseñas aprobadas", () => {
    const jsonLd = buildProductJsonLd(BASE);
    expect(jsonLd).not.toHaveProperty("aggregateRating");
  });

  it("incluye el rating real cuando existen reseñas aprobadas", () => {
    const jsonLd = buildProductJsonLd({
      ...BASE,
      ratingAggregate: { ratingValue: 4.5, reviewCount: 12 },
    });
    expect(jsonLd.aggregateRating).toEqual({
      "@type": "AggregateRating",
      ratingValue: "4.5",
      reviewCount: 12,
    });
  });

  it("usa el logo de marca como imagen ABSOLUTA cuando el producto no tiene fotos", () => {
    const jsonLd = buildProductJsonLd({ ...BASE, images: [] });
    expect(jsonLd.image).toEqual([`${SITE_URL}/brand/lucams-logo.png`]);
    expect((jsonLd.image as string[])[0]).toMatch(/^https?:\/\//);
    expect((jsonLd.image as string[])[0]).toMatch(/\/brand\/lucams-logo\.png$/);
  });
});
