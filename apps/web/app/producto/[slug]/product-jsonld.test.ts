/*
 * Tests de buildProductJsonLd — datos estructurados del PDP.
 *
 * FOCO: el gate por modo de tienda. En Etapa 1 (catálogo + cotización por WhatsApp) no hay
 * checkout de pago: si el JSON-LD emite `offers` con `availability: InStock` + `seller`, Google
 * entiende que el producto se compra acá y puede generar rich results de precio/disponibilidad
 * (y listados de Shopping) sobre una tienda que solo cotiza — información engañosa (Ley 1480).
 * El resto del Product (nombre, descripción, SKU, imágenes, marca, rating real) sí es cierto en
 * ambos modos y debe seguir emitiéndose.
 */

import { describe, expect, it } from "vitest";
import { buildProductJsonLd, type ProductJsonLdInput } from "./product-jsonld";

const BASE: ProductJsonLdInput = {
  name: "Imán Polaroid",
  description: "Imán con tu foto",
  sku: "IMA-001",
  slug: "iman-polaroid",
  images: ["/productos/iman-polaroid.jpg"],
  categoryName: "Imanes",
  ratingAggregate: null,
  // Centavos COP (enteros), como todo precio del proyecto.
  effectivePrices: [1_500_000],
  priceValidUntil: "2027-07-24",
  outOfStock: false,
  catalogMode: false,
};

describe("buildProductJsonLd — modo catálogo (Etapa 1)", () => {
  it("NO emite offers: la tienda solo cotiza por WhatsApp", () => {
    const jsonLd = buildProductJsonLd({ ...BASE, catalogMode: true });
    expect(jsonLd).not.toHaveProperty("offers");
    expect(JSON.stringify(jsonLd)).not.toContain("InStock");
  });

  it("conserva el resto del Product, que sí es cierto sin checkout", () => {
    const jsonLd = buildProductJsonLd({
      ...BASE,
      catalogMode: true,
      ratingAggregate: { ratingValue: 4.5, reviewCount: 12 },
    });
    expect(jsonLd).toMatchObject({
      "@type": "Product",
      name: "Imán Polaroid",
      description: "Imán con tu foto",
      sku: "IMA-001",
      category: "Imanes",
      brand: { "@type": "Brand", name: "Lucams_shop" },
      image: ["/productos/iman-polaroid.jpg"],
      aggregateRating: { "@type": "AggregateRating", ratingValue: "4.5", reviewCount: 12 },
    });
  });

  it("tampoco emite AggregateOffer cuando hay rango de precios", () => {
    const jsonLd = buildProductJsonLd({
      ...BASE,
      catalogMode: true,
      effectivePrices: [1_500_000, 2_500_000],
    });
    expect(jsonLd).not.toHaveProperty("offers");
  });
});

describe("buildProductJsonLd — modo full (Etapa 2)", () => {
  it("emite Offer con el precio en pesos y disponibilidad InStock", () => {
    const jsonLd = buildProductJsonLd(BASE);
    expect(jsonLd.offers).toEqual({
      "@type": "Offer",
      url: "https://lucamsshop.com/producto/iman-polaroid",
      priceCurrency: "COP",
      price: "15000",
      priceValidUntil: "2027-07-24",
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@type": "Organization", name: "Lucams_shop" },
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
});
