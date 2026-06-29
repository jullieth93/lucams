/*
 * Server actions para gestión de imágenes de producto.
 *
 * Separadas de actions.ts (CRUD principal) para que el manejo de
 * archivos no infle la lógica de edit/create del producto.
 *
 * Cada acción:
 *   - Verifica getCurrentAdmin (defense in depth — proxy.ts ya bloquea).
 *   - Llama a lib/storage para upload/delete.
 *   - Actualiza Product.images array.
 *   - Registra AdminActionLog.
 *   - Logger estructurado.
 */

"use server";

import { revalidatePath } from "next/cache";
import { recordAdminAction } from "@/lib/admin-audit";
import { getCurrentAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { deleteProductImage, StorageError, uploadProductImage } from "@/lib/storage";

const MAX_IMAGES_PER_PRODUCT = 10;

type ActionResult = { error?: string };

export async function uploadProductImagesAction(formData: FormData): Promise<ActionResult> {
  const session = await getCurrentAdmin();
  if (!session) return { error: "Sesión expirada." };

  const productId = String(formData.get("productId") ?? "");
  if (!productId) return { error: "Producto inválido." };

  const product = await prisma.product.findFirst({
    where: { id: productId, deletedAt: null },
    select: { id: true, images: true, name: true },
  });
  if (!product) return { error: "Producto no encontrado." };

  const files = formData.getAll("files") as File[];
  if (files.length === 0) return { error: "Sin archivos para subir." };

  if (product.images.length + files.length > MAX_IMAGES_PER_PRODUCT) {
    return {
      error: `Máximo ${MAX_IMAGES_PER_PRODUCT} imágenes por producto. Borra algunas primero.`,
    };
  }

  const uploadedUrls: string[] = [];
  for (const file of files) {
    if (!(file instanceof File)) continue;
    try {
      const { publicUrl } = await uploadProductImage({ productId: product.id, file });
      uploadedUrls.push(publicUrl);
    } catch (err) {
      if (err instanceof StorageError) {
        logger.warn(
          {
            event: "admin.product.image.upload_fail",
            adminId: session.admin.id,
            productId,
            code: err.code,
          },
          err.message,
        );
        return { error: err.message };
      }
      logger.error(
        {
          event: "admin.product.image.upload_fail",
          adminId: session.admin.id,
          productId,
          err: err instanceof Error ? err.message : String(err),
        },
        "Failed to upload product image",
      );
      return { error: "Error subiendo imágenes. Intenta de nuevo." };
    }
  }

  const newImages = [...product.images, ...uploadedUrls];
  await prisma.product.update({
    where: { id: product.id },
    data: { images: newImages, updatedBy: session.admin.id },
  });

  await recordAdminAction({
    actorId: session.admin.id,
    action: "product.images.upload",
    entityType: "Product",
    entityId: product.id,
    metadata: { count: uploadedUrls.length, totalAfter: newImages.length },
  });

  logger.info({
    event: "admin.product.images.uploaded",
    adminId: session.admin.id,
    productId,
    count: uploadedUrls.length,
  });

  revalidatePath(`/admin/productos/${product.id}`);
  revalidatePath("/admin/productos");
  return {};
}

export async function reorderProductImagesAction(formData: FormData): Promise<ActionResult> {
  const session = await getCurrentAdmin();
  if (!session) return { error: "Sesión expirada." };

  const productId = String(formData.get("productId") ?? "");
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

  const product = await prisma.product.findFirst({
    where: { id: productId, deletedAt: null },
    select: { id: true, images: true },
  });
  if (!product) return { error: "Producto no encontrado." };

  // Validamos que el nuevo orden contenga exactamente las mismas URLs.
  const oldSet = new Set(product.images);
  const newSet = new Set(newOrder);
  if (oldSet.size !== newSet.size || ![...oldSet].every((x) => newSet.has(x))) {
    return { error: "El reordenamiento no coincide con las imágenes actuales." };
  }

  await prisma.product.update({
    where: { id: product.id },
    data: { images: newOrder, updatedBy: session.admin.id },
  });

  await recordAdminAction({
    actorId: session.admin.id,
    action: "product.images.reorder",
    entityType: "Product",
    entityId: product.id,
  });

  revalidatePath(`/admin/productos/${product.id}`);
  revalidatePath("/admin/productos");
  return {};
}

export async function deleteProductImageAction(formData: FormData): Promise<ActionResult> {
  const session = await getCurrentAdmin();
  if (!session) return { error: "Sesión expirada." };

  const productId = String(formData.get("productId") ?? "");
  const url = String(formData.get("url") ?? "");
  if (!productId || !url) return { error: "Datos inválidos." };

  const product = await prisma.product.findFirst({
    where: { id: productId, deletedAt: null },
    select: { id: true, images: true },
  });
  if (!product) return { error: "Producto no encontrado." };

  if (!product.images.includes(url)) {
    return { error: "Esa imagen no pertenece a este producto." };
  }

  // Quitar primero del array de la DB, después borrar del Storage. Si
  // el Storage falla, el array ya quedó sin referencia — el archivo
  // queda huérfano pero no roto.
  const newImages = product.images.filter((u) => u !== url);
  await prisma.product.update({
    where: { id: product.id },
    data: { images: newImages, updatedBy: session.admin.id },
  });

  try {
    await deleteProductImage(url);
  } catch (err) {
    logger.warn(
      {
        event: "admin.product.image.delete_orphan",
        adminId: session.admin.id,
        productId,
        url,
        err: err instanceof Error ? err.message : String(err),
      },
      "Image removed from DB but Storage delete failed — file orphan",
    );
  }

  await recordAdminAction({
    actorId: session.admin.id,
    action: "product.images.delete",
    entityType: "Product",
    entityId: product.id,
    metadata: { url },
  });

  logger.info({
    event: "admin.product.images.deleted",
    adminId: session.admin.id,
    productId,
    totalAfter: newImages.length,
  });

  revalidatePath(`/admin/productos/${product.id}`);
  revalidatePath("/admin/productos");
  return {};
}
