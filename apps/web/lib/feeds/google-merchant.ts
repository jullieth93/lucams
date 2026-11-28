/*
 * Builder PURO del feed de productos para Google Merchant Center (RSS 2.0 + namespace g:).
 *
 * Vive fuera del route handler (app/feeds/google-merchant.xml/route.ts) para testearlo sin
 * Next ni DB. Recibe los productos YA filtrados por el gate storefront
 * (STOREFRONT_PRODUCT_WHERE) y con variantes activas; emite UN <item> por VARIANTE activa,
 * porque el precio correcto es el de la variante (variant.price ?? basePrice) — mismo
 * criterio que el JSON-LD del PDP (app/producto/[slug]/product-jsonld.ts).
 *
 * Decisiones (auditoría SEO 2026-10-28, E11):
 *   - g:item_group_id = slug del producto: Merchant agrupa las variantes como opciones
 *     del mismo producto.
 *   - g:id = sku de la variante (único globalmente por constraint Prisma).
 *   - link = PDP absoluta + "?variant=<id>" — deep-link que preselecciona la opción
 *     (soportado por la PDP, page.tsx: requestedVariantId), así el precio/disponibilidad
 *     que ve el cliente al llegar coincide con el del item del feed.
 *   - g:identifier_exists = "no": productos artesanales/personalizados SIN GTIN/MPN.
 *     Prohibido inventarlos (política del repo); "no" es el valor honesto y Merchant
 *     lo acepta para este tipo de catálogo.
 *   - g:price en PESOS ("45000 COP"): la DB guarda centavos (Int, mandato del repo) y
 *     Merchant quiere la unidad mayor. Mismo toFixed(0) que el JSON-LD.
 *   - NO se emite g:shipping ni políticas de devolución: se configuran a nivel cuenta en
 *     la UI de Merchant Center (acción humana) — inventarlas acá contradiría la realidad.
 *   - Si ni la variante ni el producto tienen imagen, se OMITE g:image_link (Merchant
 *     lo reporta como warning del item, no rompe el feed) — no se inventa una URL.
 *
 * Spec: https://support.google.com/merchants/answer/7052112 (RSS 2.0, namespace g:).
 */

import { netAvailableStock } from "@/features/products/fulfillment";

export type GoogleMerchantFeedVariant = {
  /** id cuid — se usa en el deep-link ?variant= de la PDP. */
  id: string;
  /** SKU único global → g:id. */
  sku: string;
  name: string;
  /** Precio override en CENTAVOS COP; null = hereda product.basePrice. */
  price: number | null;
  stock: number;
  /** Reserva de seguridad frente a canales externos y feeds (0 por defecto). */
  safetyStock?: number;
  /** Fotos propias de la opción; [] = hereda product.images. */
  images: string[];
};

export type GoogleMerchantFeedProduct = {
  slug: string;
  name: string;
  description: string;
  /** CENTAVOS COP (Int), jamás float. */
  basePrice: number;
  fulfillmentMode: "MADE_TO_ORDER" | "PHYSICAL_STOCK";
  /** Categoría real del producto (ej. "Fotoimanes" o "Padre > Hija") → g:product_type. */
  categoryPath?: string | null;
  /** URLs absolutas (Supabase Storage). */
  images: string[];
  /** Solo variantes activas y no archivadas (el query del route las filtra). */
  variants: GoogleMerchantFeedVariant[];
};

/**
 * Nombres de variante "triviales" (la opción autocreada 1:1 del producto — ver
 * features/products/service.ts, que la crea como "Default"). Cuando la variante es
 * trivial el title del item es solo el nombre del producto: "Producto — Default"
 * ensucia el listado de Shopping. Mismo universo que selectableVariants
 * ("Default"/"Única") + "Estándar" (label de generateVariantLabel para attrs vacíos).
 */
const TRIVIAL_VARIANT_NAMES: ReadonlySet<string> = new Set([
  "default",
  "única",
  "unica",
  "estándar",
  "estandar",
]);

/** Límite de Merchant para g:description. */
const DESCRIPTION_MAX_CHARS = 5000;
/** Límite de Merchant para g:product_type (spec Google Merchant Center). */
const PRODUCT_TYPE_MAX_CHARS = 750;
/** Límite oficial de Merchant para g:additional_image_link por ítem. */
const MAX_ADDITIONAL_IMAGES = 10;

/** Escape XML de los 5 caracteres especiales (texto y atributos). */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * g:description pide texto plano: strippea tags HTML (la descripción del admin puede
 * traer markup), colapsa whitespace y trunca al límite de Merchant (5000 — mismo tope
 * que usa el JSON-LD del PDP).
 */
function plainDescription(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, DESCRIPTION_MAX_CHARS);
}

/**
 * Normaliza una URL de imagen a absoluta. Las imágenes propias de la variante van primero
 * y luego las de la galería del producto, sin duplicados: la primera alimenta `g:image_link`
 * y hasta 10 adicionales alimentan `g:additional_image_link` (Shopping Graph / Modo IA).
 */
function resolveItemImages(
  variantImages: string[],
  productImages: string[],
  siteUrl: string,
): { primary: string | null; additional: string[] } {
  const seen = new Set<string>();
  const resolved: string[] = [];
  for (const raw of [...variantImages, ...productImages]) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const abs =
      trimmed.startsWith("http://") || trimmed.startsWith("https://")
        ? trimmed
        : `${siteUrl}${trimmed}`;
    if (seen.has(abs)) continue;
    seen.add(abs);
    resolved.push(abs);
  }
  const [primary = null, ...rest] = resolved;
  return { primary, additional: rest.slice(0, MAX_ADDITIONAL_IMAGES) };
}

/** Item del feed = UNA variante. Devuelve "" si la variante no es publicable (sin sku). */
function buildItem(
  product: GoogleMerchantFeedProduct,
  variant: GoogleMerchantFeedVariant,
  siteUrl: string,
): string {
  const isTrivial = TRIVIAL_VARIANT_NAMES.has(variant.name.trim().toLowerCase());
  const title = isTrivial ? product.name : `${product.name} — ${variant.name}`;
  // Precio efectivo en pesos (entero): override de la variante o basePrice.
  const priceCop = ((variant.price ?? product.basePrice) / 100).toFixed(0);
  const link = `${siteUrl}/producto/${product.slug}?variant=${encodeURIComponent(variant.id)}`;
  const { primary: imageUrl, additional: additionalImages } = resolveItemImages(
    variant.images,
    product.images,
    siteUrl,
  );
  const productType = product.categoryPath?.trim().slice(0, PRODUCT_TYPE_MAX_CHARS) || null;

  const inStock =
    product.fulfillmentMode === "MADE_TO_ORDER" ||
    netAvailableStock(variant.stock, variant.safetyStock ?? 0) > 0;

  const lines = [
    `      <g:id>${escapeXml(variant.sku)}</g:id>`,
    `      <title>${escapeXml(title)}</title>`,
    `      <g:description>${escapeXml(plainDescription(product.description))}</g:description>`,
    `      <link>${escapeXml(link)}</link>`,
    ...(imageUrl ? [`      <g:image_link>${escapeXml(imageUrl)}</g:image_link>`] : []),
    ...additionalImages.map(
      (url) => `      <g:additional_image_link>${escapeXml(url)}</g:additional_image_link>`,
    ),
    `      <g:availability>${inStock ? "in stock" : "out of stock"}</g:availability>`,
    `      <g:price>${priceCop} COP</g:price>`,
    `      <g:brand>Lucams Shop</g:brand>`,
    `      <g:condition>new</g:condition>`,
    ...(productType ? [`      <g:product_type>${escapeXml(productType)}</g:product_type>`] : []),
    // Artesanales/personalizados sin GTIN/MPN — NO inventar identificadores.
    `      <g:identifier_exists>no</g:identifier_exists>`,
    `      <g:item_group_id>${escapeXml(product.slug)}</g:item_group_id>`,
  ];
  return `    <item>\n${lines.join("\n")}\n    </item>`;
}

/**
 * Emite el documento RSS 2.0 completo. `siteUrl` = dominio canónico SIN trailing slash
 * (el route pasa getCanonicalSiteUrl()). Productos sin variantes activas no generan
 * items (un producto "sin opciones" ya está excluido del storefront por el gate de la
 * PDP; acá simplemente no hay nada comprable que anunciar).
 */
export function buildGoogleMerchantFeed(
  products: GoogleMerchantFeedProduct[],
  opts: { siteUrl: string; feedTitle?: string; feedDescription?: string },
): string {
  const siteUrl = opts.siteUrl.replace(/\/+$/, "");
  const items = products.flatMap((p) => p.variants.map((v) => buildItem(p, v, siteUrl)));

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">`,
    `  <channel>`,
    `    <title>${escapeXml(opts.feedTitle ?? "Lucams Shop")}</title>`,
    `    <link>${escapeXml(siteUrl)}</link>`,
    `    <description>${escapeXml(
      opts.feedDescription ?? "Catálogo de Lucams Shop — productos personalizados",
    )}</description>`,
    ...items,
    `  </channel>`,
    `</rss>`,
    ``,
  ].join("\n");
}
