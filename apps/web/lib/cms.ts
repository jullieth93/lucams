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

export type CmsBlockData = {
  key: string;
  title: string | null;
  body: string;
  format: "MARKDOWN" | "HTML" | "TEXT" | "JSON";
  version: number;
  updatedAt: Date;
};

export type SiteSettingData = {
  key: string;
  value: string;
  valueType: "TEXT" | "EMAIL" | "URL" | "NUMBER" | "PHONE" | "COLOR" | "BOOLEAN";
};

/**
 * Lee un bloque CMS por su key. Devuelve `null` si no existe o no
 * está publicado — el componente caller debería usar fallback
 * hardcoded en ese caso.
 *
 * Cache TTL 1h en background revalidate. Invalidación inmediata
 * cuando el admin publica via `revalidateTag("cms")`.
 */
export const getCmsBlock = unstable_cache(
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
export const getCmsBlocksByCategory = unstable_cache(
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
export const getSiteSetting = unstable_cache(
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
export const getAllSiteSettings = unstable_cache(
  async (): Promise<SiteSettingData[]> => {
    try {
      const settings = await prisma.siteSetting.findMany({
        orderBy: [{ category: "asc" }, { key: "asc" }],
      });
      return settings.map((s) => ({
        key: s.key,
        value: s.value,
        valueType: s.valueType,
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
