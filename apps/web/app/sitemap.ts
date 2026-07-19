/*
 * sitemap.xml dinámico para Google/Bing crawlers.
 *
 * Incluye:
 *   - Páginas estáticas (home, /productos, /recomendador, 8 legales, /ayuda,
 *     /contacto)
 *   - Categorías raíz (filtro /productos?categoria=X)
 *   - Subcategorías con ruta jerárquica (/productos/[categoria]/[subcategoria])
 *   - Ocasiones activas (/ocasion/[slug])
 *   - Productos activos individuales (/producto/[slug])
 *
 * `lastModified` proviene de updatedAt en DB para productos y
 * categorías. Para páginas estáticas usamos build time (BUILD_VERSION
 * tag o hoy si no hay).
 *
 * Ref: https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap
 */

import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";
import { getCanonicalSiteUrl } from "@/lib/origin";

const STATIC_PATHS = [
  { path: "", priority: 1.0, changeFrequency: "daily" as const },
  { path: "productos", priority: 0.9, changeFrequency: "daily" as const },
  { path: "recomendador", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "rastrear", priority: 0.5, changeFrequency: "monthly" as const },
  { path: "ayuda", priority: 0.7, changeFrequency: "weekly" as const },
  { path: "contacto", priority: 0.6, changeFrequency: "monthly" as const },
  { path: "legal/privacidad", priority: 0.5, changeFrequency: "monthly" as const },
  { path: "legal/terminos", priority: 0.5, changeFrequency: "monthly" as const },
  { path: "legal/cookies", priority: 0.4, changeFrequency: "monthly" as const },
  { path: "legal/devoluciones", priority: 0.5, changeFrequency: "monthly" as const },
  { path: "legal/garantias", priority: 0.5, changeFrequency: "monthly" as const },
  { path: "legal/habeas-data", priority: 0.4, changeFrequency: "monthly" as const },
  { path: "legal/subprocesadores", priority: 0.3, changeFrequency: "monthly" as const },
  { path: "legal/security", priority: 0.3, changeFrequency: "monthly" as const },
];

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // #28 — misma URL canónica que canonicals/OG/metadataBase (antes leía SITE_URL del CMS → split-brain).
  const baseUrl = getCanonicalSiteUrl();
  const now = new Date();

  // Páginas estáticas
  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.map((s) => ({
    url: `${baseUrl}/${s.path}`,
    lastModified: now,
    changeFrequency: s.changeFrequency,
    priority: s.priority,
  }));

  // Categorías + subcategorías + ocasiones + productos en paralelo. Try/catch silencioso para que
  // build con DATABASE_URL placeholder no rompa el sitemap.
  let categories: { slug: string; updatedAt: Date }[] = [];
  let subCategories: { slug: string; updatedAt: Date; parent: { slug: string } | null }[] = [];
  let ocasiones: { slug: string; updatedAt: Date }[] = [];
  let products: { slug: string; updatedAt: Date }[] = [];
  try {
    [categories, subCategories, ocasiones, products] = await Promise.all([
      // #22 — categorías RAÍZ (parentId null): las subcategorías se emiten aparte con su ruta
      // jerárquica, evitando duplicar la subcategoría como ?categoria=X y como ruta.
      prisma.category.findMany({
        where: { deletedAt: null, isActive: true, parentId: null },
        select: { slug: true, updatedAt: true },
      }),
      prisma.category.findMany({
        where: {
          deletedAt: null,
          isActive: true,
          parentId: { not: null },
          parent: { isActive: true, deletedAt: null },
        },
        select: { slug: true, updatedAt: true, parent: { select: { slug: true } } },
      }),
      // Espeja el gate de render de getOcasionBySlug (isActive + no borrada).
      prisma.ocasionTag.findMany({
        where: { isActive: true, deletedAt: null },
        select: { slug: true, updatedAt: true },
      }),
      prisma.product.findMany({
        where: { deletedAt: null, isActive: true, category: { isActive: true, deletedAt: null } },
        select: { slug: true, updatedAt: true },
      }),
    ]);
  } catch {
    // DB unreachable durante build — devolvemos solo estáticas.
  }

  const categoryEntries: MetadataRoute.Sitemap = categories.map((c) => ({
    url: `${baseUrl}/productos?categoria=${c.slug}`,
    lastModified: c.updatedAt,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  // #22 — subcategorías con su ruta jerárquica real (/productos/[categoria]/[subcategoria]).
  const subCategoryEntries: MetadataRoute.Sitemap = subCategories
    .filter((s) => s.parent)
    .map((s) => ({
      url: `${baseUrl}/productos/${s.parent!.slug}/${s.slug}`,
      lastModified: s.updatedAt,
      changeFrequency: "weekly",
      priority: 0.7,
    }));

  // #22 — landings SEO por ocasión (/ocasion/[slug]).
  const ocasionEntries: MetadataRoute.Sitemap = ocasiones.map((o) => ({
    url: `${baseUrl}/ocasion/${o.slug}`,
    lastModified: o.updatedAt,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  const productEntries: MetadataRoute.Sitemap = products.map((p) => ({
    url: `${baseUrl}/producto/${p.slug}`,
    lastModified: p.updatedAt,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [
    ...staticEntries,
    ...categoryEntries,
    ...subCategoryEntries,
    ...ocasionEntries,
    ...productEntries,
  ];
}
