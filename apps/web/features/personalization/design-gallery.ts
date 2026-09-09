/*
 * ADR-057 Fase B2 — Galería de diseños PREDISEÑADOS. Imágenes listas que el cliente aplica a un
 * slot en el editor (en vez de subir su foto). Agrupadas por `tag` (ej. "separadores"). El admin
 * las gestiona; el editor las ofrece + al elegir una, se llena el slot reusando el pipeline de foto.
 */

import "server-only";
import { prisma } from "@/lib/db";
import { parsePhotoProductConfig } from "./schemas";
import { resolvePersonalizationSurface } from "./surface";

export type GalleryImage = {
  id: string;
  name: string;
  imageUrl: string;
  /** Ola 21 — URL opcional de la cara B (pares A/B para separadores). */
  imageUrlB?: string | null;
};

/** Diseños prediseñados activos de un tag, para el editor (público). */
export async function listGalleryImages(tag: string): Promise<GalleryImage[]> {
  const rows = await prisma.designGalleryImage.findMany({
    where: { tag, isActive: true, deletedAt: null },
    orderBy: { order: "asc" },
    select: { id: true, name: true, imageUrl: true, imageUrlB: true },
  });
  return rows;
}

/** URL pública de un diseño de la galería (para la acción de llenar slot). */
export async function getGalleryImageUrl(id: string): Promise<string | null> {
  const row = await prisma.designGalleryImage.findFirst({
    where: { id, isActive: true, deletedAt: null },
    select: { imageUrl: true },
  });
  return row?.imageUrl ?? null;
}

/** Ola 21 — Lee el diseño prediseñado completo (cara A y cara B). */
export async function getGalleryImageById(
  id: string,
): Promise<{ id: string; imageUrl: string; imageUrlB: string | null } | null> {
  const row = await prisma.designGalleryImage.findFirst({
    where: { id, isActive: true, deletedAt: null },
    select: { id: true, imageUrl: true, imageUrlB: true },
  });
  return row ?? null;
}

// ──────────────────────── Admin ────────────────────────

export type GalleryTagOption = {
  /**
   * galleryTag declarado en el personalizationSchema del producto o, si no lo
   * declara, su slug (default-on 2026-09-09: el Estudio aplica el mismo fallback,
   * ver app/estudio/[slug]/page.tsx).
   */
  tag: string;
  /** Nombre del producto (label del selector en el admin). */
  label: string;
  /** true si el producto tiene 2 caras de diseño (facesPerUnit=2 → pares A/B, separadores). */
  needsFaceB: boolean;
};

/**
 * Tags de galería disponibles = TODO producto ACTIVO cuya superficie del Estudio
 * es la de FOTO (los editores de letras/nombre no muestran galería). El tag es el
 * `personalizationSchema.galleryTag` explícito si existe; si no, el SLUG del
 * producto (default-on 2026-09-09, owner: la galería deja de ser opt-in por
 * producto — el Estudio usa ese mismo fallback, así que lo que el admin sube bajo
 * el slug aparece en el editor del producto sin tocar código ni el schema).
 * ÚNICA fuente de verdad compartida por el selector del admin y la validación del
 * upload: antes ambos lados tenían listas hardcodeadas y desalineadas
 * ("separadores"/"fotoimanes" vs "separadores-magneticos") → subir separadores
 * siempre fallaba con "Producto inválido" y la cara B era inalcanzable.
 */
export async function listGalleryTagOptions(): Promise<GalleryTagOption[]> {
  const products = await prisma.product.findMany({
    where: { isActive: true, deletedAt: null },
    select: { name: true, slug: true, personalizationKind: true, personalizationSchema: true },
    orderBy: { name: "asc" },
  });
  const seen = new Set<string>();
  const options: GalleryTagOption[] = [];
  for (const p of products) {
    // galleryTag NO está en PhotoProductConfigSchema (Zod lo strippea): se lee
    // directo del JSON, igual que app/estudio/[slug]/page.tsx.
    const schema = p.personalizationSchema as { galleryTag?: unknown } | null;
    const explicit = typeof schema?.galleryTag === "string" ? schema.galleryTag : null;
    // Sin galleryTag explícito: solo productos con superficie de FOTO (el Estudio
    // aplica el fallback al slug solo en esa ruta — admin↔cliente alineados).
    const tag =
      explicit ??
      (resolvePersonalizationSurface(
        p.personalizationKind,
        p.personalizationSchema as Record<string, unknown> | null,
      ).surface === "photo"
        ? p.slug
        : null);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    options.push({
      tag,
      label: p.name,
      needsFaceB: parsePhotoProductConfig(p.personalizationSchema).facesPerUnit === 2,
    });
  }
  return options;
}

export type AdminGalleryImage = {
  id: string;
  tag: string;
  name: string;
  imageUrl: string;
  imageUrlB: string | null;
  isActive: boolean;
  order: number;
};

export async function listGalleryAdmin(tag?: string): Promise<AdminGalleryImage[]> {
  return prisma.designGalleryImage.findMany({
    where: { deletedAt: null, ...(tag ? { tag } : {}) },
    orderBy: [{ tag: "asc" }, { order: "asc" }],
    select: {
      id: true,
      tag: true,
      name: true,
      imageUrl: true,
      imageUrlB: true,
      isActive: true,
      order: true,
    },
  });
}

export async function createGalleryImage(opts: {
  tag: string;
  name: string;
  imageUrl: string;
  imageUrlB?: string | null;
  adminId: string;
}): Promise<{ id: string }> {
  const count = await prisma.designGalleryImage.count({
    where: { tag: opts.tag, deletedAt: null },
  });
  const row = await prisma.designGalleryImage.create({
    data: {
      tag: opts.tag,
      name: opts.name,
      imageUrl: opts.imageUrl,
      imageUrlB: opts.imageUrlB ?? null,
      order: count,
      isActive: true,
      createdBy: opts.adminId,
      updatedBy: opts.adminId,
    },
    select: { id: true },
  });
  return row;
}

export async function updateGalleryImage(
  id: string,
  opts: { name?: string; imageUrl?: string; imageUrlB?: string | null; isActive?: boolean },
): Promise<void> {
  const data: Record<string, unknown> = {};
  if (opts.name !== undefined) data.name = opts.name;
  if (opts.imageUrl !== undefined) data.imageUrl = opts.imageUrl;
  if (opts.imageUrlB !== undefined) data.imageUrlB = opts.imageUrlB ?? null;
  if (opts.isActive !== undefined) data.isActive = opts.isActive;
  if (Object.keys(data).length === 0) return;
  await prisma.designGalleryImage.update({ where: { id }, data });
}

export async function deleteGalleryImage(id: string): Promise<void> {
  await prisma.designGalleryImage
    .update({ where: { id }, data: { deletedAt: new Date(), isActive: false } })
    .catch(() => {});
}
