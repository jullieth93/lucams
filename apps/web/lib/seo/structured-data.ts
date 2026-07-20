/*
 * Helpers de datos estructurados (JSON-LD schema.org) compartidos por el PDP y las páginas de
 * listado/categoría/ocasión. Antes el patrón (escape XSS + shape) vivía inline solo en el PDP; los
 * listados no emitían NADA → Google no obtenía ItemList/CollectionPage ni migas de esas páginas
 * (auditoría 2026-07-17). Builders PUROS (unit-testables); el render + nonce va en <JsonLd>.
 */

/** URL canónica pública del sitio (sin trailing slash). Coincide con robots/sitemap/canonicals. */
export const SITE_URL = "https://lucamsshop.com";

/**
 * Escapa `<`, `>`, `&` del JSON embebido en un `<script type="application/ld+json">`. Sin esto, un
 * nombre/descripción con `</script>` o `<` podría romper el tag o inyectar (XSS) — `JSON.stringify`
 * no los escapa. Devuelve el string listo para `dangerouslySetInnerHTML`.
 */
export function escapeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

/** BreadcrumbList a partir de una ruta de migas (name + path relativo). */
export function breadcrumbList(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org/",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: `${SITE_URL}${it.path}`,
    })),
  };
}

/**
 * CollectionPage + ItemList de una página de listado/categoría (los productos visibles). Google usa
 * el ItemList para entender que es una colección y puede mostrar carruseles/listados.
 */
export function collectionPage(opts: {
  name: string;
  path: string;
  description?: string;
  products: { name: string; slug: string }[];
}) {
  return {
    "@context": "https://schema.org/",
    "@type": "CollectionPage",
    name: opts.name,
    ...(opts.description ? { description: opts.description } : {}),
    url: `${SITE_URL}${opts.path}`,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: opts.products.length,
      itemListElement: opts.products.map((p, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: p.name,
        url: `${SITE_URL}/producto/${p.slug}`,
      })),
    },
  };
}
