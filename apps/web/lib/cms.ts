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
 * Allowlist de claves que SÍ pueden salir por endpoints públicos
 * (/api/cms/settings). Auditoría 2026-08-24 (C-2): antes era una DENYLIST
 * ("todo es público EXCEPTO PICKUP_* y BUSINESS_NIT") → cualquier setting
 * futuro sensible (claves API, secretos) saldría por defecto. Invertido a
 * fail-closed: una clave NUEVA es privada hasta que se agregue acá a propósito.
 *
 * La lista se construyó enumerando las claves que el storefront realmente
 * consume (getSettingValue/getSiteSetting/<CmsSetting> en páginas públicas,
 * footer, emails transaccionales y botones de WhatsApp). Excluidas a propósito:
 * - PICKUP_* — dirección/teléfono/contacto de recogida de Aveonline; si el
 *   negocio opera desde casa, es la dirección exacta de la casa (riesgo
 *   físico, certificación 2026-07-29 2ª pasada).
 * - BUSINESS_NIT — identificación tributaria; solo la usa la guía Aveonline
 *   server-side.
 * - ALERT_EMAIL — buzón interno de alertas operativas; lo leen solo features
 *   server-side (observability/quotes/orders), nunca se renderiza en público.
 * - PRIVACY_POLICY_VERSION — solo la persisten los consent records server-side.
 *
 * Esas lecturas siguen funcionando internamente vía getSettingValue (la saga y
 * el cotizador no pasan por HTTP); el filtro SOLO aplica al endpoint público.
 */
const PUBLIC_SETTING_KEYS = new Set([
  // Identidad y contacto público
  "APP_NAME",
  "CONTACT_EMAIL",
  "HABEAS_DATA_EMAIL",
  "RETRACTO_EMAIL",
  "SECURITY_EMAIL",
  "BUSINESS_HOURS",
  "BUSINESS_LOCATION",
  "SITE_URL",
  // Footer / legal
  "COPYRIGHT_YEAR",
  "COPYRIGHT_TAGLINE",
  "GOVT_SIC_URL",
  // Redes sociales (footer + home)
  "SOCIAL_INSTAGRAM_URL",
  "SOCIAL_INSTAGRAM_ENABLED",
  "SOCIAL_TIKTOK_URL",
  "SOCIAL_TIKTOK_ENABLED",
  "SOCIAL_FACEBOOK_URL",
  "SOCIAL_FACEBOOK_ENABLED",
  // WhatsApp click-to-chat
  "WA_NUMBER",
  "WA_MSG_PRODUCT",
  "WA_MSG_PERSONALIZE",
  "WA_MSG_SUPPORT",
  "WA_MSG_SUPPORT_SUBJECT",
  "WA_MSG_ORDER",
  "WA_MSG_QUOTE",
  "WA_MSG_WHOLESALE",
  // Comercio y tokens de copy pública
  "COD_ENABLED",
  "PRODUCTION_DAYS_DEFAULT",
  "DELIVERY_DAYS_ESTIMATE",
  "DELIVERY_COVERAGE_COUNT",
  // CTAs del hero (home)
  "home.hero.cta-primary.href",
  "home.hero.cta-secondary.href",
]);

export function isPublicSettingKey(key: string): boolean {
  return PUBLIC_SETTING_KEYS.has(key);
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
 *
 * Exportada (2026-10-07): el mismo patrón lo reusan otros readers cacheados
 * fuera del CMS (p.ej. las miniaturas de galería en design-gallery.ts).
 */
export function cachedCms<A extends unknown[], R>(
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

type FieldRow = {
  key: string;
  kind: string;
  label: string;
  helpText: string | null;
  type: string;
  category: string;
  isPublished: boolean;
  updatedAt: Date;
  publishedVersion: { title: string | null; body: string; version: number } | null;
};

/**
 * Snapshot JSON-serializable de todo el contenido CMS publicado (~165 campos, <50 KB).
 *
 * IMPORTANTE (Next 16 `unstable_cache`): el valor cacheado pasa por `JSON.stringify` /
 * `JSON.parse` en el Data Cache. Prohibido devolver `Map`, `Set` o instancias `Date`
 * crudas adentro: usamos objetos planos y `updatedAtIso: string`, hidratando `new Date(...)`
 * al salir del caché para que `CmsBlockData.updatedAt` siga siendo siempre un `Date` real.
 */
type SerializedBlock = Omit<CmsBlockData, "updatedAt"> & { updatedAtIso: string };
type SerializedSetting = SiteSettingData & { isPublished: boolean };

type CmsSnapshot = {
  blocksByKey: Record<string, SerializedBlock>;
  blocksAll: SerializedBlock[];
  settingsByKey: Record<string, SerializedSetting>;
  settingsAll: SerializedSetting[];
  imageMediaIdByKey: Record<string, string>;
};

function hydrateBlock(raw: SerializedBlock): CmsBlockData {
  return {
    key: raw.key,
    title: raw.title,
    body: raw.body,
    format: raw.format,
    category: raw.category,
    description: raw.description,
    version: raw.version,
    updatedAt: new Date(raw.updatedAtIso),
  };
}

function stripSettingInternal(raw: SerializedSetting): SiteSettingData {
  return {
    key: raw.key,
    value: raw.value,
    valueType: raw.valueType,
    category: raw.category,
    label: raw.label,
    description: raw.description,
  };
}

const loadCmsSnapshotCached = cachedCms(
  async (): Promise<CmsSnapshot> => {
    const fields: FieldRow[] = await prisma.cmsField.findMany({
      where: { deletedAt: null },
      include: { publishedVersion: true },
      orderBy: [{ category: "asc" }, { key: "asc" }],
    });

    const blocksByKey: Record<string, SerializedBlock> = {};
    const blocksAll: SerializedBlock[] = [];
    const settingsByKey: Record<string, SerializedSetting> = {};
    const settingsAll: SerializedSetting[] = [];
    const imageMediaIdByKey: Record<string, string> = {};

    for (const f of fields) {
      if (!f.publishedVersion) continue;

      if (f.type === "IMAGE" && f.isPublished) {
        const mediaId = f.publishedVersion.body.trim();
        if (mediaId) imageMediaIdByKey[f.key] = mediaId;
      }

      if (f.kind === "BLOCK" && f.isPublished) {
        const serialized: SerializedBlock = {
          key: f.key,
          title: f.publishedVersion.title ?? f.label,
          body: f.publishedVersion.body,
          format: toBlockFormat(f.type),
          category: f.category as CmsBlockCategory,
          description: f.helpText,
          version: f.publishedVersion.version,
          updatedAtIso:
            f.updatedAt instanceof Date ? f.updatedAt.toISOString() : String(f.updatedAt),
        };
        blocksByKey[f.key] = serialized;
        blocksAll.push(serialized);
      } else if (f.kind === "SETTING") {
        const serialized: SerializedSetting = {
          key: f.key,
          value: f.publishedVersion.body,
          valueType: toSettingType(f.type),
          category: f.category as SiteSettingCategory,
          label: f.label,
          description: f.helpText,
          isPublished: f.isPublished,
        };
        settingsByKey[f.key] = serialized;
        settingsAll.push(serialized);
      }
    }

    return { blocksByKey, blocksAll, settingsByKey, settingsAll, imageMediaIdByKey };
  },
  ["cms-snapshot-v2"],
  { tags: ["cms"], revalidate: 3600 },
);

/**
 * Obtiene el snapshot CMS atrapando errores de conexión FUERA de `unstable_cache`
 * para no cachear un snapshot vacío durante 1h ante un parpadeo de red/BD.
 */
async function getCmsSnapshot(): Promise<CmsSnapshot | null> {
  try {
    return await loadCmsSnapshotCached();
  } catch {
    return null;
  }
}

/**
 * Lee un bloque CMS por su key desde el snapshot compartido. Devuelve `null` si
 * no existe o no está publicado — el componente caller usa su fallback hardcoded.
 *
 * Cache TTL 1h en background revalidate (`cms-snapshot-v2`). Invalidación
 * inmediata cuando el admin publica via `updateTag("cms")` (Server Action).
 */
export async function getCmsBlock(key: string): Promise<CmsBlockData | null> {
  const snap = await getCmsSnapshot();
  const raw = snap?.blocksByKey[key];
  return raw ? hydrateBlock(raw) : null;
}

export type CmsImageData = {
  url: string;
  alt: string;
  width: number;
  height: number;
};

const loadCmsMediaByIdCached = cachedCms(
  async (mediaId: string) => prisma.cmsMedia.findUnique({ where: { id: mediaId } }),
  ["cms-media-by-id"],
  { tags: ["cms"], revalidate: 3600 },
);

/**
 * Lee una imagen del CMS por la key de su campo (roadmap B5). El campo
 * (type IMAGE, publicado) guarda en `body` el CmsMedia.id; acá se resuelve a
 * `{ url, alt, width, height }`. La URL pública se deriva de bucket+path con
 * la URL pública del proyecto (bucket público — sin firma ni credenciales,
 * lo mismo que hace getPublicUrl internamente).
 * Devuelve `null` si falta el campo, no está publicado, o el asset ya no
 * existe — el caller cae al asset hardcoded del repo (REGLA DE ORO).
 *
 * NOTA N-23 (2026-09-12, actualizada Fase 3 · 3.9): hasta esa fecha no tenía
 * ningún caller storefront; hoy la usa el logo administrable `site.logo`
 * (components/site-header.tsx → BrandMark y app/admin/(panel)/layout.tsx →
 * AdminShell). Sigue siendo el punto de lectura de los campos IMAGE "sueltos"
 * que el admin crea/edita/publica desde /admin/contenido.
 */
export async function getCmsImage(key: string): Promise<CmsImageData | null> {
  try {
    const snap = await getCmsSnapshot();
    const mediaId = snap?.imageMediaIdByKey[key];
    if (!mediaId) return null;
    const media = await loadCmsMediaByIdCached(mediaId);
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
}

export type CmsBannerItem = CmsImageData & {
  /** Texto visible del banner (overlay). */
  titulo: string;
  /** Destino del click (ruta interna o URL externa). */
  enlace: string;
};

const loadCmsMediaBatchCached = cachedCms(
  async (idsKey: string) => {
    const ids = idsKey.split(",").filter(Boolean);
    return prisma.cmsMedia.findMany({ where: { id: { in: ids } } });
  },
  ["cms-media-batch"],
  { tags: ["cms"], revalidate: 3600 },
);

/**
 * Lee un campo LISTA de banners (roadmap B6: `home.banners`, items
 * `{ imagen: CmsMedia.id, titulo, enlace, activo }`) y devuelve los banners
 * ACTIVOS con el asset ya resuelto (misma derivación de URL que getCmsImage).
 * Items con forma inválida o cuyo asset ya no existe se DESCARTAN (un banner
 * roto no debe tumbar la franja entera). Devuelve `[]` si falta el campo, no
 * está publicado o la lista quedó vacía — el caller NO renderiza la sección
 * (fallback = el sitio como estaba antes de B6, REGLA DE ORO).
 */
export async function getCmsBanners(key: string): Promise<CmsBannerItem[]> {
  try {
    const block = await getCmsBlock(key);
    const body = block?.body;
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
    const uniqueIds = [...new Set(rows.map((r) => r.imagen))].sort().join(",");
    const media = await loadCmsMediaBatchCached(uniqueIds);
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
}

/**
 * Lee todos los bloques publicados de una categoría. Usado por el
 * endpoint /api/cms/blocks?category=legal y por páginas que renderean
 * listas (ej. /ayuda mostrando todas las FAQ).
 */
export async function getCmsBlocksByCategory(category: string): Promise<CmsBlockData[]> {
  const snap = await getCmsSnapshot();
  if (!snap) return [];
  return snap.blocksAll
    .filter((b) => b.category === category)
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(hydrateBlock);
}

/**
 * Lee un setting atómico por su key desde el snapshot compartido.
 * Devuelve `null` si no existe o no está publicado.
 */
export async function getSiteSetting(key: string): Promise<SiteSettingData | null> {
  const snap = await getCmsSnapshot();
  const raw = snap?.settingsByKey[key];
  if (!raw || !raw.isPublished) return null;
  return stripSettingInternal(raw);
}

/**
 * Lee todos los settings agrupados por categoría. Usado por
 * /admin/contenido/paginas/global + endpoint /api/cms/settings.
 */
export async function getAllSiteSettings(): Promise<SiteSettingData[]> {
  const snap = await getCmsSnapshot();
  if (!snap) return [];
  return snap.settingsAll.map(stripSettingInternal);
}

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
export async function getSettingsByCategory(category: string): Promise<SiteSettingData[]> {
  const snap = await getCmsSnapshot();
  if (!snap) return [];
  const upper = category.toUpperCase();
  return snap.settingsAll
    .filter((s) => s.category === upper)
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(stripSettingInternal);
}

/**
 * Lista TODOS los bloques publicados (sin filtro). Usado por
 * GET /api/cms/blocks sin querystring.
 */
export async function getAllCmsBlocks(): Promise<CmsBlockData[]> {
  const snap = await getCmsSnapshot();
  if (!snap) return [];
  return snap.blocksAll.map(hydrateBlock);
}

/**
 * Búsqueda full-text con pg_trgm. Matchea title + body con tolerancia
 * a typos y acentos (via unaccent). Usado por GET /api/cms/search?q=X
 * y por el editor admin para autocomplete.
 *
 * Devuelve top 20 results ordenados por similarity DESC.
 */
export async function searchCmsBlocks(query: string): Promise<CmsBlockData[]> {
  // Cap de longitud (auditoría 2026-08-24, C-6 — defensa en capas; la ruta ya trunca):
  // similarity() corre por fila contra title+body; un string enorme amplifica el coste.
  const q = query.trim().slice(0, 120);
  if (!q) return [];
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
          unaccent(COALESCE(v.title, f.label, '')) % unaccent(${q})
          OR unaccent(v.body) % unaccent(${q})
          OR unaccent(f.key) % unaccent(${q})
        )
      ORDER BY GREATEST(
        similarity(unaccent(COALESCE(v.title, f.label, '')), unaccent(${q})),
        similarity(unaccent(f.key), unaccent(${q}))
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
