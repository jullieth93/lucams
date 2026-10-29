/*
 * GET /feeds/google-merchant.xml — feed de productos para Google Merchant Center
 * (auditoría SEO 2026-10-28, E11).
 *
 * REGISTRO EN MERCHANT CENTER (acción humana, fuera del repo):
 *   1. En Google Merchant Center → Products → Feeds → "Add primary feed".
 *   2. Método "Scheduled fetch" apuntando a la URL ABSOLUTA de este endpoint en el
 *      dominio canónico:  https://<dominio>/feeds/google-merchant.xml
 *      (Google la descarga periódicamente; no requiere subir archivo manual).
 *   3. País de venta: Colombia; idioma: español.
 *   4. SHIPPING y RETURNS NO van en el feed: se configuran a nivel cuenta en la UI de
 *      Merchant (Settings → Shipping and returns) — acción humana del owner, porque los
 *      tiempos/costos reales dependen de Aveonline y de la política comercial. NO
 *      inventar esos valores en el XML.
 *
 * Decisiones técnicas:
 *   - `force-dynamic` + `Cache-Control: s-maxage=3600`: el stock cambia con CADA venta,
 *     así que no usamos el data cache de Next (`revalidate = 3600` cachearía TAMBIÉN una
 *     respuesta de error). En su defecto el handler siempre consulta la DB fresca en
 *     origen y deja que el CDN de Vercel retenga la respuesta 1h (staleness aceptable
 *     para un feed que Google refetchea en su propio schedule). Los errores salen con
 *     `no-store` para que el CDN no retenga un 503.
 *   - En modo catálogo (isCatalogMode) el feed NO EXISTE → 404: sin checkout no hay nada
 *     comprable que anunciar en Shopping (misma lógica que el JSON-LD del PDP, que en
 *     ese modo omite `offers`).
 *   - El query espeja el gate del sitemap/storefront (STOREFRONT_PRODUCT_WHERE, F-04):
 *     producto activo, no archivado, con categoría activa; variantes activas y no
 *     archivadas.
 *   - DB caída → 503 + Retry-After (Merchant reintenta solo; un 500/HTML rompería el
 *     parseo del scheduled fetch).
 *
 * robots.ts NO bloquea /feeds/ (solo /admin/, /api/, /auth/, /mi-cuenta/) y el feed NO
 * se agrega al sitemap (no es contenido indexable para usuarios; lo consume Merchant).
 */

import { prisma } from "@/lib/db";
import { getCanonicalSiteUrl } from "@/lib/public-url";
import { isCatalogMode } from "@/lib/store-mode";
import { STOREFRONT_PRODUCT_WHERE } from "@/features/products/storefront-visibility";
import { buildGoogleMerchantFeed } from "@/lib/feeds/google-merchant";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  // Modo catálogo: sin venta en línea el feed no debe existir (ver header).
  if (isCatalogMode()) {
    return new Response("Not found", { status: 404 });
  }

  let xml: string;
  try {
    const products = await prisma.product.findMany({
      where: STOREFRONT_PRODUCT_WHERE,
      orderBy: { createdAt: "asc" },
      select: {
        slug: true,
        name: true,
        description: true,
        basePrice: true,
        images: true,
        // Misma regla de la PDP: solo opciones activas y no archivadas.
        variants: {
          where: { deletedAt: null, isActive: true },
          orderBy: { createdAt: "asc" },
          select: { id: true, sku: true, name: true, price: true, stock: true, images: true },
        },
      },
    });
    xml = buildGoogleMerchantFeed(products, { siteUrl: getCanonicalSiteUrl() });
  } catch {
    // DB inalcanzable: 503 transitorio, NO cacheable — el CDN no debe retener un error
    // como si fuera el feed (Merchant reintenta el scheduled fetch por su cuenta).
    return new Response("Service unavailable", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }

  return new Response(xml, {
    status: 200,
    headers: {
      "content-type": "application/xml; charset=utf-8",
      // 1h en CDN (Vercel honra s-maxage); el origen siempre consulta fresco.
      "cache-control": "public, s-maxage=3600, stale-while-revalidate=3600",
    },
  });
}
