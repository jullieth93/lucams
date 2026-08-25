/*
 * Server actions para las fotos POR OPCIÓN (ProductVariant.images).
 *
 * D1 (Lucy 2026-06-27): cada opción puede tener sus propias fotos; si está
 * vacío hereda las del producto. Espejo de las acciones de imagen del producto
 * (../../image-actions.ts), pero sobre ProductVariant. Reutiliza el mismo bucket
 * de storage (las fotos viven en la carpeta <productId>/...).
 *
 * Portadas compartidas por DISEÑO (reporte Lucy 2026-08-25, separadores-magneticos:
 * 12 opciones = 2 diseños × 6 cantidades → 45 fotos subidas para 2 diseños): las
 * opciones del mismo diseño (misma firma visual, ver variantCoverSignature)
 * comparten el array de fotos. Si el grupo está UNIFICADO (todas con el mismo
 * array), subir/reordenar/borrar PROPAGA el resultado a todo el grupo — la URL
 * se sube una sola vez a Storage y se comparte por referencia. Si está
 * DIVERGENTE (datos viejos con fotos distintas entre opciones), las acciones
 * tocan SOLO la opción editada y unifyVariantCoverGroupAction es el camino
 * explícito para unificar.
 *
 * Cada acción: verifica admin → storage → actualiza ProductVariant.images →
 * audita → revalida la página del producto y el storefront.
 */

"use server";

import { revalidatePath } from "next/cache";
import { recordAdminAction } from "@/lib/admin-audit";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { deleteProductImage, StorageError, uploadProductImage } from "@/lib/storage";
import {
  parseVariantAttributes,
  sameImageArrays,
  variantCoverSignature,
} from "@/features/products/variant-schemas";

const MAX_IMAGES_PER_VARIANT = 8;

type ActionResult = { error?: string };

async function loadVariant(variantId: string) {
  return prisma.productVariant.findFirst({
    where: { id: variantId, deletedAt: null },
    select: {
      id: true,
      productId: true,
      images: true,
      name: true,
      // Firma de diseño (portadas compartidas por diseño, Lucy 2026-08-25).
      attributes: true,
      product: { select: { slug: true } },
    },
  });
}

/**
 * Grupo de portada de una variante: TODAS las opciones activas (deletedAt: null)
 * del mismo producto con su misma firma visual (incluye la editada). Se calcula
 * SIEMPRE en servidor desde la DB — nunca se confía en ids de grupo mandados
 * por el cliente.
 */
async function loadCoverGroup(variantId: string) {
  const variant = await loadVariant(variantId);
  if (!variant) return null;
  const siblings = await prisma.productVariant.findMany({
    where: { productId: variant.productId, deletedAt: null },
    select: { id: true, images: true, attributes: true },
  });
  const signature = variantCoverSignature(parseVariantAttributes(variant.attributes));
  const group = siblings.filter(
    (v) => variantCoverSignature(parseVariantAttributes(v.attributes)) === signature,
  );
  return { variant, group };
}

/**
 * ¿El grupo comparte UN solo set de fotos (mismo contenido y orden en todas las
 * opciones)? Grupo de 1 → false: conserva el comportamiento clásico (update de
 * una sola variante).
 */
function isUnifiedCoverGroup(group: Array<{ images: string[] }>): boolean {
  return group.length > 1 && group.every((v) => sameImageArrays(v.images, group[0].images));
}

/**
 * Escribe el array resultante de una mutación de fotos. Si el grupo estaba
 * unificado, propaga a TODAS las opciones del diseño (un solo updateMany); si
 * está divergente o es grupo de 1, solo toca la opción editada.
 */
async function applyImagesToCoverGroup(opts: {
  variantId: string;
  group: Array<{ id: string; images: string[] }>;
  newImages: string[];
  updatedBy: string;
}): Promise<void> {
  const { variantId, group, newImages, updatedBy } = opts;
  if (isUnifiedCoverGroup(group)) {
    await prisma.productVariant.updateMany({
      where: { id: { in: group.map((v) => v.id) } },
      data: { images: newImages, updatedBy },
    });
  } else {
    await prisma.productVariant.update({
      where: { id: variantId },
      data: { images: newImages, updatedBy },
    });
  }
}

/**
 * ¿Alguien más referencia esta URL? (product.images o cualquier opción activa
 * del producto). Regla de seguridad del delete: solo si NADIE la referencia se
 * borra el archivo del Storage — con fotos compartidas por diseño la misma URL
 * suele aparecer en varias opciones.
 */
async function isUrlStillReferenced(productId: string, url: string): Promise<boolean> {
  return (
    (await prisma.product.count({ where: { id: productId, images: { has: url } } })) > 0 ||
    (await prisma.productVariant.count({
      where: { productId, images: { has: url }, deletedAt: null },
    })) > 0
  );
}

function revalidateVariant(productId: string, productSlug: string) {
  revalidatePath(`/admin/productos/${productId}`);
  revalidatePath("/admin/productos");
  revalidatePath(`/producto/${productSlug}`);
}

export async function uploadVariantImagesAction(formData: FormData): Promise<ActionResult> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });

  const variantId = String(formData.get("variantId") ?? "");
  if (!variantId) return { error: "Opción inválida." };

  const loaded = await loadCoverGroup(variantId);
  if (!loaded) return { error: "Opción no encontrada." };
  const { variant, group } = loaded;

  const files = formData.getAll("files") as File[];
  if (files.length === 0) return { error: "Sin archivos para subir." };

  if (variant.images.length + files.length > MAX_IMAGES_PER_VARIANT) {
    return {
      error: `Máximo ${MAX_IMAGES_PER_VARIANT} fotos por opción. Borra algunas primero.`,
    };
  }

  // ADR-057 cert: persistimos las fotos que SÍ subieron aunque una falle (sin huérfanas)
  // y avisamos cuál falló por nombre.
  const uploadedUrls: string[] = [];
  let failure: { name: string; message: string } | null = null;
  for (const file of files) {
    if (!(file instanceof File)) continue;
    try {
      // Reutiliza el bucket del producto; las fotos quedan en <productId>/...
      const { publicUrl } = await uploadProductImage({ productId: variant.productId, file });
      uploadedUrls.push(publicUrl);
    } catch (err) {
      const message = err instanceof StorageError ? err.message : "no se pudo procesar la foto.";
      failure = { name: file.name || "una foto", message };
      logger.warn(
        {
          event: "admin.variant.image.upload_fail",
          adminId: session.admin.id,
          variantId,
          file: file.name,
          err: message,
        },
        "Failed to upload variant image",
      );
      break;
    }
  }

  if (uploadedUrls.length > 0) {
    // Grupo unificado (mismo diseño): las URLs se subieron UNA vez a Storage y
    // el array resultante se comparte con todas las opciones del diseño.
    const newImages = [...variant.images, ...uploadedUrls];
    await applyImagesToCoverGroup({
      variantId: variant.id,
      group,
      newImages,
      updatedBy: session.admin.id,
    });
    await recordAdminAction({
      actorId: session.admin.id,
      action: "variant.images.upload",
      entityType: "ProductVariant",
      entityId: variant.id,
      metadata: {
        count: uploadedUrls.length,
        totalAfter: newImages.length,
        coverGroupSize: group.length,
      },
    });
    revalidateVariant(variant.productId, variant.product.slug);
  }

  if (failure) {
    return {
      error:
        uploadedUrls.length > 0
          ? `Subimos ${uploadedUrls.length} de ${files.length}. "${failure.name}": ${failure.message}`
          : `"${failure.name}": ${failure.message}`,
    };
  }
  return {};
}

export async function reorderVariantImagesAction(formData: FormData): Promise<ActionResult> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });

  const variantId = String(formData.get("variantId") ?? "");
  const orderStr = String(formData.get("order") ?? "[]");
  let newOrder: string[];
  try {
    newOrder = JSON.parse(orderStr);
    if (!Array.isArray(newOrder) || newOrder.some((x) => typeof x !== "string")) {
      return { error: "Orden inválido." };
    }
  } catch {
    return { error: "Orden inválido." };
  }

  const loaded = await loadCoverGroup(variantId);
  if (!loaded) return { error: "Opción no encontrada." };
  const { variant, group } = loaded;

  // Multiconjunto (ADR-057 cert): misma longitud, sin duplicados, todas existentes.
  const oldSet = new Set(variant.images);
  if (
    newOrder.length !== variant.images.length ||
    new Set(newOrder).size !== newOrder.length ||
    !newOrder.every((x) => oldSet.has(x))
  ) {
    return { error: "El reordenamiento no coincide con las fotos actuales." };
  }

  // Grupo unificado → el nuevo orden aplica a todas las opciones del diseño.
  await applyImagesToCoverGroup({
    variantId: variant.id,
    group,
    newImages: newOrder,
    updatedBy: session.admin.id,
  });

  await recordAdminAction({
    actorId: session.admin.id,
    action: "variant.images.reorder",
    entityType: "ProductVariant",
    entityId: variant.id,
    metadata: { coverGroupSize: group.length },
  });

  revalidateVariant(variant.productId, variant.product.slug);
  return {};
}

export async function deleteVariantImageAction(formData: FormData): Promise<ActionResult> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });

  const variantId = String(formData.get("variantId") ?? "");
  const url = String(formData.get("url") ?? "");
  if (!variantId || !url) return { error: "Datos inválidos." };

  const loaded = await loadCoverGroup(variantId);
  if (!loaded) return { error: "Opción no encontrada." };
  const { variant, group } = loaded;

  if (!variant.images.includes(url)) {
    return { error: "Esa foto no pertenece a esta opción." };
  }

  // Quitar primero del array; después borrar del Storage. OJO: la misma URL
  // podría estar referenciada por el producto u otra opción (con las portadas
  // compartidas por diseño es lo NORMAL), así que solo se borra del Storage si
  // nadie más la referencia. Grupo unificado → se quita de todo el diseño.
  const newImages = variant.images.filter((u) => u !== url);
  await applyImagesToCoverGroup({
    variantId: variant.id,
    group,
    newImages,
    updatedBy: session.admin.id,
  });

  if (!(await isUrlStillReferenced(variant.productId, url))) {
    try {
      await deleteProductImage(url);
    } catch (err) {
      logger.warn(
        {
          event: "admin.variant.image.delete_orphan",
          adminId: session.admin.id,
          variantId,
          url,
          err: err instanceof Error ? err.message : String(err),
        },
        "Variant image removed from array but storage delete failed (orphan file)",
      );
    }
  }

  await recordAdminAction({
    actorId: session.admin.id,
    action: "variant.images.delete",
    entityType: "ProductVariant",
    entityId: variant.id,
    metadata: { coverGroupSize: group.length },
  });

  revalidateVariant(variant.productId, variant.product.slug);
  return {};
}

/**
 * Unificar portadas de un diseño (camino explícito para grupos DIVERGENTES —
 * datos viejos con fotos distintas entre opciones del mismo diseño): copia el
 * array `images` de la opción editada a TODAS las opciones del grupo y borra
 * del Storage las URLs que quedaron huérfanas (nadie más las referencia).
 */
export async function unifyVariantCoverGroupAction(formData: FormData): Promise<ActionResult> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });

  const variantId = String(formData.get("variantId") ?? "");
  if (!variantId) return { error: "Opción inválida." };

  const loaded = await loadCoverGroup(variantId);
  if (!loaded) return { error: "Opción no encontrada." };
  const { variant, group } = loaded;

  if (group.length < 2) {
    return { error: "Esta opción no comparte diseño con ninguna otra; no hay nada que unificar." };
  }

  // Las fotos de ESTA opción pasan a ser las de TODO el diseño. Las URLs que
  // tenían las otras opciones y no están en este array quedan candidatas a
  // huérfanas.
  const sourceImages = variant.images;
  const droppedUrls = new Set<string>();
  for (const member of group) {
    if (member.id === variant.id) continue;
    for (const url of member.images) {
      if (!sourceImages.includes(url)) droppedUrls.add(url);
    }
  }

  await prisma.productVariant.updateMany({
    where: { id: { in: group.map((v) => v.id) } },
    data: { images: sourceImages, updatedBy: session.admin.id },
  });

  // Mismo criterio que deleteVariantImageAction: se quita del array primero y
  // solo se borra del Storage si NADIE la referencia. Un fallo de Storage deja
  // archivo huérfano pero no rompe la acción (warn y sigue con la siguiente).
  let droppedCount = 0;
  for (const url of droppedUrls) {
    if (await isUrlStillReferenced(variant.productId, url)) continue;
    try {
      await deleteProductImage(url);
      droppedCount += 1;
    } catch (err) {
      logger.warn(
        {
          event: "admin.variant.image.unify_orphan",
          adminId: session.admin.id,
          variantId,
          url,
          err: err instanceof Error ? err.message : String(err),
        },
        "Cover group unified but storage delete failed (orphan file)",
      );
    }
  }

  await recordAdminAction({
    actorId: session.admin.id,
    action: "variant.images.unify_cover_group",
    entityType: "ProductVariant",
    entityId: variant.id,
    metadata: { unified: group.length, droppedUrls: droppedCount },
  });

  revalidateVariant(variant.productId, variant.product.slug);
  return {};
}
