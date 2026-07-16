/*
 * robots.txt — define qué pueden rastrear los crawlers.
 *
 * Permitimos todo el storefront. Bloqueamos:
 *   - /admin/*       → área privada admin
 *   - /api/*         → endpoints internos (excepción /api/cms/* es
 *                      public-readable pero no nos interesa indexarlo)
 *   - /mi-cuenta/*   → área privada cliente
 *   - /auth/*        → endpoints internos de auth
 *   - /_next/*       → assets de Next (sirve por CDN, no duplicar)
 *   - /maintenance   → página estática solo activa en mantenimiento
 *   - Páginas con search/filtros parametrizados que generan dup content
 *
 * Ref: https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots
 */

import type { MetadataRoute } from "next";
import { getSettingValue } from "@/lib/cms";

export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const baseUrl = await getSettingValue("SITE_URL", "https://lucamsshop.co");

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
          "/_next/",
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
