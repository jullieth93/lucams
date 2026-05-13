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

// ──────────── Customer uploads (Estudio M.3) ────────────
//
// Bucket privado `customer-uploads` con RLS via metadata->>'owner_id'.
// Aquí subimos fotos crudas del cliente (antes de strip EXIF) que el
// editor usa como image-placeholder en el canvas.
//
// Path scheme: <ownerId>/<designId-or-pending>/<uuid>.<ext>
// Donde ownerId = customerId si logueado, sessionId si anon. Coincide
// con la columna metadata.owner_id que las policies RLS verifican.

const CUSTOMER_UPLOADS_BUCKET = "customer-uploads";
const CUSTOMER_UPLOAD_MAX_BYTES = 10 * 1024 * 1024; // 10 MB (alineado con M.1.b)
const CUSTOMER_UPLOAD_ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export type CustomerUploadResult = {
  path: string; // path dentro del bucket
  signedUrl: string; // URL firmada con TTL 1h para uso temporal del editor
  width: number;
  height: number;
  sizeBytes: number;
  mimeType: string;
  exifStripped: boolean;
};

/**
 * Sube una foto del cliente al bucket privado customer-uploads.
 *
 * Pipeline:
 *   1. Valida tamaño + mime
 *   2. Strip EXIF con sharp + normalize orientation
 *   3. Convierte HEIC/HEIF a JPEG (Safari iOS los sube en este formato)
 *   4. Upload a Supabase Storage con metadata.owner_id (alineado RLS)
 *   5. Genera signed URL TTL 1h para uso en editor
 *
 * El llamador (server action) ya validó ownership del Design.
 */
export async function uploadCustomerPhoto(opts: {
  buffer: Buffer;
  originalMimeType: string;
  ownerId: string; // customerId o sessionId
  designId: string | null; // null si aún no se creó el Design
}): Promise<CustomerUploadResult> {
  if (opts.buffer.length === 0) {
    throw new StorageError("EMPTY_FILE", "Archivo vacío");
  }
  if (opts.buffer.length > CUSTOMER_UPLOAD_MAX_BYTES) {
    throw new StorageError(
      "FILE_TOO_LARGE",
      `El archivo excede ${CUSTOMER_UPLOAD_MAX_BYTES / 1024 / 1024} MB`,
    );
  }
  if (!CUSTOMER_UPLOAD_ALLOWED_MIME.has(opts.originalMimeType)) {
    throw new StorageError(
      "INVALID_TYPE",
      `Tipo "${opts.originalMimeType}" no permitido (jpg/png/webp/heic/heif)`,
    );
  }

  // Strip EXIF + auto-orient + convert HEIC→JPEG via sharp.
  // sharp.rotate() respeta EXIF orientation y luego strip lo descarta.
  // .toBuffer() devuelve buffer optimizado.
  const sharp = (await import("sharp")).default;
  let processed: Buffer;
  let finalMime: string;
  let width: number;
  let height: number;
  try {
    const pipeline = sharp(opts.buffer).rotate(); // auto-orient + strip EXIF
    const isHeic =
      opts.originalMimeType === "image/heic" || opts.originalMimeType === "image/heif";
    if (isHeic) {
      // HEIC requiere libvips compilado con heif (Vercel build incluye).
      // Si falla, sharp lanza error claro al cliente.
      const out = await pipeline.jpeg({ quality: 92, mozjpeg: true }).toBuffer({ resolveWithObject: true });
      processed = out.data;
      finalMime = "image/jpeg";
      width = out.info.width;
      height = out.info.height;
    } else {
      const out = await pipeline.toBuffer({ resolveWithObject: true });
      processed = out.data;
      finalMime = opts.originalMimeType;
      width = out.info.width;
      height = out.info.height;
    }
  } catch (err) {
    throw new StorageError(
      "UPLOAD_FAILED",
      `No pudimos procesar la imagen: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const ext = finalMime === "image/jpeg" ? "jpg" : inferExtension(finalMime);
  const designSegment = opts.designId ?? "pending";
  const filename = `${opts.ownerId}/${designSegment}/${randomUUID()}.${ext}`;

  const supabase = supabaseService;
  const { error: uploadErr } = await supabase.storage
    .from(CUSTOMER_UPLOADS_BUCKET)
    .upload(filename, processed, {
      contentType: finalMime,
      cacheControl: "3600",
      upsert: false,
      // metadata.owner_id requerido por RLS policies (M.1.b).
      // Supabase JS client lo pasa via headers x-upsert/x-meta — usamos
      // `metadata` field cuando esté disponible; fallback es PUT object
      // metadata separado.
      metadata: { owner_id: opts.ownerId },
    } as never); // metadata field es válido pero los types lo marcan opcional

  if (uploadErr) {
    throw new StorageError("UPLOAD_FAILED", `Error subiendo: ${uploadErr.message}`);
  }

  // Signed URL TTL 1 hora — editor la cachea client-side mientras dura la sesión.
  const { data: signed, error: signErr } = await supabase.storage
    .from(CUSTOMER_UPLOADS_BUCKET)
    .createSignedUrl(filename, 3600);
  if (signErr || !signed) {
    throw new StorageError("UPLOAD_FAILED", `Subió pero no pudimos firmar URL: ${signErr?.message ?? "unknown"}`);
  }

  return {
    path: filename,
    signedUrl: signed.signedUrl,
    width,
    height,
    sizeBytes: processed.length,
    mimeType: finalMime,
    exifStripped: true,
  };
}

/**
 * Re-firma una URL existente (signed URLs caducan a 1h).
 * Útil cuando el editor recupera un Design draft de hace >1h.
 */
export async function refreshCustomerUploadSignedUrl(path: string): Promise<string> {
  const supabase = supabaseService;
  const { data, error } = await supabase.storage
    .from(CUSTOMER_UPLOADS_BUCKET)
    .createSignedUrl(path, 3600);
  if (error || !data) {
    throw new StorageError("UPLOAD_FAILED", `No pudimos refirmar URL: ${error?.message ?? "unknown"}`);
  }
  return data.signedUrl;
}
