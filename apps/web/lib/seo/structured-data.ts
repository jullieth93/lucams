/*
 * Helpers de datos estructurados (JSON-LD schema.org) compartidos por el PDP y las páginas de
 * listado/categoría/ocasión. Antes el patrón (escape XSS + shape) vivía inline solo en el PDP; los
 * listados no emitían NADA → Google no obtenía ItemList/CollectionPage ni migas de esas páginas
 * (auditoría 2026-07-17). Builders PUROS (unit-testables); el render + nonce va en <JsonLd>.
 */

import { getCanonicalSiteUrl } from "@/lib/public-url";

/** URL canónica pública del sitio (sin trailing slash). Única fuente: la misma env
 *  `NEXT_PUBLIC_SITE_URL` que alimenta robots/sitemap/canonicals (#28) — antes estaba
 *  hardcodeada acá y en el JSON-LD de la home (auditoría de info pública 2026-09-11). */
export const SITE_URL = getCanonicalSiteUrl();

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
 *
 * `itemUrlPrefix` (default "/producto/"): prefijo de la URL de cada ítem — el índice /ocasion
 * lista landings de ocasión, no PDPs (SEO-002, auditoría 2026-10-28).
 */
export function collectionPage(opts: {
  name: string;
  path: string;
  description?: string;
  products: { name: string; slug: string }[];
  itemUrlPrefix?: string;
}) {
  const itemUrlPrefix = opts.itemUrlPrefix ?? "/producto/";
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
        url: `${SITE_URL}${itemUrlPrefix}${p.slug}`,
      })),
    },
  };
}

/**
 * Convierte markdown ligero de CMS a texto plano limpio para JSON-LD (`FAQPage`),
 * garantizando alineación con el contenido visible sin exponer sintaxis markdown/HTML.
 */
export function stripMarkdownForSchema(raw: string): string {
  return raw
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/[`*_~>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Schema.org `FAQPage` para `/ayuda`: solo debe recibir las preguntas y respuestas
 * efectivamente visibles en la página (regla oficial de alineación de Google).
 * Devuelve `null` si no quedan preguntas válidas.
 */
export function faqPage(items: { question: string; answer: string }[]) {
  const mainEntity = items
    .map((item) => ({
      question: stripMarkdownForSchema(item.question),
      answer: stripMarkdownForSchema(item.answer),
    }))
    .filter((item) => item.question.length > 0 && item.answer.length > 0)
    .map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    }));
  if (mainEntity.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity,
  };
}
