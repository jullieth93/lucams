/*
 * ADR-057 Fase B2 — Server actions del admin de "Diseños prediseñados". Lucy sube imágenes de
 * diseño listas (por producto/tag); el cliente las aplica a un slot en el editor. Reutiliza
 * uploadProductImage (magic bytes) con el tag como prefijo de carpeta.
 */

"use server";

import { revalidatePath } from "next/cache";
import { recordAdminAction } from "@/lib/admin-audit";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { logger } from "@/lib/logger";
import { StorageError, uploadProductImage } from "@/lib/storage";
import { createGalleryImage, deleteGalleryImage } from "@/features/personalization/design-gallery";

type ActionResult = { error?: string };

const ALLOWED_TAGS = new Set(["separadores", "fotoimanes"]);

export async function uploadGalleryImageAction(formData: FormData): Promise<ActionResult> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });

  const tag = String(formData.get("tag") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const file = formData.get("file");
  if (!ALLOWED_TAGS.has(tag)) return { error: "Producto inválido." };
  if (name.length < 2 || name.length > 60)
    return { error: "El nombre debe tener 2–60 caracteres." };
  if (!(file instanceof File)) return { error: "Falta la imagen." };

  try {
    const { publicUrl } = await uploadProductImage({ productId: `gallery-${tag}`, file });
    const row = await createGalleryImage({
      tag,
      name,
      imageUrl: publicUrl,
      adminId: session.admin.id,
    });
    await recordAdminAction({
      actorId: session.admin.id,
      action: "galleryImage.create",
      entityType: "DesignGalleryImage",
      entityId: row.id,
      metadata: { tag, name },
    });
    revalidatePath("/admin/disenos");
    return {};
  } catch (err) {
    const message = err instanceof StorageError ? err.message : "No se pudo subir el diseño.";
    logger.warn(
      { event: "admin.gallery.upload_fail", adminId: session.admin.id, tag, err: message },
      "Failed to upload gallery image",
    );
    return { error: message };
  }
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
