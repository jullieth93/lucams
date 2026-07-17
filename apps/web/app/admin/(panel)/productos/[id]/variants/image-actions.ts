/*
 * Server actions para las fotos POR OPCIÓN (ProductVariant.images).
 *
 * D1 (Lucy 2026-06-27): cada opción puede tener sus propias fotos; si está
 * vacío hereda las del producto. Espejo de las acciones de imagen del producto
 * (../../image-actions.ts), pero sobre ProductVariant. Reutiliza el mismo bucket
 * de storage (las fotos viven en la carpeta <productId>/...).
 *
 * Cada acción: verifica admin → storage → actualiza ProductVariant.images →
 * audita → revalida la página del producto y el storefront.
 */

"use server";

import { revalidatePath } from "next/cache";
import { recordAdminAction } from "@/lib/admin-audit";
import { getCurrentAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { deleteProductImage, StorageError, uploadProductImage } from "@/lib/storage";

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
      product: { select: { slug: true } },
    },
  });
}

function revalidateVariant(productId: string, productSlug: string) {
  revalidatePath(`/admin/productos/${productId}`);
  revalidatePath("/admin/productos");
  revalidatePath(`/producto/${productSlug}`);
}

export async function uploadVariantImagesAction(formData: FormData): Promise<ActionResult> {
  const session = await getCurrentAdmin();
  if (!session) return { error: "Sesión expirada." };

  const variantId = String(formData.get("variantId") ?? "");
  if (!variantId) return { error: "Opción inválida." };

  const variant = await loadVariant(variantId);
  if (!variant) return { error: "Opción no encontrada." };

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
    const newImages = [...variant.images, ...uploadedUrls];
    await prisma.productVariant.update({
      where: { id: variant.id },
      data: { images: newImages, updatedBy: session.admin.id },
    });
    await recordAdminAction({
      actorId: session.admin.id,
      action: "variant.images.upload",
      entityType: "ProductVariant",
      entityId: variant.id,
      metadata: { count: uploadedUrls.length, totalAfter: newImages.length },
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
  const session = await getCurrentAdmin();
  if (!session) return { error: "Sesión expirada." };

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

  const variant = await loadVariant(variantId);
  if (!variant) return { error: "Opción no encontrada." };

  // Multiconjunto (ADR-057 cert): misma longitud, sin duplicados, todas existentes.
  const oldSet = new Set(variant.images);
  if (
    newOrder.length !== variant.images.length ||
    new Set(newOrder).size !== newOrder.length ||
    !newOrder.every((x) => oldSet.has(x))
  ) {
    return { error: "El reordenamiento no coincide con las fotos actuales." };
  }

  await prisma.productVariant.update({
    where: { id: variant.id },
    data: { images: newOrder, updatedBy: session.admin.id },
  });

  await recordAdminAction({
    actorId: session.admin.id,
    action: "variant.images.reorder",
    entityType: "ProductVariant",
    entityId: variant.id,
  });

  revalidateVariant(variant.productId, variant.product.slug);
  return {};
}

export async function deleteVariantImageAction(formData: FormData): Promise<ActionResult> {
  const session = await getCurrentAdmin();
  if (!session) return { error: "Sesión expirada." };

  const variantId = String(formData.get("variantId") ?? "");
  const url = String(formData.get("url") ?? "");
  if (!variantId || !url) return { error: "Datos inválidos." };

  const variant = await loadVariant(variantId);
  if (!variant) return { error: "Opción no encontrada." };

  if (!variant.images.includes(url)) {
    return { error: "Esa foto no pertenece a esta opción." };
  }

  // Quitar primero del array; después borrar del Storage. OJO: la misma URL
  // podría estar referenciada por el producto u otra opción (no debería, pero
  // por seguridad solo borramos del Storage si nadie más la referencia).
  const newImages = variant.images.filter((u) => u !== url);
  await prisma.productVariant.update({
    where: { id: variant.id },
    data: { images: newImages, updatedBy: session.admin.id },
  });

  const stillReferenced =
    (await prisma.product.count({ where: { id: variant.productId, images: { has: url } } })) > 0 ||
    (await prisma.productVariant.count({
      where: { productId: variant.productId, images: { has: url }, deletedAt: null },
    })) > 0;

  if (!stillReferenced) {
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
  });

  revalidateVariant(variant.productId, variant.product.slug);
  return {};
}
