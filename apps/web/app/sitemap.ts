/*
 * sitemap.xml dinámico para Google/Bing crawlers.
 *
 * Incluye:
 *   - Páginas estáticas (home, /productos, /carrito, 8 legales, /ayuda,
 *     /contacto, /mi-cuenta)
 *   - Categorías visibles (filtro /productos?categoria=X)
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
import { getSettingValue } from "@/lib/cms";

const STATIC_PATHS = [
  { path: "", priority: 1.0, changeFrequency: "daily" as const },
  { path: "productos", priority: 0.9, changeFrequency: "daily" as const },
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
  const baseUrl = await getSettingValue("SITE_URL", "https://lucamsshop.co");
  const now = new Date();

  // Páginas estáticas
  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.map((s) => ({
    url: `${baseUrl}/${s.path}`,
    lastModified: now,
    changeFrequency: s.changeFrequency,
    priority: s.priority,
  }));

  // Categorías + productos en paralelo. Try/catch silencioso para que
  // build con DATABASE_URL placeholder no rompa el sitemap.
  let categories: { slug: string; updatedAt: Date }[] = [];
  let products: { slug: string; updatedAt: Date }[] = [];
  try {
    [categories, products] = await Promise.all([
      prisma.category.findMany({
        where: { deletedAt: null, isActive: true },
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

  const productEntries: MetadataRoute.Sitemap = products.map((p) => ({
    url: `${baseUrl}/producto/${p.slug}`,
    lastModified: p.updatedAt,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [...staticEntries, ...categoryEntries, ...productEntries];
}
