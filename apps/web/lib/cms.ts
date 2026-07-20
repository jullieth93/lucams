/*
 * CMS helpers — lectura cacheada de CmsBlock + SiteSetting.
 *
 * Usados por componentes server-side `<CmsMarkdown>`, `<CmsText>`,
 * `<CmsSetting>` y por endpoints API públicos.
 *
 * Cache: `unstable_cache` con tag global `cms`. Cuando el admin
 * publica un bloque o cambia un setting, `revalidateTag("cms")`
 * invalida todo el cache → siguiente request lo refresca.
 *
 * Fallback pattern: si el bloque no existe en DB (caso durante
 * migración J.2), se devuelve null y el componente cae al fallback
 * hardcoded. Cero downtime durante la migración.
 */

import "server-only";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";

export type CmsBlockCategory =
  | "LEGAL"
  | "HOME"
  | "FOOTER"
  | "EMPTY_STATE"
  | "COOKIES"
  | "FAQ"
  | "SUPPORT"
  | "MAINTENANCE"
  | "EMAIL"
  | "MARKETING";

export type CmsBlockData = {
  key: string;
  title: string | null;
  body: string;
  format: "MARKDOWN" | "HTML" | "TEXT" | "JSON";
  category: CmsBlockCategory;
  description: string | null;
  version: number;
  updatedAt: Date;
};

export type SiteSettingCategory =
  | "CONTACT"
  | "BUSINESS"
  | "LEGAL"
  | "COMMERCE"
  | "SOCIAL"
  | "EXTERNAL"
  | "WHATSAPP"
  | "COPYRIGHT"
  | "SEO";

export type SiteSettingData = {
  key: string;
  value: string;
  valueType: "TEXT" | "EMAIL" | "URL" | "NUMBER" | "PHONE" | "COLOR" | "BOOLEAN";
  category: SiteSettingCategory;
  label: string;
  description: string | null;
};

/**
 * `unstable_cache` con degradación grácil cuando NO hay `incrementalCache` de
 * Next disponible (fuera de un request/render: vitest, scripts de seed, workers
 * de pg_cron ejecutados standalone). En Next 16 —breaking change vs 15— llamar a
 * un `unstable_cache` sin ese contexto ya NO ejecuta sin caché: lanza el
 * invariante `incrementalCache missing` (E469). Capturamos EXCLUSIVAMENTE ese
 * invariante y ejecutamos la función cruda (sin caché); cualquier otro error se
 * re-lanza. En producción (siempre dentro de un request de Next) el fallback
 * nunca se dispara → el comportamiento cacheado es idéntico.
 */
function cachedCms<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  keyParts: string[],
  options: { tags: string[]; revalidate: number },
): (...args: A) => Promise<R> {
  const cached = unstable_cache(fn, keyParts, options);
  return async (...args: A): Promise<R> => {
    try {
      return await cached(...args);
    } catch (err) {
      const code = (err as { __NEXT_ERROR_CODE?: string } | null)?.__NEXT_ERROR_CODE;
      const missingCache =
        code === "E469" || (err instanceof Error && err.message.includes("incrementalCache"));
      if (missingCache) return fn(...args);
      throw err;
    }
  };
}

/**
 * Lee un bloque CMS por su key. Devuelve `null` si no existe o no
 * está publicado — el componente caller debería usar fallback
 * hardcoded en ese caso.
 *
 * Cache TTL 1h en background revalidate. Invalidación inmediata
 * cuando el admin publica via `revalidateTag("cms")`.
 */
export const getCmsBlock = cachedCms(
  async (key: string): Promise<CmsBlockData | null> => {
    try {
      const block = await prisma.cmsBlock.findFirst({
        where: { key, isPublished: true, deletedAt: null },
        include: { publishedVersion: true },
      });
      if (!block || !block.publishedVersion) return null;
      return {
        key: block.key,
        title: block.publishedVersion.title ?? block.title,
        body: block.publishedVersion.body,
        format: block.publishedVersion.format,
        category: block.category,
        description: block.description,
        version: block.publishedVersion.version,
        updatedAt: block.updatedAt,
      };
    } catch {
      // DB unreachable (build time con placeholder, network blip, etc.)
      // → null para que el componente caller use su fallback hardcoded.
      return null;
    }
  },
  ["cms-block"],
  { tags: ["cms"], revalidate: 3600 },
);

/**
 * Lee todos los bloques publicados de una categoría. Usado por el
 * endpoint /api/cms/blocks?category=legal y por páginas que renderean
 * listas (ej. /ayuda mostrando todas las FAQ).
 */
export const getCmsBlocksByCategory = cachedCms(
  async (category: string): Promise<CmsBlockData[]> => {
    try {
      const blocks = await prisma.cmsBlock.findMany({
        where: {
          category: category as
            | "LEGAL"
            | "HOME"
            | "FOOTER"
            | "EMPTY_STATE"
            | "COOKIES"
            | "FAQ"
            | "SUPPORT"
            | "MAINTENANCE"
            | "EMAIL"
            | "MARKETING",
          isPublished: true,
          deletedAt: null,
        },
        include: { publishedVersion: true },
        orderBy: { key: "asc" },
      });
      return blocks
        .filter((b) => b.publishedVersion)
        .map((b) => ({
          key: b.key,
          title: b.publishedVersion!.title ?? b.title,
          body: b.publishedVersion!.body,
          format: b.publishedVersion!.format,
          category: b.category,
          description: b.description,
          version: b.publishedVersion!.version,
          updatedAt: b.updatedAt,
        }));
    } catch {
      return [];
    }
  },
  ["cms-blocks-by-category"],
  { tags: ["cms"], revalidate: 3600 },
);

/**
 * Lee un setting atómico por su key. Devuelve `fallback` si no existe.
 * Pattern: `await getSiteSetting("CONTACT_EMAIL", "hola@lucamsshop.co")`.
 */
export const getSiteSetting = cachedCms(
  async (key: string): Promise<SiteSettingData | null> => {
    try {
      const setting = await prisma.siteSetting.findUnique({
        where: { key },
      });
      if (!setting) return null;
      return {
        key: setting.key,
        value: setting.value,
        valueType: setting.valueType,
        category: setting.category,
        label: setting.label,
        description: setting.description,
      };
    } catch {
      return null;
    }
  },
  ["cms-setting"],
  { tags: ["cms"], revalidate: 3600 },
);

/**
 * Lee todos los settings agrupados por categoría. Usado por
 * /admin/contenido/configuracion + endpoint /api/cms/settings.
 */
export const getAllSiteSettings = cachedCms(
  async (): Promise<SiteSettingData[]> => {
    try {
      const settings = await prisma.siteSetting.findMany({
        orderBy: [{ category: "asc" }, { key: "asc" }],
      });
      return settings.map((s) => ({
        key: s.key,
        value: s.value,
        valueType: s.valueType,
        category: s.category,
        label: s.label,
        description: s.description,
      }));
    } catch {
      return [];
    }
  },
  ["cms-settings-all"],
  { tags: ["cms"], revalidate: 3600 },
);

/**
 * Helper directo para obtener el valor de un setting como string,
 * con fallback. Lo más común en componentes:
 *   const email = await getSettingValue("CONTACT_EMAIL", "hola@lucamsshop.co");
 */
export async function getSettingValue(key: string, fallback: string): Promise<string> {
  const setting = await getSiteSetting(key);
  return setting?.value ?? fallback;
}

/**
 * Lee settings filtrados por categoría. Usado por endpoint
 * GET /api/cms/settings?category=contact.
 */
export const getSettingsByCategory = cachedCms(
  async (category: string): Promise<SiteSettingData[]> => {
    try {
      const settings = await prisma.siteSetting.findMany({
        where: {
          category: category as SiteSettingCategory,
        },
        orderBy: { key: "asc" },
      });
      return settings.map((s) => ({
        key: s.key,
        value: s.value,
        valueType: s.valueType,
        category: s.category,
        label: s.label,
        description: s.description,
      }));
    } catch {
      return [];
    }
  },
  ["cms-settings-by-category"],
  { tags: ["cms"], revalidate: 3600 },
);

/**
 * Lista TODOS los bloques publicados (sin filtro). Usado por
 * GET /api/cms/blocks sin querystring.
 */
export const getAllCmsBlocks = cachedCms(
  async (): Promise<CmsBlockData[]> => {
    try {
      const blocks = await prisma.cmsBlock.findMany({
        where: { isPublished: true, deletedAt: null },
        include: { publishedVersion: true },
        orderBy: [{ category: "asc" }, { key: "asc" }],
      });
      return blocks
        .filter((b) => b.publishedVersion)
        .map((b) => ({
          key: b.key,
          title: b.publishedVersion!.title ?? b.title,
          body: b.publishedVersion!.body,
          format: b.publishedVersion!.format,
          category: b.category,
          description: b.description,
          version: b.publishedVersion!.version,
          updatedAt: b.updatedAt,
        }));
    } catch {
      return [];
    }
  },
  ["cms-blocks-all"],
  { tags: ["cms"], revalidate: 3600 },
);

/**
 * Búsqueda full-text con pg_trgm. Matchea title + body con tolerancia
 * a typos y acentos (via unaccent). Usado por GET /api/cms/search?q=X
 * y por el editor admin para autocomplete.
 *
 * Devuelve top 20 results ordenados por similarity DESC.
 */
export async function searchCmsBlocks(query: string): Promise<CmsBlockData[]> {
  if (!query.trim()) return [];
  try {
    type Row = {
      key: string;
      title: string | null;
      body: string;
      format: "MARKDOWN" | "HTML" | "TEXT" | "JSON";
      category: CmsBlockCategory;
      description: string | null;
      version: number;
      updated_at: Date;
    };
    const rows = await prisma.$queryRaw<Row[]>`
      SELECT
        b.key,
        COALESCE(v.title, b.title) AS title,
        v.body,
        v.format,
        b.category,
        b.description,
        v.version,
        b."updatedAt" AS updated_at
      FROM "CmsBlock" b
      INNER JOIN "CmsBlockVersion" v ON v.id = b."publishedVersionId"
      WHERE b."isPublished" = TRUE
        AND b."deletedAt" IS NULL
        AND (
          unaccent(COALESCE(v.title, b.title, '')) % unaccent(${query})
          OR unaccent(v.body) % unaccent(${query})
          OR unaccent(b.key) % unaccent(${query})
        )
      ORDER BY GREATEST(
        similarity(unaccent(COALESCE(v.title, b.title, '')), unaccent(${query})),
        similarity(unaccent(b.key), unaccent(${query}))
      ) DESC
      LIMIT 20
    `;
    return rows.map((r) => ({
      key: r.key,
      title: r.title,
      body: r.body,
      format: r.format,
      category: r.category,
      description: r.description,
      version: r.version,
      updatedAt: r.updated_at,
    }));
  } catch {
    return [];
  }
}
