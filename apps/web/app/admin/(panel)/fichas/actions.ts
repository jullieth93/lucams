/*
 * ADR-057 — Server actions del admin de "Sets de fichas". Lucy sube una ilustración por
 * letra; el editor de nombre las usa. Reutiliza uploadProductImage (magic bytes) con el
 * setId como prefijo de carpeta en el bucket.
 */

"use server";

import { revalidatePath } from "next/cache";
import { recordAdminAction } from "@/lib/admin-audit";
import { getCurrentAdmin } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { StorageError, uploadProductImage } from "@/lib/storage";
import { upsertLetterTile, deleteLetterTile, createLetterSet } from "@/features/personalization/letter-tiles";

type ActionResult = { error?: string };

/** ADR-057 — crea un ESTILO nuevo (Animales, Navidad…) para empezar a subirle fichas. */
export async function createLetterSetAction(formData: FormData): Promise<ActionResult> {
  const session = await getCurrentAdmin();
  if (!session) return { error: "Sesión expirada." };

  const name = String(formData.get("name") ?? "").trim();
  const language = String(formData.get("language") ?? "");
  if (name.length < 2 || name.length > 60) return { error: "El nombre del estilo debe tener 2–60 caracteres." };
  if (language !== "es" && language !== "en") return { error: "Idioma inválido." };

  try {
    const set = await createLetterSet({ name, language, adminId: session.admin.id });
    await recordAdminAction({
      actorId: session.admin.id,
      action: "letterSet.create",
      entityType: "LetterTileSet",
      entityId: set.id,
      metadata: { name, language },
    });
    revalidatePath("/admin/fichas");
    return {};
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo crear el estilo.";
    logger.warn(
      { event: "admin.letter_set.create_fail", adminId: session.admin.id, name, language, err: message },
      "Failed to create letter set",
    );
    return { error: "No se pudo crear el estilo." };
  }
}

export async function uploadLetterTileAction(formData: FormData): Promise<ActionResult> {
  const session = await getCurrentAdmin();
  if (!session) return { error: "Sesión expirada." };

  const setId = String(formData.get("setId") ?? "");
  const char = String(formData.get("char") ?? "").toUpperCase();
  const label = String(formData.get("label") ?? "").trim() || null;
  const file = formData.get("file");
  if (!setId || !char) return { error: "Datos inválidos." };
  if (!(file instanceof File)) return { error: "Falta la imagen." };

  try {
    // Reutiliza el bucket product-images; las fichas viven en <setId>/<uuid>.
    const { publicUrl } = await uploadProductImage({ productId: setId, file });
    await upsertLetterTile({ setId, char, imageUrl: publicUrl, label, adminId: session.admin.id });
    await recordAdminAction({
      actorId: session.admin.id,
      action: "letterTile.upsert",
      entityType: "LetterTileSet",
      entityId: setId,
      metadata: { char },
    });
    revalidatePath("/admin/fichas");
    return {};
  } catch (err) {
    const message = err instanceof StorageError ? err.message : "No se pudo subir la ficha.";
    logger.warn(
      { event: "admin.letter_tile.upload_fail", adminId: session.admin.id, setId, char, err: message },
      "Failed to upload letter tile",
    );
    return { error: message };
  }
}

export async function deleteLetterTileAction(formData: FormData): Promise<ActionResult> {
  const session = await getCurrentAdmin();
  if (!session) return { error: "Sesión expirada." };

  const setId = String(formData.get("setId") ?? "");
  const char = String(formData.get("char") ?? "");
  if (!setId || !char) return { error: "Datos inválidos." };

  await deleteLetterTile(setId, char);
  await recordAdminAction({
    actorId: session.admin.id,
    action: "letterTile.delete",
    entityType: "LetterTileSet",
    entityId: setId,
    metadata: { char: char.toUpperCase() },
  });
  revalidatePath("/admin/fichas");
  return {};
}
