/*
 * ADR-057 Fase B2 — Galería de diseños PREDISEÑADOS. Imágenes listas que el cliente aplica a un
 * slot en el editor (en vez de subir su foto). Agrupadas por `tag` (ej. "separadores") y, desde la
 * Fase 5 (2026-10-02), segregables por ATRIBUTO DE VARIANTE vía `variantFilter` (subset de
 * ProductVariant.attributes, ej. {"sizeCm":"2×6"}; null = aplica a TODAS las variantes). El
 * admin las gestiona; el editor las ofrece filtradas por la variante elegida + al elegir una,
 * se llena el slot reusando el pipeline de foto. El matching es puro y vive en
 * design-gallery-filter.ts (matchesVariantFilter).
 */

import "server-only";
import { Prisma, prisma } from "@/lib/db";
import { parseVariantAttributes } from "@/features/products/variant-schemas";
import { parsePhotoProductConfig } from "./schemas";
import { resolvePersonalizationSurface } from "./surface";
import {
  buildVariantFilterOptions,
  matchesVariantFilter,
  type VariantFilter,
  type VariantFilterOption,
} from "./design-gallery-filter";

export type GalleryImage = {
  id: string;
  name: string;
  imageUrl: string;
  /** Ola 21 — URL opcional de la cara B (pares A/B para separadores). */
  imageUrlB?: string | null;
  /**
   * Fase 5 — subset de attributes de variante al que aplica el diseño
   * (ej. { sizeCm: "2×6" }). null/undefined = aplica a TODAS las variantes.
   */
  variantFilter?: VariantFilter | null;
};

/**
 * Diseños prediseñados activos de un tag, para el editor (público).
 *
 * Fase 5 — con `variantAttributes` (attributes de la variante elegida en el
 * Estudio) filtra por subset-match: entran las filas con variantFilter null
 * (aplican a todas) + las cuyo filtro es subset de esos attributes
 * (matchesVariantFilter). Filtrado en memoria: la cardinalidad por tag es
 * chica (decenas) y el criterio puro ya está testeado — un where Json de
 * Prisma no expresa subset-match. SIN `variantAttributes` (undefined) se
 * devuelve todo el tag: comportamiento histórico para callers que no conocen
 * la variante. OJO: `{}` sí filtra (variante sin attributes declarados → solo
 * diseños sin filtro).
 */
export async function listGalleryImages(
  tag: string,
  variantAttributes?: Record<string, unknown>,
): Promise<GalleryImage[]> {
  const rows = await prisma.designGalleryImage.findMany({
    where: { tag, isActive: true, deletedAt: null },
    orderBy: { order: "asc" },
    select: { id: true, name: true, imageUrl: true, imageUrlB: true, variantFilter: true },
  });
  if (variantAttributes === undefined) return rows as GalleryImage[];
  return (rows as GalleryImage[]).filter((r) =>
    matchesVariantFilter(r.variantFilter, variantAttributes),
  );
}

/** Ola 21 — Lee el diseño prediseñado completo (cara A y cara B). Es el reader de la acción de llenar slot. */
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
  /**
   * Fase 5 — opciones del selector "Aplica a" (filtro por atributo de variante),
   * derivadas de las variantes ACTIVAS del producto (buildVariantFilterOptions:
   * el primer atributo filtrable con >1 valor, prioriza sizeCm). [] = el
   * producto no varía por atributos filtrables → solo "Todas las variantes".
   */
  variantFilterOptions: VariantFilterOption[];
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
    select: {
      name: true,
      slug: true,
      personalizationKind: true,
      personalizationSchema: true,
      // Fase 5 — attributes de las variantes activas: alimentan el selector
      // "Aplica a" del admin (filtro por atributo de variante).
      variants: { where: { isActive: true }, select: { attributes: true } },
    },
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
      variantFilterOptions: buildVariantFilterOptions(
        p.variants.map((v) => parseVariantAttributes(v.attributes)),
      ),
    });
  }
  return options;
}

/**
 * Attributes (parseados) de las variantes ACTIVAS del producto dueño de un tag
 * de galería — misma resolución de tag que listGalleryTagOptions (galleryTag
 * explícito o, sin él, el slug si la superficie es de foto). La usa la
 * validación del upload (variantFilterMatchesAnyVariant: el filtro debe
 * corresponder a una variante real) y las expectativas de tira
 * (gallery-strip.ts). [] si el tag no resuelve producto.
 */
export async function listGalleryTagVariantAttributes(
  tag: string,
): Promise<Record<string, unknown>[]> {
  const products = await prisma.product.findMany({
    where: { isActive: true, deletedAt: null },
    select: {
      slug: true,
      personalizationKind: true,
      personalizationSchema: true,
      variants: { where: { isActive: true }, select: { attributes: true } },
    },
  });
  for (const p of products) {
    const schema = p.personalizationSchema as { galleryTag?: unknown } | null;
    const explicit = typeof schema?.galleryTag === "string" ? schema.galleryTag : null;
    const resolved =
      explicit ??
      (resolvePersonalizationSurface(
        p.personalizationKind,
        p.personalizationSchema as Record<string, unknown> | null,
      ).surface === "photo"
        ? p.slug
        : null);
    if (resolved !== tag) continue;
    return p.variants.map((v) => parseVariantAttributes(v.attributes));
  }
  return [];
}

export type AdminGalleryImage = {
  id: string;
  tag: string;
  name: string;
  imageUrl: string;
  imageUrlB: string | null;
  /** Fase 5 — subset de attributes de variante al que aplica (null = todas). */
  variantFilter: VariantFilter | null;
  isActive: boolean;
  order: number;
};

export async function listGalleryAdmin(tag?: string): Promise<AdminGalleryImage[]> {
  const rows = await prisma.designGalleryImage.findMany({
    where: { deletedAt: null, ...(tag ? { tag } : {}) },
    orderBy: [{ tag: "asc" }, { order: "asc" }],
    select: {
      id: true,
      tag: true,
      name: true,
      imageUrl: true,
      imageUrlB: true,
      variantFilter: true,
      isActive: true,
      order: true,
    },
  });
  return rows as AdminGalleryImage[];
}

export async function createGalleryImage(opts: {
  tag: string;
  name: string;
  imageUrl: string;
  imageUrlB?: string | null;
  /** Fase 5 — filtro por atributo de variante (null/omitido = todas las variantes). */
  variantFilter?: VariantFilter | null;
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
      variantFilter: opts.variantFilter ?? Prisma.DbNull,
      order: count,
      isActive: true,
      createdBy: opts.adminId,
      updatedBy: opts.adminId,
    },
    select: { id: true },
  });
  return row;
}

export async function deleteGalleryImage(id: string): Promise<void> {
  await prisma.designGalleryImage
    .update({ where: { id }, data: { deletedAt: new Date(), isActive: false } })
    .catch(() => {});
}

/**
 * Tag de un diseño (para re-validar un variantFilter contra las variantes del
 * producto dueño al EDITARLO — updateGalleryVariantFilterAction). null si el
 * diseño no existe o está borrado.
 */
export async function getGalleryImageTag(id: string): Promise<string | null> {
  const row = await prisma.designGalleryImage.findFirst({
    where: { id, deletedAt: null },
    select: { tag: true },
  });
  return row?.tag ?? null;
}

/**
 * Edición del filtro por variante de UN diseño (modal de detalle del admin).
 * variantFilter null → DbNull = "aplica a todas las variantes" (misma
 * materialización que createGalleryImage).
 */
export async function updateGalleryVariantFilter(opts: {
  id: string;
  variantFilter: VariantFilter | null;
  adminId: string;
}): Promise<void> {
  await prisma.designGalleryImage.update({
    where: { id: opts.id },
    data: { variantFilter: opts.variantFilter ?? Prisma.DbNull, updatedBy: opts.adminId },
  });
}

/**
 * Asignación masiva: pone `variantFilter` a TODOS los diseños del tag que aún
 * no tienen filtro (null = "Todas"; DbNull o JsonNull legacy) y no están
 * borrados. Resuelve el caso real sin SQL: las 51 imágenes de separadores
 * subidas antes del selector "Aplica a". Devuelve cuántas filas tocó.
 */
export async function assignVariantFilterToUnassigned(opts: {
  tag: string;
  variantFilter: VariantFilter;
  adminId: string;
}): Promise<number> {
  const res = await prisma.designGalleryImage.updateMany({
    where: {
      tag: opts.tag,
      deletedAt: null,
      OR: [
        { variantFilter: { equals: Prisma.DbNull } },
        { variantFilter: { equals: Prisma.JsonNull } },
      ],
    },
    data: { variantFilter: opts.variantFilter, updatedBy: opts.adminId },
  });
  return res.count;
}
