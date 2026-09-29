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
import { StorageError, sniffImageMime, uploadProductImage } from "@/lib/storage";
import {
  createGalleryImage,
  deleteGalleryImage,
  listGalleryTagOptions,
} from "@/features/personalization/design-gallery";
import {
  GalleryStripError,
  getGalleryStripExpectations,
  splitGalleryStripImage,
} from "@/features/personalization/gallery-strip";

type ActionResult = { error?: string };

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

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

  try {
    if (stripMode) {
      return await uploadStripMode({ tag, name, file, swapFaces, adminId: session.admin.id });
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
 * proporción contra los tamaños de variante del producto antes de subir.
 */
async function uploadStripMode(input: {
  tag: string;
  name: string;
  file: File;
  swapFaces: boolean;
  adminId: string;
}): Promise<ActionResult> {
  const { tag, name, file, swapFaces, adminId } = input;
  if (file.size === 0) return { error: "El archivo está vacío." };
  if (file.size > MAX_UPLOAD_BYTES) {
    return { error: `El archivo excede ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.` };
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const realMime = sniffImageMime(buffer);
  if (!realMime || !ALLOWED_MIME.has(realMime)) {
    return { error: "El archivo no es una imagen válida (jpg/png/webp/avif)." };
  }

  const expected = await getGalleryStripExpectations(tag);
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
    adminId,
  });
  await recordAdminAction({
    actorId: adminId,
    action: "galleryImage.create",
    entityType: "DesignGalleryImage",
    entityId: row.id,
    metadata: { tag, name, mode: "strip", matchedSizeCm: split.matchedSizeCm, swapFaces },
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
