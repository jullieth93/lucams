/*
 * Acceso a la DB del ambiente para los specs E2E (PROMPT_E2E_HOMOLOGACION §5.1:
 * "los datos esperados se consultan, no se hardcodean").
 *
 * Singleton perezoso por worker. El runner ya cargó el .env del ambiente
 * (ver _setup/env.ts) → PrismaClient toma DATABASE_URL/DIRECT_URL del aire.
 */
import { PrismaClient } from "@lucams/db";

let client: PrismaClient | null = null;

export function db(): PrismaClient {
  if (!client) client = new PrismaClient();
  return client;
}

export async function disconnectDb(): Promise<void> {
  if (client) await client.$disconnect();
  client = null;
}

/** Estado CMS completo de un campo: borrador (body) + versión publicada viva. */
export async function getCmsFieldState(key: string) {
  const field = await db().cmsField.findUnique({
    where: { key },
    include: { publishedVersion: { select: { id: true, body: true, version: true } } },
  });
  if (!field) return null;
  return {
    id: field.id,
    key: field.key,
    /** Borrador actual (lo que edita el admin). */
    draftBody: field.body,
    isPublished: field.isPublished,
    publishedVersionId: field.publishedVersionId,
    /** Lo que el storefront muestra (publishedVersion.body — lib/cms.ts). */
    publishedBody: field.publishedVersion?.body ?? null,
  };
}

/** Conteos de catálogo para paridad entre ambientes (homologación §3). */
export async function getCatalogCounts() {
  const [productsActive, productsTotal, categories, variants, ocasiones, cmsFields] =
    await Promise.all([
      db().product.count({ where: { isActive: true, deletedAt: null } }),
      db().product.count({ where: { deletedAt: null } }),
      db().category.count({ where: { deletedAt: null } }),
      db().productVariant.count({ where: { deletedAt: null } }),
      db().ocasionTag.count({ where: { deletedAt: null } }),
      db().cmsField.count({ where: { deletedAt: null } }),
    ]);
  return { productsActive, productsTotal, categories, variants, ocasiones, cmsFields };
}

/** Un producto activo real de la DB del ambiente (nada inventado). */
export async function getActiveProduct(opts: { personalizable?: boolean } = {}) {
  return db().product.findFirst({
    where: {
      isActive: true,
      deletedAt: null,
      ...(opts.personalizable !== undefined ? { isPersonalizable: opts.personalizable } : {}),
    },
    select: {
      id: true,
      slug: true,
      name: true,
      basePrice: true,
      isPersonalizable: true,
      variants: {
        where: { isActive: true, deletedAt: null },
        select: { id: true, name: true, price: true, stock: true },
        take: 5,
      },
    },
  });
}
