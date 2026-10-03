/*
 * ADR-057 Fase B2 — Server actions del admin de "Diseños prediseñados". Lucy sube imágenes de
 * diseño listas (por producto/tag); el cliente las aplica a un slot en el editor. Reutiliza
 * uploadProductImage (magic bytes) con el tag como prefijo de carpeta.
 *
 * Fase 5 (2026-10-02) — el upload acepta `variantFilter` (JSON, subset de
 * attributes de variante, ej. {"sizeCm":"2×6"}): el diseño aplica solo a las
 * variantes que contienen ese subset. Se valida contra las variantes REALES
 * del producto (variantFilterMatchesAnyVariant: debe matchear al menos una,
 * si no el diseño quedaría inalcanzable en el Estudio).
 *
 * B-5 (2026-10-02, auditoría cableado cliente↔admin) — ciclo de vida completo
 * sin borrar: toggle isActive (pausar/reactivar), restore de archivados
 * (vuelven pausados) y reorden por swap de `order` entre adyacentes.
 */

"use server";

import { revalidatePath } from "next/cache";
import { recordAdminAction } from "@/lib/admin-audit";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { logger } from "@/lib/logger";
import { StorageError, sniffImageMime, uploadProductImage } from "@/lib/storage";
import {
  assignVariantFilterToUnassigned,
  createGalleryImage,
  deleteGalleryImage,
  getGalleryImageTag,
  listGalleryTagOptions,
  listGalleryTagVariantAttributes,
  reorderGalleryImage,
  restoreGalleryImage,
  setGalleryImageActive,
  updateGalleryVariantFilter,
} from "@/features/personalization/design-gallery";
import {
  normalizeVariantFilter,
  variantFilterMatchesAnyVariant,
  type VariantFilter,
} from "@/features/personalization/design-gallery-filter";
import {
  GalleryStripError,
  getGalleryStripExpectations,
  splitGalleryStripImage,
} from "@/features/personalization/gallery-strip";

type ActionResult = { error?: string };

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * Fase 5 — parsea y valida el `variantFilter` del form (JSON string; vacío =
 * null = "todas las variantes"). El filtro debe ser subset-match de AL MENOS
 * una variante activa real del producto del tag — un filtro que no matchea
 * nada dejaría el diseño invisible en el Estudio (error de captura, no de
 * concepto), así que se rechaza acá con mensaje amable.
 */
async function parseVariantFilterInput(
  formData: FormData,
  tag: string,
): Promise<{ filter: VariantFilter | null; error?: string }> {
  const raw = String(formData.get("variantFilter") ?? "").trim();
  if (!raw) return { filter: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { filter: null, error: "El filtro de variante no es válido." };
  }
  const filter = normalizeVariantFilter(parsed);
  if (!filter) return { filter: null };
  const variantsAttributes = await listGalleryTagVariantAttributes(tag);
  if (!variantFilterMatchesAnyVariant(filter, variantsAttributes)) {
    return {
      filter: null,
      error: "Ese filtro no corresponde a ninguna variante de este producto.",
    };
  }
  return { filter };
}

export async function uploadGalleryImageAction(formData: FormData): Promise<ActionResult> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });

  const tag = String(formData.get("tag") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const file = formData.get("file");
  const fileB = formData.get("fileB");
  const stripMode = formData.get("mode") === "strip";
  const swapFaces = formData.get("swapFaces") === "1";
  // El tag es válido solo si un producto ACTIVO lo resuelve como su tag de
  // galería (galleryTag explícito o, sin él, su slug — default-on 2026-09-09;
  // misma fuente que el selector del admin — nada hardcodeado, no se desalinea).
  const tagOptions = await listGalleryTagOptions();
  if (!tagOptions.some((o) => o.tag === tag)) return { error: "Producto inválido." };
  if (name.length < 2 || name.length > 60)
    return { error: "El nombre debe tener 2–60 caracteres." };
  if (!(file instanceof File)) return { error: "Falta la imagen." };

  // Fase 5 — filtro por atributo de variante ("Aplica a" del admin).
  const { filter: variantFilter, error: filterError } = await parseVariantFilterInput(
    formData,
    tag,
  );
  if (filterError) return { error: filterError };

  try {
    if (stripMode) {
      return await uploadStripMode({
        tag,
        name,
        file,
        swapFaces,
        variantFilter,
        adminId: session.admin.id,
      });
    }
    const [{ publicUrl }, urlB] = await Promise.all([
      uploadProductImage({ productId: `gallery-${tag}`, file }),
      fileB instanceof File
        ? uploadProductImage({ productId: `gallery-${tag}-b`, file: fileB }).then(
            (r) => r.publicUrl,
          )
        : Promise.resolve(null),
    ]);
    const row = await createGalleryImage({
      tag,
      name,
      imageUrl: publicUrl,
      imageUrlB: urlB,
      variantFilter,
      adminId: session.admin.id,
    });
    await recordAdminAction({
      actorId: session.admin.id,
      action: "galleryImage.create",
      entityType: "DesignGalleryImage",
      entityId: row.id,
      metadata: { tag, name, ...(variantFilter ? { variantFilter } : {}) },
    });
    revalidatePath("/admin/disenos");
    return {};
  } catch (err) {
    const message =
      err instanceof StorageError || err instanceof GalleryStripError
        ? err.message
        : "No se pudo subir el diseño.";
    logger.warn(
      { event: "admin.gallery.upload_fail", adminId: session.admin.id, tag, err: message },
      "Failed to upload gallery image",
    );
    return { error: message };
  }
}

/**
 * Modo "Una sola imagen (ambas caras)": la tira vertical en formato doblez
 * (cara A abajo derecha, cara B arriba rotada 180°) se parte a la mitad;
 * la cara B se normaliza rotándola 180° (ver gallery-strip.ts). Valida la
 * proporción contra los tamaños de variante del producto antes de subir —
 * Fase 5: si el diseño lleva variantFilter.sizeCm, solo contra ESE tamaño.
 */
async function uploadStripMode(input: {
  tag: string;
  name: string;
  file: File;
  swapFaces: boolean;
  variantFilter: VariantFilter | null;
  adminId: string;
}): Promise<ActionResult> {
  const { tag, name, file, swapFaces, variantFilter, adminId } = input;
  if (file.size === 0) return { error: "El archivo está vacío." };
  if (file.size > MAX_UPLOAD_BYTES) {
    return { error: `El archivo excede ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.` };
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const realMime = sniffImageMime(buffer);
  if (!realMime || !ALLOWED_MIME.has(realMime)) {
    return { error: "El archivo no es una imagen válida (jpg/png/webp/avif)." };
  }

  const expected = await getGalleryStripExpectations(
    tag,
    typeof variantFilter?.sizeCm === "string" ? variantFilter.sizeCm : undefined,
  );
  if (expected.length === 0) {
    return {
      error:
        "Este producto no tiene tamaños de variante configurados para validar la tira. Sube el diseño por caras.",
    };
  }
  const split = await splitGalleryStripImage({ buffer, expected, swapFaces });

  const toFile = (buf: Buffer, filename: string) =>
    new File([new Uint8Array(buf)], filename, { type: "image/webp" });
  const [upA, upB] = await Promise.all([
    uploadProductImage({ productId: `gallery-${tag}`, file: toFile(split.faceA, "cara-a.webp") }),
    uploadProductImage({ productId: `gallery-${tag}-b`, file: toFile(split.faceB, "cara-b.webp") }),
  ]);
  const row = await createGalleryImage({
    tag,
    name,
    imageUrl: upA.publicUrl,
    imageUrlB: upB.publicUrl,
    variantFilter,
    adminId,
  });
  await recordAdminAction({
    actorId: adminId,
    action: "galleryImage.create",
    entityType: "DesignGalleryImage",
    entityId: row.id,
    metadata: {
      tag,
      name,
      mode: "strip",
      matchedSizeCm: split.matchedSizeCm,
      swapFaces,
      ...(variantFilter ? { variantFilter } : {}),
    },
  });
  revalidatePath("/admin/disenos");
  return {};
}

export async function deleteGalleryImageAction(formData: FormData): Promise<ActionResult> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Datos inválidos." };

  await deleteGalleryImage(id);
  await recordAdminAction({
    actorId: session.admin.id,
    action: "galleryImage.delete",
    entityType: "DesignGalleryImage",
    entityId: id,
  });
  revalidatePath("/admin/disenos");
  return {};
}

/**
 * Edición del "Aplica a" de un diseño existente (modal de detalle). Re-valida
 * el filtro contra las variantes REALES del producto dueño del tag de la fila
 * (no confiamos en el tag del cliente: se lee de DB). "" = todas las variantes.
 */
export async function updateGalleryVariantFilterAction(formData: FormData): Promise<ActionResult> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Datos inválidos." };
  const tag = await getGalleryImageTag(id);
  if (!tag) return { error: "El diseño no existe." };

  const { filter: variantFilter, error: filterError } = await parseVariantFilterInput(
    formData,
    tag,
  );
  if (filterError) return { error: filterError };

  await updateGalleryVariantFilter({ id, variantFilter, adminId: session.admin.id });
  await recordAdminAction({
    actorId: session.admin.id,
    action: "galleryImage.updateVariantFilter",
    entityType: "DesignGalleryImage",
    entityId: id,
    metadata: { tag, variantFilter },
  });
  revalidatePath("/admin/disenos");
  return {};
}

/**
 * Asignación masiva del "Aplica a": todos los diseños del tag SIN filtro
 * (variantFilter null = "Todas") pasan al filtro elegido. Pensada para
 * organizar los diseños subidos antes del selector "Aplica a" (ej. los 51 de
 * separadores) sin SQL. El filtro vacío se rechaza: asignar "Todas" a los que
 * ya están en "Todas" sería un no-op confuso.
 */
export async function bulkAssignVariantFilterAction(
  formData: FormData,
): Promise<ActionResult & { count?: number }> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });

  const tag = String(formData.get("tag") ?? "");
  // Misma fuente de verdad que el upload: el tag es válido solo si un producto
  // activo lo resuelve como su tag de galería.
  const tagOptions = await listGalleryTagOptions();
  if (!tagOptions.some((o) => o.tag === tag)) return { error: "Producto inválido." };

  const { filter: variantFilter, error: filterError } = await parseVariantFilterInput(
    formData,
    tag,
  );
  if (filterError) return { error: filterError };
  if (!variantFilter) return { error: "Elige la variante a asignar." };

  const count = await assignVariantFilterToUnassigned({
    tag,
    variantFilter,
    adminId: session.admin.id,
  });
  await recordAdminAction({
    actorId: session.admin.id,
    action: "galleryImage.bulkVariantFilter",
    entityType: "DesignGalleryImage",
    entityId: tag,
    metadata: { tag, variantFilter, count },
  });
  revalidatePath("/admin/disenos");
  return { count };
}

/**
 * B-5 (2026-10-02) — pausar/reactivar sin borrar: isActive=false lo oculta del
 * Estudio pero sigue en el admin (atenuado + badge "Pausada"). `active` llega
 * explícito del cliente ("1"/"0") para que toggles concurrentes no se pisen.
 */
export async function toggleGalleryImageActiveAction(formData: FormData): Promise<ActionResult> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });

  const id = String(formData.get("id") ?? "");
  const activeRaw = formData.get("active");
  if (!id || (activeRaw !== "1" && activeRaw !== "0")) return { error: "Datos inválidos." };
  const isActive = activeRaw === "1";

  await setGalleryImageActive({ id, isActive, adminId: session.admin.id });
  await recordAdminAction({
    actorId: session.admin.id,
    action: "galleryImage.setActive",
    entityType: "DesignGalleryImage",
    entityId: id,
    metadata: { isActive },
  });
  revalidatePath("/admin/disenos");
  return {};
}

/**
 * B-5 — restaura un diseño archivado (soft-deleted): vuelve PAUSADO para
 * revisión, al final del orden de su tag. Mismo guard/audit que el resto.
 */
export async function restoreGalleryImageAction(formData: FormData): Promise<ActionResult> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Datos inválidos." };

  const restored = await restoreGalleryImage({ id, adminId: session.admin.id });
  if (!restored) return { error: "El diseño no está archivado." };
  await recordAdminAction({
    actorId: session.admin.id,
    action: "galleryImage.restore",
    entityType: "DesignGalleryImage",
    entityId: id,
  });
  revalidatePath("/admin/disenos");
  return {};
}

/**
 * B-5 — reorden por swap con el adyacente dentro del grupo visible (mismo tag +
 * mismo variantFilter). Sin vecino en esa dirección es un no-op silencioso:
 * las flechas se deshabilitan en los extremos, pero si la lista cambió entre el
 * render y el click no hay nada que corregir.
 */
export async function reorderGalleryImageAction(formData: FormData): Promise<ActionResult> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });

  const id = String(formData.get("id") ?? "");
  const dir = formData.get("direction");
  if (!id || (dir !== "up" && dir !== "down")) return { error: "Datos inválidos." };

  const moved = await reorderGalleryImage({ id, direction: dir, adminId: session.admin.id });
  if (!moved) return {};
  await recordAdminAction({
    actorId: session.admin.id,
    action: "galleryImage.reorder",
    entityType: "DesignGalleryImage",
    entityId: id,
    metadata: { direction: dir },
  });
  revalidatePath("/admin/disenos");
  return {};
}
