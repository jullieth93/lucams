/*
 * robots.txt — define qué pueden rastrear los crawlers.
 *
 * Permitimos todo el storefront. Bloqueamos:
 *   - /admin/*       → área privada admin
 *   - /api/*         → endpoints internos (excepción /api/cms/* es
 *                      public-readable pero no nos interesa indexarlo)
 *   - /mi-cuenta/*   → área privada cliente
 *   - /auth/*        → endpoints internos de auth
 *   - /maintenance   → página estática solo activa en mantenimiento
 *   - Páginas con search/filtros parametrizados que generan dup content
 *
 * /_next/ NO se bloquea (auditoría SEO 2026-10-28): no hay assetPrefix/CDN, así que
 * los JS/CSS del render y TODAS las imágenes de producto (optimizer `/_next/image`)
 * se sirven desde ahí. Bloquearlo impedía a Googlebot renderizar y a Googlebot-Image
 * rastrear el catálogo (guía JavaScript SEO de Google).
 *
 * Ref: https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots
 */

import type { MetadataRoute } from "next";
import { getCanonicalSiteUrl } from "@/lib/origin";

export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  // #28 — misma URL canónica que sitemap/canonicals/OG (antes SITE_URL del CMS → split-brain).
  const baseUrl = getCanonicalSiteUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin/",
          "/api/",
          "/auth/",
          "/mi-cuenta/",
          "/maintenance",
          // Nota (auditoría 2026-07-13): antes se bloqueaba "/productos?*", pero eso bloqueaba
          // también las páginas de categoría (?categoria=X) que el sitemap SÍ lista → se
          // contradecían. Ahora se permiten y el duplicate content de filtros/orden se maneja
          // con la URL canónica de /productos (generateMetadata canoniza a la categoría).
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
