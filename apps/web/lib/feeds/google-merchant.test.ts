// @vitest-environment jsdom
/*
 * Tests del builder del feed Google Merchant (lib/feeds/google-merchant.ts).
 * jsdom solo para validar que el XML es parseable con DOMParser (environment "node"
 * del config no tiene DOMParser); el resto de las aserciones son de string.
 */

import { describe, expect, it } from "vitest";
import {
  buildGoogleMerchantFeed,
  escapeXml,
  type GoogleMerchantFeedProduct,
} from "./google-merchant";

const SITE_URL = "https://lucamsshop.com";

function makeProduct(
  overrides: Partial<GoogleMerchantFeedProduct> = {},
): GoogleMerchantFeedProduct {
  return {
    slug: "set-fotoimanes",
    name: "Set de Fotoimanes",
    description: "Imanes personalizados con tus fotos.",
    basePrice: 4_500_000, // centavos → $45.000
    images: ["https://cdn.example.com/producto.jpg"],
    variants: [],
    ...overrides,
  };
}

function parseXml(xml: string): Document {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  // DOMParser no lanza: reporta el error como nodo <parsererror>.
  expect(doc.querySelector("parsererror")).toBeNull();
  return doc;
}

describe("escapeXml", () => {
  it("escapa los 5 caracteres especiales", () => {
    expect(escapeXml(`a & b < c > d "e" 'f'`)).toBe(
      "a &amp; b &lt; c &gt; d &quot;e&quot; &apos;f&apos;",
    );
  });
});

describe("buildGoogleMerchantFeed", () => {
  it("emite un RSS 2.0 con namespace g: parseable", () => {
    const xml = buildGoogleMerchantFeed([makeProduct()], { siteUrl: SITE_URL });
    const doc = parseXml(xml);
    const rss = doc.querySelector("rss");
    expect(rss?.getAttribute("version")).toBe("2.0");
    expect(rss?.getAttribute("xmlns:g")).toBe("http://base.google.com/ns/1.0");
    expect(doc.querySelector("channel > link")?.textContent).toBe(SITE_URL);
  });

  it("un item por variante, con item_group_id = slug del producto", () => {
    const xml = buildGoogleMerchantFeed(
      [
        makeProduct({
          variants: [
            { id: "v1", sku: "SKU-6", name: "6 unidades", price: null, stock: 5, images: [] },
            {
              id: "v2",
              sku: "SKU-12",
              name: "12 unidades",
              price: 7_000_000,
              stock: 0,
              images: [],
            },
          ],
        }),
      ],
      { siteUrl: SITE_URL },
    );
    const doc = parseXml(xml);
    const items = [...doc.querySelectorAll("item")];
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.querySelector("g\\:id, id")?.textContent)).toEqual([
      "SKU-6",
      "SKU-12",
    ]);
    for (const item of items) {
      expect(item.querySelector("g\\:item_group_id, item_group_id")?.textContent).toBe(
        "set-fotoimanes",
      );
    }
  });

  it("hereda el precio del producto cuando la variante tiene price null (centavos → pesos COP)", () => {
    const xml = buildGoogleMerchantFeed(
      [
        makeProduct({
          basePrice: 4_500_000,
          variants: [
            { id: "v1", sku: "SKU-A", name: "6 unidades", price: null, stock: 1, images: [] },
            { id: "v2", sku: "SKU-B", name: "12 unidades", price: 7_050_000, stock: 1, images: [] },
          ],
        }),
      ],
      { siteUrl: SITE_URL },
    );
    const doc = parseXml(xml);
    const prices = [...doc.querySelectorAll("item")].map(
      (i) => i.querySelector("g\\:price, price")?.textContent,
    );
    expect(prices).toEqual(["45000 COP", "70500 COP"]);
  });

  it("title = producto + variante; variante trivial/Default queda solo con el nombre del producto", () => {
    const xml = buildGoogleMerchantFeed(
      [
        makeProduct({
          name: "Cuadro Personalizado",
          variants: [
            { id: "v1", sku: "SKU-D", name: "Default", price: null, stock: 3, images: [] },
          ],
        }),
        makeProduct({
          slug: "llavero",
          name: "Llavero",
          variants: [{ id: "v2", sku: "SKU-R", name: "Rojo", price: null, stock: 3, images: [] }],
        }),
      ],
      { siteUrl: SITE_URL },
    );
    const doc = parseXml(xml);
    const titles = [...doc.querySelectorAll("item")].map(
      (i) => i.querySelector("title")?.textContent,
    );
    expect(titles).toEqual(["Cuadro Personalizado", "Llavero — Rojo"]);
  });

  it("availability según stock (>0 in stock, 0 out of stock)", () => {
    const xml = buildGoogleMerchantFeed(
      [
        makeProduct({
          variants: [
            { id: "v1", sku: "SKU-OK", name: "6 unidades", price: null, stock: 2, images: [] },
            { id: "v2", sku: "SKU-OUT", name: "12 unidades", price: null, stock: 0, images: [] },
          ],
        }),
      ],
      { siteUrl: SITE_URL },
    );
    const doc = parseXml(xml);
    const availability = [...doc.querySelectorAll("item")].map(
      (i) => i.querySelector("g\\:availability, availability")?.textContent,
    );
    expect(availability).toEqual(["in stock", "out of stock"]);
  });

  it("imagen: la de la variante si tiene, si no hereda la del producto; omite si no hay", () => {
    const xml = buildGoogleMerchantFeed(
      [
        makeProduct({
          variants: [
            {
              id: "v1",
              sku: "SKU-OWN",
              name: "6 unidades",
              price: null,
              stock: 1,
              images: ["https://cdn.example.com/variante.jpg"],
            },
            { id: "v2", sku: "SKU-INH", name: "12 unidades", price: null, stock: 1, images: [] },
          ],
        }),
        makeProduct({
          slug: "sin-fotos",
          images: [],
          variants: [
            { id: "v3", sku: "SKU-NONE", name: "Única", price: null, stock: 1, images: [] },
          ],
        }),
      ],
      { siteUrl: SITE_URL },
    );
    const doc = parseXml(xml);
    const items = [...doc.querySelectorAll("item")];
    const imageOf = (i: Element) => i.querySelector("g\\:image_link, image_link")?.textContent;
    expect(imageOf(items[0]!)).toBe("https://cdn.example.com/variante.jpg");
    expect(imageOf(items[1]!)).toBe("https://cdn.example.com/producto.jpg");
    // Sin imagen propia ni del producto → el tag se omite (no se inventa una URL).
    expect(items[2]!.querySelector("g\\:image_link, image_link")).toBeNull();
  });

  it("link apunta a la PDP con deep-link ?variant=<id>", () => {
    const xml = buildGoogleMerchantFeed(
      [
        makeProduct({
          variants: [
            { id: "clxyz123", sku: "SKU-1", name: "6 unidades", price: null, stock: 1, images: [] },
          ],
        }),
      ],
      { siteUrl: SITE_URL },
    );
    const doc = parseXml(xml);
    expect(doc.querySelector("item > link")?.textContent).toBe(
      "https://lucamsshop.com/producto/set-fotoimanes?variant=clxyz123",
    );
  });

  it("identifier_exists = no y condition = new en todos los items (sin GTIN/MPN inventados)", () => {
    const xml = buildGoogleMerchantFeed(
      [
        makeProduct({
          variants: [
            { id: "v1", sku: "SKU-1", name: "6 unidades", price: null, stock: 1, images: [] },
          ],
        }),
      ],
      { siteUrl: SITE_URL },
    );
    const doc = parseXml(xml);
    const item = doc.querySelector("item")!;
    expect(item.querySelector("g\\:identifier_exists, identifier_exists")?.textContent).toBe("no");
    expect(item.querySelector("g\\:condition, condition")?.textContent).toBe("new");
    expect(item.querySelector("g\\:brand, brand")?.textContent).toBe("Lucams Shop");
    expect(item.querySelector("g\\:gtin, gtin")).toBeNull();
    expect(item.querySelector("g\\:mpn, mpn")).toBeNull();
  });

  it("escapa caracteres especiales y strippea HTML de la descripción", () => {
    const xml = buildGoogleMerchantFeed(
      [
        makeProduct({
          name: 'Imán "Corazón" & <Amor>',
          description: "<p>Hecho <b>a mano</b> & con amor.</p>",
          variants: [
            { id: "v1", sku: "SKU-1", name: "6 unidades", price: null, stock: 1, images: [] },
          ],
        }),
      ],
      { siteUrl: SITE_URL },
    );
    const doc = parseXml(xml);
    const item = doc.querySelector("item")!;
    // Parsea sin error (escape correcto) y el texto recuperado es el original.
    expect(item.querySelector("title")?.textContent).toBe('Imán "Corazón" & <Amor> — 6 unidades');
    expect(item.querySelector("g\\:description, description")?.textContent).toBe(
      "Hecho a mano & con amor.",
    );
    expect(xml).not.toContain("<b>");
  });

  it("trunca la descripción a 5000 caracteres", () => {
    const xml = buildGoogleMerchantFeed(
      [
        makeProduct({
          description: "x".repeat(6000),
          variants: [
            { id: "v1", sku: "SKU-1", name: "6 unidades", price: null, stock: 1, images: [] },
          ],
        }),
      ],
      { siteUrl: SITE_URL },
    );
    const doc = parseXml(xml);
    expect(doc.querySelector("item g\\:description, item description")?.textContent).toHaveLength(
      5000,
    );
  });

  it("producto sin variantes activas no genera items; canal vacío sigue siendo XML válido", () => {
    const xml = buildGoogleMerchantFeed([makeProduct({ variants: [] })], { siteUrl: SITE_URL });
    const doc = parseXml(xml);
    expect(doc.querySelectorAll("item")).toHaveLength(0);
  });
});
