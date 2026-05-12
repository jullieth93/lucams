/*
 * Helpers Supabase Storage.
 *
 * Bucket público `product-images` con RLS write=AdminUser activo
 * (supabase/migrations/00000000000005_search_and_storage.sql).
 *
 * Subimos imágenes via admin UI desde el server (Service client) para
 * no exponer credenciales al cliente. URLs públicas las arma Supabase
 * sin firmar — next/image (Vercel optimizer) las consume y sirve WebP.
 *
 * Patrón filename:
 *   <productId>/<uuid>.<ext>
 * Garantiza no colisión incluso si dos admins suben simultáneamente.
 */

import "server-only";
import { randomUUID } from "node:crypto";
import { supabaseService } from "@/lib/supabase/service";

const BUCKET = "product-images";
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

export class StorageError extends Error {
  constructor(
    public code:
      | "FILE_TOO_LARGE"
      | "INVALID_TYPE"
      | "UPLOAD_FAILED"
      | "DELETE_FAILED"
      | "EMPTY_FILE",
    message: string,
  ) {
    super(message);
    this.name = "StorageError";
  }
}

export type UploadedImage = {
  path: string; // path dentro del bucket: "<productId>/<uuid>.webp"
  publicUrl: string; // URL absoluta servible por next/image
};

function inferExtension(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/avif":
      return "avif";
    default:
      return "bin";
  }
}

/**
 * Sube una imagen al bucket. El llamador (server action admin) ya
 * verificó que el usuario es admin — esta función no re-checkea
 * auth, asume llamador autorizado.
 */
export async function uploadProductImage(opts: {
  productId: string;
  file: File;
}): Promise<UploadedImage> {
  const { productId, file } = opts;

  if (file.size === 0) {
    throw new StorageError("EMPTY_FILE", "Archivo vacío");
  }
  if (file.size > MAX_BYTES) {
    throw new StorageError("FILE_TOO_LARGE", `El archivo excede ${MAX_BYTES / 1024 / 1024} MB`);
  }
  if (!ALLOWED_MIME.has(file.type)) {
    throw new StorageError("INVALID_TYPE", `Tipo "${file.type}" no permitido (jpg/png/webp/avif)`);
  }

  const ext = inferExtension(file.type);
  const filename = `${productId}/${randomUUID()}.${ext}`;
  const supabase = supabaseService;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(filename, buffer, {
    contentType: file.type,
    cacheControl: "31536000", // 1 año — los nombres ya tienen UUID, son inmutables
    upsert: false,
  });

  if (uploadErr) {
    throw new StorageError("UPLOAD_FAILED", `Error subiendo: ${uploadErr.message}`);
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename);
  return { path: filename, publicUrl: data.publicUrl };
}

/**
 * Borra una imagen del bucket por su URL pública.
 * Si la URL no pertenece a nuestro bucket, no-op silencioso.
 */
export async function deleteProductImage(publicUrl: string): Promise<void> {
  const path = extractPathFromPublicUrl(publicUrl);
  if (!path) return; // No es URL nuestra, ignorar

  const supabase = supabaseService;
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) {
    throw new StorageError("DELETE_FAILED", `Error borrando: ${error.message}`);
  }
}

/**
 * De una URL pública tipo
 *   https://<ref>.supabase.co/storage/v1/object/public/product-images/<path>
 * devuelve solo `<path>`. null si no matchea.
 */
function extractPathFromPublicUrl(url: string): string | null {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length);
}
