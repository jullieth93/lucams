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
import { cachedCms } from "@/lib/cms";
import {
  deleteProductImage,
  galleryThumbPathFromUrl,
  galleryThumbUrlFromImageUrl,
  listGalleryThumbPaths,
} from "@/lib/storage";
import { parseVariantAttributes } from "@/features/products/variant-schemas";
import { parsePhotoProductConfig } from "./schemas";
import { resolvePersonalizationSurface } from "./surface";
import {
  buildVariantFilterOptions,
  matchesVariantFilter,
  normalizeVariantFilter,
  sameVariantFilter,
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
   * Fase 3 · 3.10 (2026-10-07) — miniatura de exhibición ~800px WebP con
   * watermark LUCAMS (anti-copia + peso; decisión owner: el original no debería
   * llegar al navegador del cliente). Path derivada determinista del imageUrl
   * (gallery-<tag>/thumbs/<uuid>.webp, SIN columna nueva); null cuando el
   * objeto aún no existe en el bucket (filas anteriores al backfill) → el
   * Estudio cae al imageUrl original como fallback transitorio.
   */
  thumbUrl?: string | null;
  /**
   * Fase 5 — subset de attributes de variante al que aplica el diseño
   * (ej. { sizeCm: "2×6" }). null/undefined = aplica a TODAS las variantes.
   */
  variantFilter?: VariantFilter | null;
};

/**
 * PERF (2026-10-07) — el `storage.list` de miniaturas por tag va cacheado con
 * `unstable_cache` (tag `gallery-thumbs`, revalidate 1h): antes corría EN CADA
 * page load del Estudio (página dinámica sin caché) y sumaba 100–500 ms de
 * TTFB por request. El admin invalida con `updateTag("gallery-thumbs")` al
 * subir/archivar/purgar diseños (app/admin/(panel)/disenos/actions.ts). El
 * Set se cachea como array (el incremental cache serializa JSON — un Set no
 * sobrevive el round-trip) y se re-arma en el caller. Fail-open intacto:
 * listGalleryThumbPaths ya degrada a set vacío si storage no responde, y
 * cachedCms ejecuta crudo fuera de un request de Next (vitest/scripts).
 */
const listGalleryThumbPathsCached = cachedCms(
  async (folder: string): Promise<string[]> => [...(await listGalleryThumbPaths(folder))],
  ["gallery-thumbs"],
  { tags: ["gallery-thumbs"], revalidate: 3600 },
);

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
  // 3.10 — thumbUrl solo si la miniatura EXISTE en el bucket (un solo list del
  // folder de thumbs del tag, CACHEADO — ver listGalleryThumbPathsCached;
  // fail-open a "sin thumbs" → fallback al original).
  const thumbPaths = new Set(await listGalleryThumbPathsCached(`gallery-${tag}`));
  const withThumbs = (rows as GalleryImage[]).map((r) => {
    const thumbPath = galleryThumbPathFromUrl(r.imageUrl);
    return {
      ...r,
      thumbUrl:
        thumbPath && thumbPaths.has(thumbPath) ? galleryThumbUrlFromImageUrl(r.imageUrl) : null,
    };
  });
  if (variantAttributes === undefined) return withThumbs;
  return withThumbs.filter((r) => matchesVariantFilter(r.variantFilter, variantAttributes));
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
  /** B-5 (2026-10-02) — soft-delete; se expone para la sección "Archivados". */
  deletedAt: Date | null;
};

/**
 * Lista admin. Por defecto solo las filas NO borradas (vista histórica);
 * con `includeArchived` trae también los soft-deleted (deletedAt no null) para
 * la sección "Archivados" del admin — el Estudio nunca los ve (listGalleryImages
 * filtra deletedAt null + isActive).
 */
export async function listGalleryAdmin(
  tag?: string,
  opts?: { includeArchived?: boolean },
): Promise<AdminGalleryImage[]> {
  const rows = await prisma.designGalleryImage.findMany({
    where: {
      ...(opts?.includeArchived ? {} : { deletedAt: null }),
      ...(tag ? { tag } : {}),
    },
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
      deletedAt: true,
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

/**
 * Fase 3 · 3.6 (2026-10-07) — ARCHIVAR (antes "Borrar", naming engañoso): es un
 * SOFT-delete (deletedAt + isActive=false) — el diseño sale del Estudio y pasa a
 * la sección "Archivados" del admin, restaurable. El borrado REAL es
 * purgeGalleryImage. Best-effort silencioso como siempre (el admin reintenta).
 */
export async function archiveGalleryImage(id: string): Promise<void> {
  await prisma.designGalleryImage
    .update({ where: { id }, data: { deletedAt: new Date(), isActive: false } })
    .catch(() => {});
}

/**
 * Fase 3 · 3.6 — ELIMINAR PERMANENTEMENTE un diseño ARCHIVADO: purga los
 * archivos físicos del bucket (cara A, su miniatura watermark 3.10, cara B y la
 * miniatura de B si existiera) y DESPUÉS borra la fila.
 *
 * Ante fallo de storage ABORTA conservando la fila (deleteProductImage lanza
 * StorageError y el delete de DB no se alcanza): borrar la fila primero dejaría
 * objetos huérfanos sin referencia en DB, imposibles de descubrir/purgar
 * después. Con la fila conservada el admin reintenta (los remove son
 * idempotentes: borrar un objeto inexistente es no-op en Supabase Storage).
 * false si el diseño no existe o NO está archivado (solo se purga desde la
 * sección Archivados — un diseño vivo primero se archiva).
 */
export async function purgeGalleryImage(opts: { id: string }): Promise<boolean> {
  const row = await prisma.designGalleryImage.findFirst({
    where: { id: opts.id, deletedAt: { not: null } },
    select: { imageUrl: true, imageUrlB: true },
  });
  if (!row) return false;
  for (const url of [row.imageUrl, row.imageUrlB]) {
    if (!url) continue;
    const thumbUrl = galleryThumbUrlFromImageUrl(url);
    // Miniatura primero (no-op silencioso si la URL es ajena al bucket o el
    // objeto no existe); luego el original.
    if (thumbUrl) await deleteProductImage(thumbUrl);
    await deleteProductImage(url);
  }
  await prisma.designGalleryImage.delete({ where: { id: opts.id } });
  return true;
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

/**
 * B-5 (2026-10-02) — pausar/reactivar un diseño SIN borrarlo: isActive=false lo
 * saca del Estudio (listGalleryImages filtra isActive) pero sigue visible en el
 * admin, atenuado. Resuelve el "para ocultar hay que borrar" del backlog.
 */
export async function setGalleryImageActive(opts: {
  id: string;
  isActive: boolean;
  adminId: string;
}): Promise<void> {
  await prisma.designGalleryImage.update({
    where: { id: opts.id },
    data: { isActive: opts.isActive, updatedBy: opts.adminId },
  });
}

/**
 * B-5 — restaura un soft-deleted: deletedAt=null y vuelve PAUSADO
 * (isActive=false) para que Lucy lo revise antes de exponerlo en el Estudio.
 * Recibe order al final del tag (count de no borrados) para no chocar con el
 * orden de los que quedaron. false si el diseño no existe o no está archivado.
 */
export async function restoreGalleryImage(opts: { id: string; adminId: string }): Promise<boolean> {
  const row = await prisma.designGalleryImage.findFirst({
    where: { id: opts.id, deletedAt: { not: null } },
    select: { tag: true },
  });
  if (!row) return false;
  const count = await prisma.designGalleryImage.count({
    where: { tag: row.tag, deletedAt: null },
  });
  await prisma.designGalleryImage.update({
    where: { id: opts.id },
    data: { deletedAt: null, isActive: false, order: count, updatedBy: opts.adminId },
  });
  return true;
}

/**
 * B-5 — reorden por swap con el ADYACENTE dentro del grupo visible del admin:
 * mismo tag + mismo variantFilter normalizado (es la partición que muestran los
 * chips de la grilla: "2×6", "Sin asignar", etc.; en productos sin opciones de
 * filtro el grupo es todo el tag). Transacción con los dos updates. false si el
 * diseño no existe, está archivado o no tiene vecino en esa dirección.
 */
export async function reorderGalleryImage(opts: {
  id: string;
  direction: "up" | "down";
  adminId: string;
}): Promise<boolean> {
  const target = await prisma.designGalleryImage.findFirst({
    where: { id: opts.id, deletedAt: null },
    select: { id: true, tag: true, order: true, variantFilter: true },
  });
  if (!target) return false;
  const rows = await prisma.designGalleryImage.findMany({
    where: { tag: target.tag, deletedAt: null },
    orderBy: { order: "asc" },
    select: { id: true, order: true, variantFilter: true },
  });
  const targetFilter = normalizeVariantFilter(target.variantFilter);
  const group = rows.filter((r) =>
    sameVariantFilter(normalizeVariantFilter(r.variantFilter), targetFilter),
  );
  const idx = group.findIndex((r) => r.id === target.id);
  const neighborIdx = opts.direction === "up" ? idx - 1 : idx + 1;
  if (idx === -1 || neighborIdx < 0 || neighborIdx >= group.length) return false;
  const neighbor = group[neighborIdx];
  // Orders iguales (legacy) harían el swap un no-op invisible: no tocar nada.
  if (neighbor.order === target.order) return false;
  await prisma.$transaction([
    prisma.designGalleryImage.update({
      where: { id: target.id },
      data: { order: neighbor.order, updatedBy: opts.adminId },
    }),
    prisma.designGalleryImage.update({
      where: { id: neighbor.id },
      data: { order: target.order, updatedBy: opts.adminId },
    }),
  ]);
  return true;
}
