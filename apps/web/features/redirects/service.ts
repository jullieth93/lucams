/*
 * Service layer URL Redirects — admin-managed 301/302.
 *
 * Patrón consistente con customers/admin-users services: opts { q, status,
 * sort, page, pageSize } → { items, total, page, pageSize, totalPages }.
 */

import "server-only";
import { unstable_cache, updateTag } from "next/cache";
import { prisma } from "@/lib/db";
import { isAllowedRedirectDestination } from "@/lib/safe-redirect";
import { getStorefrontProductBySlug } from "@/features/products/public-service";
import { getCategoryBySlug, getOcasionBySlug } from "@/lib/catalog";

const PAGE_SIZE = 20;

export type RedirectListOpts = {
  q?: string;
  /** "active" (default) | "inactive" | "archived" | "all" */
  status?: "active" | "inactive" | "archived" | "all";
  /** "recent" (default) | "from" | "hits" */
  sort?: "recent" | "from" | "hits";
  page?: number;
  pageSize?: number;
};

export type RedirectListItem = {
  id: string;
  fromPath: string;
  toPath: string;
  statusCode: number;
  description: string | null;
  isActive: boolean;
  isArchived: boolean;
  hitCount: number;
  lastHitAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type RedirectListResult = {
  items: RedirectListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export async function listRedirects(opts: RedirectListOpts = {}): Promise<RedirectListResult> {
  const q = opts.q?.trim();
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = opts.pageSize ?? PAGE_SIZE;

  const orderBy = (() => {
    switch (opts.sort) {
      case "from":
        return [{ fromPath: "asc" as const }];
      case "hits":
        return [{ hitCount: "desc" as const }, { createdAt: "desc" as const }];
      case "recent":
      default:
        return [{ createdAt: "desc" as const }];
    }
  })();

  const statusFilter = (() => {
    switch (opts.status) {
      case "inactive":
        return { isActive: false, deletedAt: null };
      case "archived":
        return { deletedAt: { not: null } };
      case "all":
        return {};
      case "active":
      default:
        return { isActive: true, deletedAt: null };
    }
  })();

  const where = {
    ...statusFilter,
    ...(q
      ? {
          OR: [
            { fromPath: { contains: q, mode: "insensitive" as const } },
            { toPath: { contains: q, mode: "insensitive" as const } },
            { description: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.urlRedirect.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.urlRedirect.count({ where }),
  ]);

  return {
    items: items.map((r) => ({
      id: r.id,
      fromPath: r.fromPath,
      toPath: r.toPath,
      statusCode: r.statusCode,
      description: r.description,
      isActive: r.isActive,
      isArchived: !!r.deletedAt,
      hitCount: r.hitCount,
      lastHitAt: r.lastHitAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export class RedirectValidationError extends Error {
  constructor(
    public field: string,
    message: string,
  ) {
    super(message);
  }
}

function normalizePath(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new RedirectValidationError("fromPath", "La ruta no puede estar vacía.");
  // Si es URL externa (http/https), dejar tal cual.
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  // Si no empieza con /, agregarlo. (El lowercase del fromPath lo hace normalizeFromPath — #29.)
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withSlash;
}

// #29 — el fromPath es SIEMPRE una ruta interna nuestra y el match del proxy es case-insensitive.
// Lo normalizamos a minúsculas al ESCRIBIR (y el proxy al LEER), así "/Foo" y "/foo" son la misma
// llave. NUNCA se aplica al toPath: los destinos externos pueden tener paths case-sensitive.
function normalizeFromPath(input: string): string {
  const p = normalizePath(input);
  return /^https?:\/\//i.test(p) ? p : p.toLowerCase();
}

// #24 — rutas VIVAS estáticas del storefront: un redirect con fromPath en una de ellas la ocultaría.
const LIVE_STATIC_PATHS = new Set([
  "/",
  "/productos",
  "/recomendador",
  "/carrito",
  "/ayuda",
  "/contacto",
  "/mi-cuenta",
  "/login",
  "/registro",
  "/legal/privacidad",
  "/legal/terminos",
  "/legal/cookies",
  "/legal/devoluciones",
  "/legal/garantias",
  "/legal/habeas-data",
  "/legal/subprocesadores",
  "/legal/security",
]);

/**
 * #24 — rechaza si fromPath colisiona con una página REAL viva (estática o dinámica activa).
 * Los getters dinámicos solo devuelven contenido activo/publicado, así que los slugs LEGACY
 * archivados devuelven null → PASAN (ese es el caso de uso legítimo del redirect). fromPath ya
 * viene normalizado a minúsculas (los slugs del catálogo son kebab-case ASCII).
 */
async function assertFromPathNotLive(fromPath: string): Promise<void> {
  const reject = () => {
    throw new RedirectValidationError(
      "fromPath",
      "Esa ruta ya es una página real de la tienda. Si creas un redirect ahí, esa página dejaría " +
        "de verse para tus clientes. Elige otra ruta de origen (o edita/archiva la página).",
    );
  };

  if (LIVE_STATIC_PATHS.has(fromPath)) reject();

  const productMatch = fromPath.match(/^\/producto\/([^/?#]+)$/);
  if (productMatch && (await getStorefrontProductBySlug(productMatch[1]))) reject();

  const ocasionMatch = fromPath.match(/^\/ocasion\/([^/?#]+)$/);
  if (ocasionMatch && (await getOcasionBySlug(ocasionMatch[1]))) reject();

  const categoriaMatch = fromPath.match(/^\/productos\/([^/?#]+)$/);
  if (categoriaMatch && (await getCategoryBySlug(categoriaMatch[1]))) reject();
}

/**
 * #24 — evita bucles/cadenas: si el toPath (interno) YA es el fromPath de otro redirect activo,
 * crearlo formaría A→B→C o A→B→A. `selfFromPath` excluye el propio row en updateRedirect.
 */
async function assertNoRedirectChain(toPath: string, selfFromPath?: string): Promise<void> {
  if (/^https?:\/\//i.test(toPath)) return; // destino externo → no hay cadena interna
  const targetPath = new URL(toPath, "http://x").pathname.toLowerCase();
  const chained = await prisma.urlRedirect.findFirst({
    where: {
      fromPath: targetPath,
      isActive: true,
      deletedAt: null,
      ...(selfFromPath ? { NOT: { fromPath: selfFromPath } } : {}),
    },
    select: { id: true },
  });
  if (chained) {
    throw new RedirectValidationError(
      "toPath",
      "El destino ya es el origen de otro redirect activo: se formaría un bucle. Elige un destino " +
        "que sea una página real, no otra redirección.",
    );
  }
}

/**
 * Valida que el DESTINO de un redirect no sea un vector open-redirect disfrazado.
 * Se permite externo http(s):// EXPLÍCITO (por diseño, apuntar a partners) y
 * paths internos seguros; se rechazan "//evil.com" y "/\evil.com" que parecen
 * internos pero el navegador resuelve a un host externo (phishing). [[ADR-046]].
 */
function assertAllowedToPath(toPath: string): void {
  if (!isAllowedRedirectDestination(toPath)) {
    throw new RedirectValidationError(
      "toPath",
      "Destino no permitido. Usa una ruta interna que empiece con '/' " +
        "(sin '//' ni '\\') o una URL externa completa (https://...).",
    );
  }
}

export type RedirectCreateInput = {
  fromPath: string;
  toPath: string;
  statusCode: 301 | 302;
  description?: string | null;
  isActive?: boolean;
};

/*
 * Invalidación del tag "redirects" (B-8, auditoría cableado cliente↔admin
 * 2026-10-02): TODA mutación de UrlRedirect que cambie lo que resuelve el
 * proxy expira el tag de la Data Cache compartida (lookupActiveRedirectCached
 * abajo). updateTag (semántica expire, read-your-own-writes) solo puede
 * llamarse dentro de un Server Action — todos los callers de estas
 * mutaciones lo son (actions de /admin/redirects y services de catálogo
 * invocados desde actions).
 */
function invalidateRedirectsTag() {
  updateTag("redirects");
}

export async function createRedirect(input: RedirectCreateInput, actorAdminId: string) {
  const fromPath = normalizeFromPath(input.fromPath); // #29 — llave case-insensitive
  const toPath = normalizePath(input.toPath);
  assertAllowedToPath(toPath);

  // #29 — self-loop case-insensitive: "/foo → /Foo" también haría bucle en el proxy.
  if (fromPath === toPath.toLowerCase()) {
    throw new RedirectValidationError("toPath", "Origen y destino no pueden ser iguales.");
  }

  if (![301, 302].includes(input.statusCode)) {
    throw new RedirectValidationError("statusCode", "Código debe ser 301 o 302.");
  }

  // #24 — no ocultar una página viva ni formar bucles/cadenas.
  await assertFromPathNotLive(fromPath);
  await assertNoRedirectChain(toPath, fromPath);

  const existing = await prisma.urlRedirect.findUnique({ where: { fromPath } });
  if (existing && !existing.deletedAt) {
    throw new RedirectValidationError("fromPath", `Ya existe un redirect activo para ${fromPath}.`);
  }

  // Si existe pero estaba archivado, reactivar reusando el row.
  const saved =
    existing && existing.deletedAt
      ? await prisma.urlRedirect.update({
          where: { id: existing.id },
          data: {
            toPath,
            statusCode: input.statusCode,
            description: input.description ?? null,
            isActive: input.isActive ?? true,
            deletedAt: null,
            deletedBy: null,
            updatedBy: actorAdminId,
          },
        })
      : await prisma.urlRedirect.create({
          data: {
            fromPath,
            toPath,
            statusCode: input.statusCode,
            description: input.description ?? null,
            isActive: input.isActive ?? true,
            createdBy: actorAdminId,
          },
        });
  invalidateRedirectsTag();
  return saved;
}

/**
 * Redirect automático al RENOMBRAR un slug público (A11-02, cert 2026-09-26):
 * producto (/producto/<slug>), categoría (/productos/<slug>[/...]) u ocasión
 * (/ocasion/<slug>). Antes el rename dejaba las URLs viejas en 404 inmediato
 * (SEO, links de WhatsApp, bot). Lo llaman los services de cada entidad DESPUÉS
 * de un update exitoso, así que el fromPath ya no es una página viva por
 * construcción (no se corre assertFromPathNotLive — los getters dinámicos de
 * esa guardia están cacheados con tag "catalog" y podrían leer stale dentro de
 * la misma acción).
 *
 * Política ante colisiones (decisión de dominio):
 *   1. El rename es AUTORITATIVO sobre la URL vieja: si ya existe un redirect
 *      (activo o archivado) con ese fromPath —p.ej. uno manual del admin— se
 *      RE-APUNTA al slug nuevo y se reactiva (301). La alternativa (respetar el
 *      manual) dejaría la URL vieja apuntando a un destino que ya no refleja el
 *      catálogo.
 *   2. Rename de vuelta (A→B→A): si el DESTINO ya es el fromPath de un redirect
 *      activo, ese path vuelve a ser una página viva → el redirect se ARCHIVA
 *      (dejarlo ocultaría la página y formaría bucle A↔B).
 *   3. Cadenas: redirects activos que apuntaban a la URL vieja se re-apuntan a
 *      la nueva (A→B→C se aplana en A→C + B→C), así nunca se forma cadena.
 */
export async function createSlugRenameRedirect(opts: {
  fromPath: string;
  toPath: string;
  actorAdminId: string | null;
  description?: string;
}): Promise<void> {
  const fromPath = normalizeFromPath(opts.fromPath); // minúsculas (#29)
  const toPath = normalizePath(opts.toPath);
  assertAllowedToPath(toPath);
  if (fromPath === toPath.toLowerCase()) return; // slug sin cambio real

  // (2) El destino vuelve a ser página viva → archivar el redirect que lo ocupa.
  await prisma.urlRedirect.updateMany({
    where: { fromPath: toPath.toLowerCase(), deletedAt: null },
    data: { deletedAt: new Date(), deletedBy: opts.actorAdminId, isActive: false },
  });

  // (3) Aplanar cadenas: quien apuntaba a la URL vieja ahora apunta a la nueva.
  await prisma.urlRedirect.updateMany({
    where: { toPath: fromPath, isActive: true, deletedAt: null },
    data: { toPath, updatedBy: opts.actorAdminId },
  });

  // (1) Upsert autoritativo sobre la URL vieja.
  const description =
    opts.description ?? `Redirect automático por cambio de slug (${fromPath} → ${toPath})`;
  const existing = await prisma.urlRedirect.findUnique({ where: { fromPath } });
  if (existing) {
    await prisma.urlRedirect.update({
      where: { id: existing.id },
      data: {
        toPath,
        statusCode: 301,
        description: existing.description ?? description,
        isActive: true,
        deletedAt: null,
        deletedBy: null,
        updatedBy: opts.actorAdminId,
      },
    });
  } else {
    await prisma.urlRedirect.create({
      data: {
        fromPath,
        toPath,
        statusCode: 301,
        description,
        isActive: true,
        createdBy: opts.actorAdminId,
      },
    });
  }
  invalidateRedirectsTag();
}

/**
 * A11R-03 (revisión adversarial de la remediación, 2026-09-27) — ALTA con slug
 * liberado: si un redirect activo ocupa la URL de la entidad NUEVA (típicamente
 * quedó de un rename previo: A→B deja `/producto/A → /producto/B` y luego se crea
 * un producto nuevo con slug A), el proxy serviría el 301 ANTES que la página
 * (proxy.ts) → la entidad nueva queda inalcanzable sin señal al admin.
 *
 * Política: la página VIVA gana — el redirect que ocupa la URL nueva se ARCHIVA.
 * Es exactamente el paso (2) de createSlugRenameRedirect, aplicado al alta (en el
 * rename ese paso cubre el "rename de vuelta" A→B→A; acá cubre el reuso por alta).
 * Lo llaman los services de catálogo DESPUÉS de crear la entidad, best-effort:
 * el alta ya quedó persistida; un fallo acá es warn en logs, no error de la acción.
 */
export async function archiveRedirectOccupyingPath(
  path: string,
  actorAdminId: string | null,
): Promise<void> {
  const fromPath = normalizeFromPath(path); // minúsculas (#29) — llave del proxy
  await prisma.urlRedirect.updateMany({
    where: { fromPath, deletedAt: null },
    data: { deletedAt: new Date(), deletedBy: actorAdminId, isActive: false },
  });
  invalidateRedirectsTag();
}

export type RedirectUpdateInput = {
  id: string;
  toPath: string;
  statusCode: 301 | 302;
  description?: string | null;
  isActive?: boolean;
};

export async function updateRedirect(input: RedirectUpdateInput, actorAdminId: string) {
  const toPath = normalizePath(input.toPath);
  assertAllowedToPath(toPath);
  if (![301, 302].includes(input.statusCode)) {
    throw new RedirectValidationError("statusCode", "Código debe ser 301 o 302.");
  }

  const existing = await prisma.urlRedirect.findFirst({
    where: { id: input.id, deletedAt: null },
  });
  if (!existing) throw new RedirectValidationError("id", "Redirect no encontrado.");

  // #29 — self-loop case-insensitive (existing.fromPath ya está en minúsculas si se creó tras el fix).
  if (existing.fromPath === toPath.toLowerCase()) {
    throw new RedirectValidationError("toPath", "Origen y destino no pueden ser iguales.");
  }

  // #24 — el nuevo destino no puede ser el origen de otra redirección activa (bucle/cadena).
  // fromPath es inmutable en update, así que no re-chequeamos assertFromPathNotLive.
  await assertNoRedirectChain(toPath, existing.fromPath);

  const updated = await prisma.urlRedirect.update({
    where: { id: input.id },
    data: {
      toPath,
      statusCode: input.statusCode,
      description: input.description ?? null,
      isActive: input.isActive ?? existing.isActive,
      updatedBy: actorAdminId,
    },
  });
  invalidateRedirectsTag();
  return updated;
}

export async function toggleRedirectActive(id: string, actorAdminId: string) {
  const existing = await prisma.urlRedirect.findFirst({
    where: { id, deletedAt: null },
  });
  if (!existing) throw new RedirectValidationError("id", "Redirect no encontrado.");
  const toggled = await prisma.urlRedirect.update({
    where: { id },
    data: { isActive: !existing.isActive, updatedBy: actorAdminId },
  });
  invalidateRedirectsTag();
  return toggled;
}

export async function archiveRedirect(id: string, actorAdminId: string) {
  const archived = await prisma.urlRedirect.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      deletedBy: actorAdminId,
      isActive: false,
    },
  });
  invalidateRedirectsTag();
  return archived;
}

export async function restoreRedirect(id: string, actorAdminId: string) {
  const restored = await prisma.urlRedirect.update({
    where: { id },
    data: { deletedAt: null, deletedBy: null, updatedBy: actorAdminId },
  });
  invalidateRedirectsTag();
  return restored;
}

/**
 * Lookup activo por fromPath. Devuelve { toPath, statusCode } o null si no
 * hay match.
 *
 * Sin caché acá: es el query crudo. El camino caliente del proxy pasa por
 * lookupActiveRedirectCached (abajo), que envuelve este lookup en
 * unstable_cache con tag "redirects".
 */
export async function lookupActiveRedirect(
  fromPath: string,
): Promise<{ toPath: string; statusCode: number } | null> {
  const r = await prisma.urlRedirect.findFirst({
    where: { fromPath, isActive: true, deletedAt: null },
    select: { toPath: true, statusCode: true },
  });
  return r;
}

/**
 * Lista COMPLETA de redirects activos (ADR-131, 2026-10-08): la tabla es chica
 * (~130 filas en PRD) y una sola query cacheada cubre TODAS las rutas — antes
 * el lookup era por-path, así que cada MISS de caché (por ruta distinta, por
 * revalidate de 60s, o tras updateTag) pegaba una query a la DB por request de
 * página, y en ráfaga esas revalidaciones competían por el pool Prisma de la
 * lambda (P2024 medidos) o caían en el flap del pooler (P1001). Con la lista
 * completa hay UN solo cache entry para todo el sitio: a lo sumo 1 query/minuto
 * por instancia, y la invalidación por tag sigue aplicando al instante.
 */
async function listActiveRedirects(): Promise<
  Array<{ fromPath: string; toPath: string; statusCode: number }>
> {
  return prisma.urlRedirect.findMany({
    where: { isActive: true, deletedAt: null },
    select: { fromPath: true, toPath: true, statusCode: true },
  });
}

const cachedListActiveRedirects = unstable_cache(listActiveRedirects, ["url-redirect-list"], {
  tags: ["redirects"],
  revalidate: 60,
});

/**
 * Lookup que consume el proxy (B-8, auditoría cableado cliente↔admin
 * 2026-10-02; lista completa ADR-131 2026-10-08). Antes el proxy llevaba un Map
 * in-memory TTL 60s POR INSTANCIA: en un despliegue multi-instancia (Vercel)
 * las copias divergían hasta 60s y un redirect nuevo tardaba en aplicar.
 * `unstable_cache` usa la Data Cache COMPARTIDA con tag "redirects": toda
 * mutación del service emite updateTag("redirects") (expire inmediato) y el
 * revalidate de 60s queda solo como red de seguridad para cambios que bypassen
 * la app (SQL/seed directo). El runtime del proxy en Next 16 es Node.js (fijo,
 * no configurable — ver docs/upgrading/version-16.md § middleware to proxy),
 * así que unstable_cache está disponible.
 *
 * El match se hace en memoria sobre la lista completa cacheada (130 filas) —
 * una query por minuto por instancia en el peor caso, cero en el típico.
 *
 * Degradación grácil: sin incrementalCache de Next (vitest, scripts
 * standalone) unstable_cache lanza el invariante E469 en Next 16 — lo
 * capturamos y ejecutamos el lookup directo (mismo patrón que cachedCms en
 * lib/cms.ts). Si la DB falla, el error se propaga y el caller decide (el
 * proxy lo envuelve en .catch(() => null): la request sigue sin redirect).
 */
export async function lookupActiveRedirectCached(
  fromPath: string,
): Promise<{ toPath: string; statusCode: number } | null> {
  try {
    const all = await cachedListActiveRedirects();
    const match = all.find((r) => r.fromPath === fromPath);
    return match ? { toPath: match.toPath, statusCode: match.statusCode } : null;
  } catch (err) {
    const code = (err as { __NEXT_ERROR_CODE?: string } | null)?.__NEXT_ERROR_CODE;
    const missingCache =
      code === "E469" || (err instanceof Error && err.message.includes("incrementalCache"));
    if (missingCache) return lookupActiveRedirect(fromPath);
    throw err;
  }
}

/**
 * Incrementa hitCount + lastHitAt (best-effort, no bloqueante).
 * Llamado en background desde proxy tras servir el redirect.
 */
export async function incrementRedirectHit(fromPath: string): Promise<void> {
  await prisma.urlRedirect
    .updateMany({
      where: { fromPath, isActive: true, deletedAt: null },
      data: { hitCount: { increment: 1 }, lastHitAt: new Date() },
    })
    .catch(() => {});
}
