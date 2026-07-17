import { describe, expect, it } from "vitest";
import { SITE_URL, breadcrumbList, collectionPage, escapeJsonLd } from "./structured-data";

describe("escapeJsonLd", () => {
  it("escapa <, > y & para no romper el <script> ni inyectar", () => {
    const out = escapeJsonLd({ name: "</script><b>&amp;" });
    expect(out).not.toContain("</script>");
    expect(out).not.toContain("<b>");
    expect(out).toContain("\\u003c");
    expect(out).toContain("\\u003e");
    expect(out).toContain("\\u0026");
    // Sigue siendo JSON válido tras des-escapar los unicode.
    expect(JSON.parse(out)).toEqual({ name: "</script><b>&amp;" });
  });
});

describe("breadcrumbList", () => {
  it("numera las posiciones desde 1 y prefija el SITE_URL", () => {
    const bc = breadcrumbList([
      { name: "Inicio", path: "/" },
      { name: "Tienda", path: "/productos" },
    ]);
    expect(bc["@type"]).toBe("BreadcrumbList");
    expect(bc.itemListElement).toHaveLength(2);
    expect(bc.itemListElement[0]).toMatchObject({
      position: 1,
      name: "Inicio",
      item: `${SITE_URL}/`,
    });
    expect(bc.itemListElement[1]).toMatchObject({
      position: 2,
      item: `${SITE_URL}/productos`,
    });
  });
});

describe("collectionPage", () => {
  it("arma CollectionPage + ItemList con URLs absolutas de producto", () => {
    const cp = collectionPage({
      name: "Fotoimanes",
      path: "/productos?categoria=fotoimanes",
      description: "desc",
      products: [
        { name: "Imán A", slug: "iman-a" },
        { name: "Imán B", slug: "iman-b" },
      ],
    });
    expect(cp["@type"]).toBe("CollectionPage");
    expect(cp.url).toBe(`${SITE_URL}/productos?categoria=fotoimanes`);
    expect(cp.mainEntity.numberOfItems).toBe(2);
    expect(cp.mainEntity.itemListElement[0]).toMatchObject({
      position: 1,
      name: "Imán A",
      url: `${SITE_URL}/producto/iman-a`,
    });
  });

  it("omite description si no se pasa", () => {
    const cp = collectionPage({ name: "x", path: "/productos", products: [] });
    expect("description" in cp).toBe(false);
    expect(cp.mainEntity.numberOfItems).toBe(0);
  });
});
