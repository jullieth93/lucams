/*
 * Service layer — CMS (CmsBlock + CmsBlockVersion + SiteSetting).
 *
 * Lógica de dominio pura: Prisma + tipos, sin imports de next/* ni
 * @/lib/supabase. Server actions envuelven con auth + revalidación.
 */

import "server-only";
import { prisma, type Prisma } from "@/lib/db";
import type {
  CmsBlockCreateInput,
  CmsBlockUpdateInput,
  SiteSettingCreateInput,
  SiteSettingUpdateInput,
} from "./schemas";

export class CmsValidationError extends Error {
  constructor(
    public field: "key" | "general",
    message: string,
  ) {
    super(message);
    this.name = "CmsValidationError";
  }
}

// ─────────────────── CmsBlock ───────────────────

export async function listCmsBlocks(opts: {
  category?: string;
  search?: string;
  includeUnpublished?: boolean;
}) {
  const where: Prisma.CmsBlockWhereInput = {
    deletedAt: null,
    ...(opts.category
      ? { category: opts.category as Prisma.EnumBlockCategoryFilter["equals"] }
      : {}),
    ...(opts.search
      ? {
          OR: [
            { key: { contains: opts.search, mode: "insensitive" } },
            { title: { contains: opts.search, mode: "insensitive" } },
            { description: { contains: opts.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  return prisma.cmsBlock.findMany({
    where,
    orderBy: [{ category: "asc" }, { key: "asc" }],
    include: { publishedVersion: { select: { version: true, publishedAt: true } } },
  });
}

export async function getCmsBlockById(id: string) {
  return prisma.cmsBlock.findFirst({
    where: { id, deletedAt: null },
    include: {
      publishedVersion: true,
      versions: { orderBy: { version: "desc" }, take: 50 },
    },
  });
}

export async function createCmsBlock(input: CmsBlockCreateInput, createdBy: string | null) {
  // Verificar unicidad de key.
  const conflict = await prisma.cmsBlock.findUnique({
    where: { key: input.key },
    select: { id: true },
  });
  if (conflict) {
    throw new CmsValidationError("key", `El identificador "${input.key}" ya existe`);
  }

  // Crear bloque + primera versión (borrador) en transacción.
  return prisma.$transaction(async (tx) => {
    const block = await tx.cmsBlock.create({
      data: {
        key: input.key,
        title: input.title ?? null,
        body: input.body,
        format: input.format,
        category: input.category,
        description: input.description ?? null,
        isPublished: false,
        ...(createdBy ? { createdBy } : {}),
      },
    });
    await tx.cmsBlockVersion.create({
      data: {
        blockId: block.id,
        version: 1,
        title: input.title ?? null,
        body: input.body,
        format: input.format,
        publishedAt: null,
        ...(createdBy ? { createdBy } : {}),
      },
    });
    return block;
  });
}

/**
 * Guarda una nueva versión del bloque. NO publica automáticamente:
 * el body actual del CmsBlock se actualiza (= último borrador) pero
 * `publishedVersionId` no cambia hasta que el admin pulse "Publicar".
 */
export async function saveCmsBlockDraft(input: CmsBlockUpdateInput, updatedBy: string | null) {
  const existing = await prisma.cmsBlock.findUnique({
    where: { id: input.id },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!existing || existing.deletedAt) {
    throw new CmsValidationError("general", "Bloque no encontrado");
  }
  const nextVersion = (existing.versions[0]?.version ?? 0) + 1;
  const format = input.format ?? existing.format;

  return prisma.$transaction(async (tx) => {
    const version = await tx.cmsBlockVersion.create({
      data: {
        blockId: existing.id,
        version: nextVersion,
        title: input.title ?? existing.title,
        body: input.body,
        format,
        publishedAt: null,
        ...(updatedBy ? { createdBy: updatedBy } : {}),
      },
    });
    await tx.cmsBlock.update({
      where: { id: existing.id },
      data: {
        title: input.title ?? existing.title,
        body: input.body,
        format,
        category: input.category ?? existing.category,
        description: input.description ?? existing.description,
        ...(updatedBy ? { updatedBy } : {}),
      },
    });
    return version;
  });
}

/**
 * Publica una versión específica del bloque (la marca como activa
 * en el sitio público). El bloque queda `isPublished: true` y
 * `publishedVersionId` apunta a esta versión.
 */
export async function publishCmsBlockVersion(
  blockId: string,
  versionId: string,
  publishedBy: string | null,
) {
  const version = await prisma.cmsBlockVersion.findFirst({
    where: { id: versionId, blockId },
  });
  if (!version) throw new CmsValidationError("general", "Versión no encontrada");

  return prisma.$transaction(async (tx) => {
    await tx.cmsBlockVersion.update({
      where: { id: version.id },
      data: { publishedAt: new Date() },
    });
    return tx.cmsBlock.update({
      where: { id: blockId },
      data: {
        isPublished: true,
        publishedVersionId: version.id,
        ...(publishedBy ? { updatedBy: publishedBy } : {}),
      },
    });
  });
}

/**
 * Despublica el bloque: queda en DB pero el sitio público no lo ve
 * (cae al fallback hardcoded del componente).
 */
export async function unpublishCmsBlock(blockId: string, updatedBy: string | null) {
  return prisma.cmsBlock.update({
    where: { id: blockId },
    data: {
      isPublished: false,
      publishedVersionId: null,
      ...(updatedBy ? { updatedBy } : {}),
    },
  });
}

export async function softDeleteCmsBlock(id: string, deletedBy: string | null) {
  return prisma.cmsBlock.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      isPublished: false,
      publishedVersionId: null,
      ...(deletedBy ? { deletedBy } : {}),
    },
  });
}

// ─────────────────── SiteSetting ───────────────────

export async function listSiteSettings() {
  return prisma.siteSetting.findMany({
    orderBy: [{ category: "asc" }, { key: "asc" }],
  });
}

export async function getSiteSettingById(id: string) {
  return prisma.siteSetting.findUnique({ where: { id } });
}

export async function createSiteSetting(input: SiteSettingCreateInput, createdBy: string | null) {
  const conflict = await prisma.siteSetting.findUnique({
    where: { key: input.key },
    select: { id: true },
  });
  if (conflict) {
    throw new CmsValidationError("key", `El identificador "${input.key}" ya existe`);
  }
  return prisma.siteSetting.create({
    data: {
      key: input.key,
      value: input.value,
      valueType: input.valueType,
      label: input.label,
      description: input.description ?? null,
      category: input.category,
      ...(createdBy ? { createdBy } : {}),
    },
  });
}

export async function updateSiteSetting(input: SiteSettingUpdateInput, updatedBy: string | null) {
  return prisma.siteSetting.update({
    where: { id: input.id },
    data: {
      value: input.value,
      ...(input.label ? { label: input.label } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(updatedBy ? { updatedBy } : {}),
    },
  });
}
