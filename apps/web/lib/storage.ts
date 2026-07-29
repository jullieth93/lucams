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
      "FILE_TOO_LARGE" | "INVALID_TYPE" | "UPLOAD_FAILED" | "DELETE_FAILED" | "EMPTY_FILE",
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
 * Detecta el MIME REAL por los magic bytes del archivo (Bloque C / F1), en vez
 * de confiar en file.type (que el cliente puede falsificar). Devuelve null si no
 * reconoce un formato de imagen permitido. Previene subir un .html/.svg/polyglot
 * con extensión .jpg.
 *
 * Reconoce jpeg/png/webp/avif y los contenedores ISOBMFF HEIC/HEIF (fotos de
 * iPhone). El llamador filtra además contra SU allow-list (admin no acepta heic,
 * cliente no acepta avif), así que este sniffer puede ser permisivo.
 */
function sniffImageMime(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  )
    return "image/png";
  // WebP: "RIFF"...."WEBP"
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP")
    return "image/webp";
  // Contenedores ISOBMFF: ....ftyp + major_brand.
  if (buf.toString("ascii", 4, 8) === "ftyp") {
    const brand = buf.toString("ascii", 8, 12);
    if (brand === "avif" || brand === "avis") return "image/avif";
    // HEIC (fotos iPhone): heic/heix/heim/heis + secuencias hevc/hevx/hevm/hevs.
    if (brand === "heic" || brand === "heix" || brand === "heim" || brand === "heis") {
      return "image/heic";
    }
    if (brand === "hevc" || brand === "hevx" || brand === "hevm" || brand === "hevs") {
      return "image/heic";
    }
    // HEIF genérico: brands mif1/msf1.
    if (brand === "mif1" || brand === "msf1") return "image/heif";
  }
  return null;
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

  const buffer = Buffer.from(await file.arrayBuffer());
  // F1: validar el MIME REAL por magic bytes (no confiar en file.type) + usarlo
  // como contentType forzado (anti-polyglot/XSS).
  const realMime = sniffImageMime(buffer);
  if (!realMime || !ALLOWED_MIME.has(realMime)) {
    throw new StorageError(
      "INVALID_TYPE",
      "El archivo no es una imagen válida (jpg/png/webp/avif).",
    );
  }

  const ext = inferExtension(realMime);
  const filename = `${productId}/${randomUUID()}.${ext}`;
  const supabase = supabaseService;

  const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(filename, buffer, {
    contentType: realMime,
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
  /** M.3.b.B.2 — resultado de validación calidad. Si no se pasa sizeCm, el
   * resolution check se omite y el resto corre. Si todo OK, el caller puede
   * ignorar este campo. */
  validation?: import("./photo-validation").PhotoValidationResult;
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
  /** M.3.b.B.2 — tamaño físico del imán para validar resolución vs DPI 300.
   * Ej "5×5" / "15×15". Si no se pasa, el resolution check se omite. */
  productSizeCm?: string;
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

  // Verifica el MIME REAL por magic bytes (no confiar en originalMimeType, que el
  // cliente falsifica) — paridad con uploadProductImage. Rechaza polyglots
  // (.html/.svg con extensión .jpg) ANTES de sharp, con error claro, y usa el
  // formato real como fuente de verdad para la rama HEIC y el contentType final.
  const realMime = sniffImageMime(opts.buffer);
  if (!realMime || !CUSTOMER_UPLOAD_ALLOWED_MIME.has(realMime)) {
    throw new StorageError(
      "INVALID_TYPE",
      "El archivo no es una imagen válida (jpg/png/webp/heic/heif).",
    );
  }

  // Strip EXIF + auto-orient + convert HEIC→JPEG via sharp.
  // sharp.rotate() respeta EXIF orientation y luego strip lo descarta.
  // .toBuffer() devuelve buffer optimizado.
  // sharp-safe (no sharp directo): garantiza sharp.block() de los loaders con CVE
  // ANTES de procesar el upload (auditoría experto 2026-07-26, cierra el bypass).
  const sharp = (await import("@/features/personalization/sharp-safe")).default;
  let processed: Buffer;
  let finalMime: string;
  let width: number;
  let height: number;
  try {
    const pipeline = sharp(opts.buffer).rotate(); // auto-orient + strip EXIF
    const isHeic = realMime === "image/heic" || realMime === "image/heif";
    if (isHeic) {
      // HEIC requiere libvips compilado con heif (Vercel build incluye).
      // Si falla, sharp lanza error claro al cliente.
      const out = await pipeline
        .jpeg({ quality: 92, mozjpeg: true })
        .toBuffer({ resolveWithObject: true });
      processed = out.data;
      finalMime = "image/jpeg";
      width = out.info.width;
      height = out.info.height;
    } else {
      const out = await pipeline.toBuffer({ resolveWithObject: true });
      processed = out.data;
      finalMime = realMime; // MIME REAL detectado por bytes, no el declarado
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
    throw new StorageError(
      "UPLOAD_FAILED",
      `Subió pero no pudimos firmar URL: ${signErr?.message ?? "unknown"}`,
    );
  }

  // M.3.b.B.2 — Validación de calidad post-procesamiento (no bloquea upload,
  // solo informa al cliente). Si el caller no pasa productSizeCm, omitimos
  // el DPI check y solo evaluamos brillo/blur.
  let validation: CustomerUploadResult["validation"];
  try {
    const { validatePhotoQuality } = await import("./photo-validation");
    validation = await validatePhotoQuality({
      buffer: processed,
      width,
      height,
      productSizeCm: opts.productSizeCm,
    });
  } catch {
    // Validación opcional — si falla por OOM o sharp bug, no rompemos el upload.
    validation = undefined;
  }

  return {
    path: filename,
    signedUrl: signed.signedUrl,
    width,
    height,
    sizeBytes: processed.length,
    mimeType: finalMime,
    exifStripped: true,
    validation,
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
    throw new StorageError(
      "UPLOAD_FAILED",
      `No pudimos refirmar URL: ${error?.message ?? "unknown"}`,
    );
  }
  return data.signedUrl;
}

const PRODUCTION_ASSETS_BUCKET = "production-assets";

/**
 * Firma en lote los paths de PNGs de producción (bucket PRIVADO production-assets) para que el
 * admin los descargue e imprima (ADR-063 T1). Antes el admin no tenía acceso a estos archivos
 * desde la UI (getOrder no traía productionUrls[] y el detalle apuntaba a un campo legacy). TTL
 * configurable; devuelve un Map path→signedUrl. Los paths que no se puedan firmar se omiten.
 */
export async function getProductionAssetSignedUrls(
  paths: string[],
  ttlSeconds = 3600,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (paths.length === 0) return out;
  const { data, error } = await supabaseService.storage
    .from(PRODUCTION_ASSETS_BUCKET)
    .createSignedUrls(paths, ttlSeconds);
  if (error || !data) return out;
  for (const row of data) {
    if (row.signedUrl && row.path) out.set(row.path, row.signedUrl);
  }
  return out;
}

/**
 * Descarga los bytes de un PNG de producción (bucket PRIVADO, service role). Para armar el ZIP de
 * impresión (ADR-063 T7) server-side. Devuelve null si el path no existe o falla la descarga.
 */
export async function downloadProductionAsset(path: string): Promise<Buffer | null> {
  const { data, error } = await supabaseService.storage
    .from(PRODUCTION_ASSETS_BUCKET)
    .download(path);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}
