/*
 * CMS helpers — lectura cacheada del modelo CMS v2 (CmsField + CmsFieldVersion).
 *
 * CMS v2 (2026-07-30): antes leía CmsBlock + SiteSetting (DEPRECATED); ahora
 * lee el modelo Página → Sección → Campo conservando EXACTAMENTE la misma API
 * pública (getCmsBlock, getSettingValue…) y las mismas keys, así que ningún
 * consumidor cambia. La distinción bloque/setting vive en `CmsField.kind`:
 *   - kind BLOCK   → lo que era CmsBlock (prosa versionada, publicación explícita)
 *   - kind SETTING → lo que era SiteSetting (valor atómico; save = publish)
 *
 * Usados por componentes server-side `<CmsMarkdown>`, `<CmsText>`,
 * `<CmsSetting>` y por endpoints API públicos.
 *
 * Cache: `unstable_cache` con tag global `cms`. Cuando el admin publica un
 * campo, `updateTag("cms")` (desde una Server Action) invalida todo el cache →
 * siguiente request lo refresca. Si el contenido se edita DIRECTO en DB con un
 * script de packages/db/scripts, hay que invalidar a mano: /admin/contenido →
 * botón "Actualizar caché de contenido".
 *
 * Fallback pattern: si el campo no existe en DB o no está publicado, se
 * devuelve null y el componente cae al fallback hardcoded.
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

// CmsFieldType → BlockFormat legacy (API pública sin cambios).
function toBlockFormat(type: string): CmsBlockData["format"] {
  if (type === "MARKDOWN" || type === "HTML" || type === "JSON") return type;
  return "TEXT";
}

// CmsFieldType → SettingType legacy (los tipos ricos no aplican a settings).
function toSettingType(type: string): SiteSettingData["valueType"] {
  if (
    type === "EMAIL" ||
    type === "URL" ||
    type === "NUMBER" ||
    type === "PHONE" ||
    type === "COLOR" ||
    type === "BOOLEAN"
  ) {
    return type;
  }
  return "TEXT";
}

/**
 * Claves que NUNCA deben salir por endpoints públicos (/api/cms/settings):
 * - PICKUP_* — dirección/teléfono/contacto de recogida de Aveonline; si el
 *   negocio opera desde casa, es la dirección exacta de la casa (riesgo
 *   físico, detectado en certificación 2026-07-29 2ª pasada).
 * - BUSINESS_NIT — identificación tributaria del negocio; solo la usa la
 *   guía Aveonline server-side.
 * Esas lecturas siguen funcionando internamente vía getSettingValue (la
 * saga y el cotizador no pasan por HTTP). Si se agrega otro setting
 * sensible, extender acá — el endpoint filtra con esta función.
 */
export function isPublicSettingKey(key: string): boolean {
  return !key.startsWith("PICKUP_") && key !== "BUSINESS_NIT";
}

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

type FieldWithVersion = {
  key: string;
  label: string;
  helpText: string | null;
  type: string;
  category: string;
  updatedAt: Date;
  publishedVersion: { title: string | null; body: string; version: number } | null;
};

function toBlockData(field: FieldWithVersion): CmsBlockData | null {
  if (!field.publishedVersion) return null;
  return {
    key: field.key,
    title: field.publishedVersion.title ?? field.label,
    body: field.publishedVersion.body,
    format: toBlockFormat(field.type),
    category: field.category as CmsBlockCategory,
    description: field.helpText,
    version: field.publishedVersion.version,
    updatedAt: field.updatedAt,
  };
}

function toSettingData(field: FieldWithVersion): SiteSettingData | null {
  if (!field.publishedVersion) return null;
  return {
    key: field.key,
    value: field.publishedVersion.body,
    valueType: toSettingType(field.type),
    category: field.category as SiteSettingCategory,
    label: field.label,
    description: field.helpText,
  };
}

/**
 * Lee un bloque CMS por su key. Devuelve `null` si no existe o no
 * está publicado — el componente caller debería usar fallback
 * hardcoded en ese caso.
 *
 * Cache TTL 1h en background revalidate. Invalidación inmediata
 * cuando el admin publica via `updateTag("cms")` (Server Action).
 */
export const getCmsBlock = cachedCms(
  async (key: string): Promise<CmsBlockData | null> => {
    try {
      const field = await prisma.cmsField.findFirst({
        where: { key, kind: "BLOCK", isPublished: true, deletedAt: null },
        include: { publishedVersion: true },
      });
      if (!field) return null;
      return toBlockData(field);
    } catch {
      // DB unreachable (build time con placeholder, network blip, etc.)
      // → null para que el componente caller use su fallback hardcoded.
      return null;
    }
  },
  ["cms-block"],
  { tags: ["cms"], revalidate: 3600 },
);

export type CmsImageData = {
  url: string;
  alt: string;
  width: number;
  height: number;
};

/**
 * Lee una imagen del CMS por la key de su campo (roadmap B5). El campo
 * (type IMAGE, publicado) guarda en `body` el CmsMedia.id; acá se resuelve a
 * `{ url, alt, width, height }`. La URL pública se deriva de bucket+path con
 * la URL pública del proyecto (bucket público — sin firma ni credenciales,
 * lo mismo que hace getPublicUrl internamente).
 * Devuelve `null` si falta el campo, no está publicado, o el asset ya no
 * existe — el caller cae al asset hardcoded del repo (REGLA DE ORO).
 */
export const getCmsImage = cachedCms(
  async (key: string): Promise<CmsImageData | null> => {
    try {
      const field = await prisma.cmsField.findFirst({
        where: { key, type: "IMAGE", isPublished: true, deletedAt: null },
        include: { publishedVersion: true },
      });
      const mediaId = field?.publishedVersion?.body.trim();
      if (!mediaId) return null;
      const media = await prisma.cmsMedia.findUnique({ where: { id: mediaId } });
      const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
      if (!media || !base) return null;
      return {
        url: `${base}/storage/v1/object/public/${media.bucket}/${media.path}`,
        alt: media.alt,
        width: media.width,
        height: media.height,
      };
    } catch {
      // Misma degradación que getCmsBlock: cualquier fallo → fallback del caller.
      return null;
    }
  },
  ["cms-image"],
  { tags: ["cms"], revalidate: 3600 },
);

export type CmsBannerItem = CmsImageData & {
  /** Texto visible del banner (overlay). */
  titulo: string;
  /** Destino del click (ruta interna o URL externa). */
  enlace: string;
};

/**
 * Lee un campo LISTA de banners (roadmap B6: `home.banners`, items
 * `{ imagen: CmsMedia.id, titulo, enlace, activo }`) y devuelve los banners
 * ACTIVOS con el asset ya resuelto (misma derivación de URL que getCmsImage).
 * Items con forma inválida o cuyo asset ya no existe se DESCARTAN (un banner
 * roto no debe tumbar la franja entera). Devuelve `[]` si falta el campo, no
 * está publicado o la lista quedó vacía — el caller NO renderiza la sección
 * (fallback = el sitio como estaba antes de B6, REGLA DE ORO).
 */
export const getCmsBanners = cachedCms(
  async (key: string): Promise<CmsBannerItem[]> => {
    try {
      const field = await prisma.cmsField.findFirst({
        where: { key, kind: "BLOCK", isPublished: true, deletedAt: null },
        include: { publishedVersion: true },
      });
      const body = field?.publishedVersion?.body;
      if (!body) return [];
      const parsed: unknown = JSON.parse(body);
      if (!Array.isArray(parsed) || parsed.length === 0) return [];

      const rows = parsed
        .filter(
          (v): v is Record<string, unknown> =>
            typeof v === "object" && v !== null && !Array.isArray(v),
        )
        .map((v) => ({
          imagen: typeof v.imagen === "string" ? v.imagen.trim() : "",
          titulo: typeof v.titulo === "string" ? v.titulo.trim() : "",
          enlace: typeof v.enlace === "string" ? v.enlace.trim() : "",
          activo: typeof v.activo === "string" ? v.activo.trim() : "",
        }))
        .filter((v) => v.imagen && v.titulo && v.enlace && v.activo !== "false");
      if (rows.length === 0) return [];

      const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
      if (!base) return [];
      const media = await prisma.cmsMedia.findMany({
        where: { id: { in: rows.map((r) => r.imagen) } },
      });
      const byId = new Map(media.map((m) => [m.id, m]));
      return rows.flatMap((r) => {
        const m = byId.get(r.imagen);
        if (!m) return []; // asset borrado: el banner se omite, no rompe la franja
        return [
          {
            url: `${base}/storage/v1/object/public/${m.bucket}/${m.path}`,
            alt: m.alt,
            width: m.width,
            height: m.height,
            titulo: r.titulo,
            enlace: r.enlace,
          },
        ];
      });
    } catch {
      // Misma degradación que getCmsBlock: cualquier fallo → sin sección.
      return [];
    }
  },
  ["cms-banners"],
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
      const fields = await prisma.cmsField.findMany({
        where: { kind: "BLOCK", category, isPublished: true, deletedAt: null },
        include: { publishedVersion: true },
        orderBy: { key: "asc" },
      });
      return fields.map((f) => toBlockData(f)).filter((b) => b !== null);
    } catch {
      return [];
    }
  },
  ["cms-blocks-by-category"],
  { tags: ["cms"], revalidate: 3600 },
);

/**
 * Lee un setting atómico por su key. Devuelve `fallback` si no existe.
 * Pattern: `await getSiteSetting("CONTACT_EMAIL", "hola@lucamsshop.com")`.
 */
export const getSiteSetting = cachedCms(
  async (key: string): Promise<SiteSettingData | null> => {
    try {
      const field = await prisma.cmsField.findFirst({
        where: { key, kind: "SETTING", isPublished: true, deletedAt: null },
        include: { publishedVersion: true },
      });
      if (!field) return null;
      return toSettingData(field);
    } catch {
      return null;
    }
  },
  ["cms-setting"],
  { tags: ["cms"], revalidate: 3600 },
);

/**
 * Lee todos los settings agrupados por categoría. Usado por
 * /admin/contenido/paginas/global + endpoint /api/cms/settings.
 */
export const getAllSiteSettings = cachedCms(
  async (): Promise<SiteSettingData[]> => {
    try {
      const fields = await prisma.cmsField.findMany({
        where: { kind: "SETTING", deletedAt: null },
        include: { publishedVersion: true },
        orderBy: [{ category: "asc" }, { key: "asc" }],
      });
      return fields.map((f) => toSettingData(f)).filter((s) => s !== null);
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
 *   const email = await getSettingValue("CONTACT_EMAIL", "hola@lucamsshop.com");
 */
export async function getSettingValue(key: string, fallback: string): Promise<string> {
  const setting = await getSiteSetting(key);
  return setting?.value ?? fallback;
}

/**
 * Lee un campo LISTA (roadmap B4: el admin lo edita como filas con inputs por
 * subcampo — ver CmsListItem — pero el body público sigue siendo el array
 * serializado a JSON). Parsea el body con try/catch, valida CADA item con
 * `validate` y devuelve `fallback` ante cualquier problema: campo inexistente
 * o sin publicar, JSON inválido, array vacío o un solo item que no pase la
 * validación. El sitio nunca se rompe por contenido mal editado (misma REGLA
 * DE ORO del fallback pattern de este archivo).
 *
 * Pattern:
 *   const links = await getCmsList("footer.legal.links", validateLink, FALLBACK_LINKS);
 */
export async function getCmsList<T>(
  key: string,
  validate: (v: unknown) => T | null,
  fallback: T[],
): Promise<T[]> {
  const block = await getCmsBlock(key);
  if (!block) return fallback;
  try {
    const parsed: unknown = JSON.parse(block.body);
    if (!Array.isArray(parsed) || parsed.length === 0) return fallback;
    const items = parsed.map(validate);
    if (items.some((item) => item === null)) return fallback;
    return items as T[];
  } catch {
    return fallback;
  }
}

/**
 * Lee settings filtrados por categoría. Usado por endpoint
 * GET /api/cms/settings?category=contact.
 */
export const getSettingsByCategory = cachedCms(
  async (category: string): Promise<SiteSettingData[]> => {
    try {
      const fields = await prisma.cmsField.findMany({
        where: { kind: "SETTING", category: category.toUpperCase(), deletedAt: null },
        include: { publishedVersion: true },
        orderBy: { key: "asc" },
      });
      return fields.map((f) => toSettingData(f)).filter((s) => s !== null);
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
      const fields = await prisma.cmsField.findMany({
        where: { kind: "BLOCK", isPublished: true, deletedAt: null },
        include: { publishedVersion: true },
        orderBy: [{ category: "asc" }, { key: "asc" }],
      });
      return fields.map((f) => toBlockData(f)).filter((b) => b !== null);
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
      type: string;
      category: string;
      description: string | null;
      version: number;
      updated_at: Date;
    };
    const rows = await prisma.$queryRaw<Row[]>`
      SELECT
        f.key,
        COALESCE(v.title, f.label) AS title,
        v.body,
        f.type,
        f.category,
        f."helpText" AS description,
        v.version,
        f."updatedAt" AS updated_at
      FROM "CmsField" f
      INNER JOIN "CmsFieldVersion" v ON v.id = f."publishedVersionId"
      WHERE f.kind = 'BLOCK'
        AND f."isPublished" = TRUE
        AND f."deletedAt" IS NULL
        AND (
          unaccent(COALESCE(v.title, f.label, '')) % unaccent(${query})
          OR unaccent(v.body) % unaccent(${query})
          OR unaccent(f.key) % unaccent(${query})
        )
      ORDER BY GREATEST(
        similarity(unaccent(COALESCE(v.title, f.label, '')), unaccent(${query})),
        similarity(unaccent(f.key), unaccent(${query}))
      ) DESC
      LIMIT 20
    `;
    return rows.map((r) => ({
      key: r.key,
      title: r.title,
      body: r.body,
      format: toBlockFormat(r.type),
      category: r.category as CmsBlockCategory,
      description: r.description,
      version: r.version,
      updatedAt: r.updated_at,
    }));
  } catch {
    return [];
  }
}
