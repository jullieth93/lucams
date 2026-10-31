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
 *   <productId>/<uuid>.webp   (desde 2026-09-18 toda imagen de catálogo se
 *   normaliza a WebP ≤2000 px con sharp antes de subir — optimizeCatalogImage;
 *   desde 2026-10-13 los MASTERS de prediseñados usan la variante print-grade
 *   ≤4000 px q90 — uploadGalleryMasterImage, ver GALLERY_MASTER_*)
 * Garantiza no colisión incluso si dos admins suben simultáneamente.
 */

import "server-only";
import { randomUUID } from "node:crypto";
import { supabaseService } from "@/lib/supabase/service";
import { applyTiledWatermark } from "@/lib/watermark";

// Re-export (canónica en ./image-sniff desde LUC-SEC-004/005 — el
// normalizador la usa sin ciclo de imports; los call sites no cambian).
import { sniffImageMime } from "./image-sniff";
export { sniffImageMime };
import { logger } from "@/lib/logger";

const BUCKET = "product-images";
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const PUBLIC_URL_MARKER = `/storage/v1/object/public/${BUCKET}/`;

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

/**
 * Optimización de catálogo (feedback Lucy 2026-09-18): toda imagen pública del catálogo/mediateca
 * se normaliza a WebP q82 con borde largo ≤2000 px antes de subir. Antes se subía el archivo TAL
 * CUAL (hasta 5 MB): PNGs de 4 MB servidos crudos a cada visita. 2000 px sobra para PDP/zoom
 * (el borde largo en pantalla nunca pasa de ~1200 px ×2 DPR) y WebP q82 baja el peso ~5-10×.
 */
export const CATALOG_IMAGE_MAX_EDGE_PX = 2000;
export const CATALOG_IMAGE_WEBP_QUALITY = 82;

/**
 * Master PRINT-GRADE de prediseñados (robustez pipeline 2026-10-13): el original de un
 * diseño de galería es lo que el SERVIDOR aplica al canvas de producción
 * (assignPredesignedToDesignAction lo descarga y lo sube como asset del cliente). A 2000 px
 * quedaba por debajo de 300 DPI en las piezas grandes (~34 cm de borde largo), así que el
 * master de galería conserva hasta 4000 px con WebP q90 (alta calidad: es insumo de
 * impresión, no imagen de exhibición — la exhibición usa la miniatura watermark ≤800 px de
 * uploadGalleryThumb, que NO cambia). Tope de entrada 15 MB: el original puede venir en PNG
 * pesado; la salida optimizada queda típicamente en 1-3 MB.
 */
export const GALLERY_MASTER_MAX_EDGE_PX = 4000;
export const GALLERY_MASTER_WEBP_QUALITY = 90;
export const GALLERY_MASTER_MAX_BYTES = 15 * 1024 * 1024; // 15 MB

/**
 * Núcleo compartido de normalización a WebP (auto-orient por EXIF + strip, borde largo
 * ≤ maxEdgePx sin agrandar). FAIL-CLOSED a propósito (a diferencia del compresor del
 * Estudio, que es fail-open): si sharp no puede decodificarla se rechaza con INVALID_TYPE —
 * son imágenes públicas del bucket y un archivo que no decodifica no debe llegar ahí (mismo
 * contrato que tenía la mediateca con su prueba de dimensiones). Usa sharp-safe (loaders
 * con CVE bloqueados), la única puerta de entrada a sharp del proyecto.
 */
async function optimizeToWebp(
  buffer: Buffer,
  maxEdgePx: number,
  quality: number,
): Promise<{ data: Buffer; width: number; height: number }> {
  const sharp = (await import("@/features/personalization/sharp-safe")).default;
  try {
    const out = await sharp(buffer)
      .rotate() // auto-orient por EXIF + strip
      .resize({
        width: maxEdgePx,
        height: maxEdgePx,
        fit: "inside",
        withoutEnlargement: true, // no inventar píxeles si ya viene chica
      })
      .webp({ quality })
      .toBuffer({ resolveWithObject: true });
    return { data: out.data, width: out.info.width, height: out.info.height };
  } catch {
    throw new StorageError(
      "INVALID_TYPE",
      "No pudimos leer la imagen. ¿Está completa y sin daños?",
    );
  }
}

/**
 * Optimización de catálogo (feedback Lucy 2026-09-18): toda imagen pública del catálogo/mediateca
 * se normaliza a WebP q82 con borde largo ≤2000 px antes de subir. Antes se subía el archivo TAL
 * CUAL (hasta 5 MB): PNGs de 4 MB servidos crudos a cada visita. 2000 px sobra para PDP/zoom
 * (el borde largo en pantalla nunca pasa de ~1200 px ×2 DPR) y WebP q82 baja el peso ~5-10×.
 */
export async function optimizeCatalogImage(buffer: Buffer): Promise<{
  data: Buffer;
  width: number;
  height: number;
}> {
  return optimizeToWebp(buffer, CATALOG_IMAGE_MAX_EDGE_PX, CATALOG_IMAGE_WEBP_QUALITY);
}

/**
 * Variante PRINT-GRADE para los masters de prediseñados: WebP q90 con borde largo ≤4000 px
 * (ver GALLERY_MASTER_*). Mismo contrato fail-closed que optimizeCatalogImage.
 */
export async function optimizeGalleryMasterImage(buffer: Buffer): Promise<{
  data: Buffer;
  width: number;
  height: number;
}> {
  return optimizeToWebp(buffer, GALLERY_MASTER_MAX_EDGE_PX, GALLERY_MASTER_WEBP_QUALITY);
}

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
 *
 * Exportado para la mediateca CMS (lib/cms-media.ts, roadmap B5): mismo
 * pipeline anti-polyglot en los uploads de la mediateca.
 */

/**
 * Cuerpo compartido de upload de imagen optimizada al bucket público: valida tamaño +
 * MIME declarado + MIME REAL por magic bytes, optimiza con sharp (la salida es siempre
 * .webp / image/webp, venga en jpg, png, webp o avif) y sube con nombre UUID. Si sharp
 * falla, RECHAZA (fail-closed: son imágenes públicas). El llamador (server action admin)
 * ya verificó que el usuario es admin — no se re-checkea auth acá.
 */
async function uploadOptimizedImage(opts: {
  productId: string;
  file: File;
  maxBytes: number;
  optimize: (buffer: Buffer) => Promise<{ data: Buffer; width: number; height: number }>;
}): Promise<UploadedImage> {
  const { productId, file, maxBytes } = opts;

  if (file.size === 0) {
    throw new StorageError("EMPTY_FILE", "Archivo vacío");
  }
  if (file.size > maxBytes) {
    throw new StorageError("FILE_TOO_LARGE", `El archivo excede ${maxBytes / 1024 / 1024} MB`);
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

  const optimized = await opts.optimize(buffer);

  const filename = `${productId}/${randomUUID()}.webp`;
  const supabase = supabaseService;

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(filename, optimized.data, {
      contentType: "image/webp",
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
 * Sube una imagen al bucket. El llamador (server action admin) ya
 * verificó que el usuario es admin — esta función no re-checkea
 * auth, asume llamador autorizado.
 *
 * Pipeline (feedback Lucy 2026-09-18): valida tamaño + MIME declarado + MIME REAL por magic
 * bytes, y luego OPTIMIZA con sharp: redimensiona al borde largo ≤2000 px y convierte a WebP q82
 * (optimizeCatalogImage). La salida es siempre .webp / image/webp, venga en jpg, png, webp o avif.
 * Si sharp falla, RECHAZA (fail-closed: son imágenes públicas del catálogo).
 */
export async function uploadProductImage(opts: {
  productId: string;
  file: File;
}): Promise<UploadedImage> {
  return uploadOptimizedImage({
    productId: opts.productId,
    file: opts.file,
    maxBytes: MAX_BYTES,
    optimize: optimizeCatalogImage,
  });
}

/**
 * Variante PRINT-GRADE para los masters de la galería de prediseñados (robustez pipeline
 * 2026-10-13): igual que uploadProductImage pero con tope de entrada de 15 MB y optimización
 * a ≤4000 px WebP q90 (optimizeGalleryMasterImage). El master es insumo de IMPRESIÓN (el
 * servidor lo aplica al canvas de producción): a 2000 px quedaba bajo 300 DPI en piezas
 * grandes. La exhibición en el Estudio sigue siendo la miniatura watermark ≤800 px
 * (uploadGalleryThumb), que no cambia.
 */
export async function uploadGalleryMasterImage(opts: {
  productId: string;
  file: File;
}): Promise<UploadedImage> {
  return uploadOptimizedImage({
    productId: opts.productId,
    file: opts.file,
    maxBytes: GALLERY_MASTER_MAX_BYTES,
    optimize: optimizeGalleryMasterImage,
  });
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
  const idx = url.indexOf(PUBLIC_URL_MARKER);
  if (idx === -1) return null;
  return url.slice(idx + PUBLIC_URL_MARKER.length);
}

// ──────────── Miniaturas con watermark de prediseñados (Fase 3 · 3.10) ────────────
//
// Decisión owner 2026-10-07: los diseños prediseñados se exhiben en el Estudio
// como MINIATURA degradada (≤800 px, WebP q78) con marca de agua "LUCAMS" en
// tiling — el original (hasta 4000 px desde 2026-10-13, print-grade) nunca
// debería llegar al navegador del cliente (anti-copia + peso). El original sí
// lo usa el SERVIDOR (assignPredesignedToDesignAction lo descarga server-side
// al aplicar el diseño).
//
// Convención de path SIN migración (path derivada determinista del original):
//   gallery-<tag>/<uuid>.webp        → gallery-<tag>/thumbs/<uuid>.webp
//   gallery-<tag>-b/<uuid>.webp      → gallery-<tag>-b/thumbs/<uuid>.webp
// Se eligió sobre una columna `thumbUrl` porque el path es una función pura del
// imageUrl ya persistido: no hay schema drift, el backfill escribe en ese path y
// el hard-delete purga por el mismo cálculo. La EXISTENCIA se verifica con un
// list del folder de thumbs (listGalleryThumbPaths) — thumbUrl solo se expone si
// el objeto existe de verdad.

export const GALLERY_THUMB_MAX_EDGE_PX = 800;
export const GALLERY_THUMB_WEBP_QUALITY = 78;

/**
 * Path de la miniatura derivado del path del original: inserta el segmento
 * `thumbs/` antes del filename (`gallery-<tag>/<uuid>.webp` →
 * `gallery-<tag>/thumbs/<uuid>.webp`). null si el path no tiene carpeta.
 */
export function galleryThumbPath(originalPath: string): string | null {
  const idx = originalPath.lastIndexOf("/");
  if (idx === -1) return null;
  return `${originalPath.slice(0, idx)}/thumbs/${originalPath.slice(idx + 1)}`;
}

/** Path (bucket) de la miniatura a partir de la URL pública del original. null si no es URL nuestra. */
export function galleryThumbPathFromUrl(imageUrl: string): string | null {
  const path = extractPathFromPublicUrl(imageUrl);
  return path ? galleryThumbPath(path) : null;
}

/** URL pública de la miniatura derivada de la URL pública del original. null si no es URL nuestra. */
export function galleryThumbUrlFromImageUrl(imageUrl: string): string | null {
  const idx = imageUrl.indexOf(PUBLIC_URL_MARKER);
  if (idx === -1) return null;
  const thumbPath = galleryThumbPath(imageUrl.slice(idx + PUBLIC_URL_MARKER.length));
  if (!thumbPath) return null;
  return imageUrl.slice(0, idx) + PUBLIC_URL_MARKER + thumbPath;
}

/**
 * Genera los bytes de la miniatura de exhibición: borde largo ≤800 px (sin
 * agrandar), watermark LUCAMS en tiling y WebP q78. Fail-closed igual que
 * optimizeCatalogImage: si sharp no decodifica, INVALID_TYPE (la acción de
 * upload rechaza — un prediseñado sin miniatura protegida no debe quedar
 * exhibible por el fallback al original).
 *
 * 2026-10-13 — el tiling vive en @/lib/watermark (compartido con las versiones
 * watermark de los previews de diseños del cliente); mismo SVG y mismos
 * parámetros que la baldosa original de galería.
 */
export async function generateGalleryThumb(buffer: Buffer): Promise<{
  data: Buffer;
  width: number;
  height: number;
}> {
  try {
    return await applyTiledWatermark(buffer, {
      maxEdgePx: GALLERY_THUMB_MAX_EDGE_PX,
      quality: GALLERY_THUMB_WEBP_QUALITY,
    });
  } catch {
    throw new StorageError(
      "INVALID_TYPE",
      "No pudimos leer la imagen. ¿Está completa y sin daños?",
    );
  }
}

/**
 * Genera y sube la miniatura watermark de una imagen de galería ya subida
 * (`originalPath` = path devuelto por uploadProductImage). upsert: el backfill
 * one-shot y reintentos escriben el mismo path determinista (idempotente).
 */
export async function uploadGalleryThumb(opts: {
  originalPath: string;
  source: Buffer;
}): Promise<UploadedImage> {
  const thumbPath = galleryThumbPath(opts.originalPath);
  if (!thumbPath) {
    throw new StorageError(
      "UPLOAD_FAILED",
      "No se pudo derivar el path de la miniatura del diseño.",
    );
  }
  const thumb = await generateGalleryThumb(opts.source);
  const supabase = supabaseService;
  const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(thumbPath, thumb.data, {
    contentType: "image/webp",
    cacheControl: "31536000", // path con el UUID del original: inmutable como él
    upsert: true, // idempotente: backfill/reintento reescribe el mismo path
  });
  if (uploadErr) {
    throw new StorageError("UPLOAD_FAILED", `Error subiendo la miniatura: ${uploadErr.message}`);
  }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(thumbPath);
  return { path: thumbPath, publicUrl: data.publicUrl };
}

/**
 * Paths de las miniaturas EXISTENTES bajo `<folder>/thumbs/` (un solo list por
 * tag — la cardinalidad de una galería es de decenas, limit 1000 sobra). Sirve
 * para exponer thumbUrl solo cuando el objeto existe de verdad (las filas
 * anteriores al backfill caen al original). Fail-open a set vacío: si storage
 * no responde, el Estudio degrada al original en vez de romper la página.
 */
export async function listGalleryThumbPaths(folder: string): Promise<Set<string>> {
  try {
    const { data, error } = await supabaseService.storage
      .from(BUCKET)
      .list(`${folder}/thumbs`, { limit: 1000 });
    if (error || !data) return new Set();
    return new Set(
      data
        .filter((e) => e.id !== null && e.name !== ".emptyFolderPlaceholder")
        .map((e) => `${folder}/thumbs/${e.name}`),
    );
  } catch {
    return new Set();
  }
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
  /**
   * Derivado liviano para el LIENZO (ADR-166, 2026-10-22): WebP borde largo
   * ≤800px, objeto hermano `<…>/<uuid>.canvas.webp` en el mismo bucket. El
   * lienzo Konva lo carga en vez del master (que se reserva para imprenta).
   * null cuando el master ya venía ≤800px (no se genera) o cuando el derivado
   * falló — el cliente cae al master en ambos casos.
   */
  canvasPath: string | null;
  /** Signed URL (TTL 1h, igual que signedUrl) del derivado. null si canvasPath es null. */
  canvasSignedUrl: string | null;
  /** M.3.b.B.2 — resultado de validación calidad. Si no se pasa sizeCm, el
   * resolution check se omite y el resto corre. Si todo OK, el caller puede
   * ignorar este campo. */
  validation?: import("./photo-validation").PhotoValidationResult;
};

/**
 * Derivado para el lienzo del Estudio (ADR-166): el master (borde largo
 * ≤2400px) lo necesita solo imprenta (300 DPI); el lienzo y las texturas 3D
 * trabajan sobrados con ~800px (el stage lógico es ~720px y los snapshots de
 * preview/3D salen a ≤2x). q82: mismo punto de calidad/peso que el catálogo.
 */
export const CUSTOMER_UPLOAD_CANVAS_MAX_EDGE_PX = 800;
export const CUSTOMER_UPLOAD_CANVAS_WEBP_QUALITY = 82;

/**
 * Path del derivado de lienzo a partir del path del master:
 * `<ownerId>/<designId|pending>/<uuid>.<ext>` → `<…>/<uuid>.canvas.webp`.
 * Sufijo (no carpeta) para que el barrido de huérfanos y las purgas por
 * carpeta de diseño lo cubran con la misma regla que el master.
 */
export function customerUploadCanvasPath(masterPath: string): string {
  return masterPath.replace(/\.[^./]+$/, ".canvas.webp");
}

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
  /**
   * Fast-path de assets de GALERÍA (prediseñados, 2026-10-22): los masters son
   * curados por el admin (resolución/brillo/nitidez ya garantizados), así que
   * la pasada sharp de validatePhotoQuality es costo puro (~1 decode extra de
   * ~2000px por cara). true = saltarla. NUNCA usar para fotos del cliente:
   * ahí la validación sí aplica (alimenta el chip ⚠ de calidad).
   */
  skipQualityValidation?: boolean;
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

  // LUC-SEC-004/005 (2026-10-30) — el procesamiento pasa por el NORMALIZADOR
  // ÚNICO de raster (normalize-raster.ts): magic bytes reales (anti-poliglota,
  // igual que antes pero en un solo punto), presupuesto de píxeles (HEIC lee el
  // box ispe ANTES de que heic-decode materialice el RGBA completo), re-encode
  // canónico sin metadatos. HEIC → JPEG como siempre (sharp prebuilt de Linux
  // no trae HEVC — verificado 2026-08-05; Vercel también es Linux).
  let processed: Buffer;
  let finalMime: string;
  let width: number;
  let height: number;
  try {
    const { normalizeRasterImage, RASTER_PIXEL_BUDGET } =
      await import("@/features/personalization/normalize-raster");
    const out = await normalizeRasterImage(opts.buffer, {
      maxPixels: RASTER_PIXEL_BUDGET.photo,
      maxInputBytes: CUSTOMER_UPLOAD_MAX_BYTES,
      output: { format: "keep" }, // formato REAL sniffado (HEIC ya mapea a JPEG adentro)
    });
    processed = out.buffer;
    finalMime = out.mime;
    width = out.width;
    height = out.height;
  } catch (err) {
    const { RasterRejected } = await import("@/features/personalization/normalize-raster");
    if (err instanceof RasterRejected && err.reason === "not-an-image") {
      throw new StorageError(
        "INVALID_TYPE",
        "El archivo no es una imagen válida (jpg/png/webp/heic/heif).",
      );
    }
    if (err instanceof RasterRejected && err.reason === "too-large-input") {
      throw new StorageError(
        "FILE_TOO_LARGE",
        `El archivo excede ${CUSTOMER_UPLOAD_MAX_BYTES / 1024 / 1024} MB`,
      );
    }
    // LUC-SEC-005 — NUNCA exponer detalles internos del decoder al cliente.
    throw new StorageError(
      "UPLOAD_FAILED",
      "No pudimos procesar la imagen. Intenta con otra foto.",
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

  // Derivado para el LIENZO (ADR-166, 2026-10-22): WebP ≤800px del archivo YA
  // procesado (misma orientación/EXIF-strip que el master). FAIL-OPEN a
  // propósito: si el derivado falla la subida NO se rechaza — el cliente cae
  // al master (canvasPath null), que es el comportamiento previo. Skip cuando
  // el master ya es ≤800px de borde largo (el derivado no ahorraría nada).
  let canvasPath: string | null = null;
  let canvasSignedUrl: string | null = null;
  if (Math.max(width, height) > CUSTOMER_UPLOAD_CANVAS_MAX_EDGE_PX) {
    try {
      // sharp-safe (no sharp directo): loaders con CVE bloqueados + la entrada
      // acá es el master YA normalizado arriba.
      const sharp = (await import("@/features/personalization/sharp-safe")).default;
      const derivative = await sharp(processed)
        .resize({
          width: CUSTOMER_UPLOAD_CANVAS_MAX_EDGE_PX,
          height: CUSTOMER_UPLOAD_CANVAS_MAX_EDGE_PX,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: CUSTOMER_UPLOAD_CANVAS_WEBP_QUALITY })
        .toBuffer();
      const dPath = customerUploadCanvasPath(filename);
      const { error: dUploadErr } = await supabase.storage
        .from(CUSTOMER_UPLOADS_BUCKET)
        .upload(dPath, derivative, {
          contentType: "image/webp",
          cacheControl: "3600",
          upsert: false,
          metadata: { owner_id: opts.ownerId },
        } as never); // mismo metadata.owner_id que el master (RLS, M.1.b)
      if (dUploadErr) throw new Error(dUploadErr.message);
      const { data: dSigned, error: dSignErr } = await supabase.storage
        .from(CUSTOMER_UPLOADS_BUCKET)
        .createSignedUrl(dPath, 3600);
      if (dSignErr || !dSigned) throw new Error(dSignErr?.message ?? "sign failed");
      canvasPath = dPath;
      canvasSignedUrl = dSigned.signedUrl;
    } catch (err) {
      logger.warn(
        {
          event: "storage.customer_upload.canvas_derivative_fail",
          err: err instanceof Error ? err.message : String(err),
        },
        "Canvas derivative failed — falling back to master",
      );
    }
  }

  // M.3.b.B.2 — Validación de calidad post-procesamiento (no bloquea upload,
  // solo informa al cliente). Si el caller no pasa productSizeCm, omitimos
  // el DPI check y solo evaluamos brillo/blur.
  // 2026-10-22 — skipQualityValidation (assets de galería curados): se omite
  // la pasada completa (es costo puro para masters que ya vienen curados).
  let validation: CustomerUploadResult["validation"];
  if (!opts.skipQualityValidation) {
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
  }

  return {
    path: filename,
    signedUrl: signed.signedUrl,
    width,
    height,
    sizeBytes: processed.length,
    mimeType: finalMime,
    exifStripped: true,
    canvasPath,
    canvasSignedUrl,
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
