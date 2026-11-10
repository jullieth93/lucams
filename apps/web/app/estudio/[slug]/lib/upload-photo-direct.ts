/*
 * Orquestación cliente de la subida DIRECTA a Storage (auditoría 2026-11-08).
 *
 * Fallback del pipeline de fotos (lib/upload-photo-pipeline) para el HEIC de
 * iPhone entre ~4.5 y 10 MB que el navegador no puede decodificar (Chrome/
 * Firefox): el body de una Server Action tiene techo ~4.5 MB en Vercel, así que
 * el archivo viaja ORIGINAL por fuera de la función en tres pasos:
 *
 *   1. createCustomerPhotoUploadTicketAction — valida metadata/consentimiento,
 *      rate limits y ownership, y emite la URL firmada del área de paso
 *      `<ownerId>/_staging/` (bucket privado customer-uploads).
 *   2. PUT directo a Storage con retry/timeout (mismo helper de los slots
 *      staged del finalize, ADR-081) — sin techo de función.
 *   3. ingestStagedCustomerPhotoAction — el servidor descarga el objeto, lo
 *      procesa con el MISMO pipeline del upload clásico (normalize-raster:
 *      transcode HEIC→JPEG, strip EXIF, derivado de lienzo, validación de
 *      calidad), crea el DesignAsset y limpia el área de paso.
 *
 * Vive aparte del pipeline porque importa Server Actions (el pipeline se
 * mantiene inyectable/testeable sin código de servidor).
 */

import {
  createCustomerPhotoUploadTicketAction,
  ingestStagedCustomerPhotoAction,
} from "@/features/personalization/actions";
import { putWithRetry } from "./upload-with-retry";
import type { DirectUploadFn } from "./upload-photo-pipeline";

/** MIME efectivo: iOS a veces entrega el HEIC con file.type vacío. */
function effectiveMime(file: File): "image/heic" | "image/heif" | string {
  if (file.type) return file.type;
  return /\.heif$/i.test(file.name) ? "image/heif" : "image/heic";
}

export const uploadPhotoDirectToStorage: DirectUploadFn = async (file, opts) => {
  const mimeType = effectiveMime(file);
  const ticket = await createCustomerPhotoUploadTicketAction({
    designId: opts.designId ?? undefined,
    mimeType,
    sizeBytes: file.size,
    rightsAccepted: opts.rightsAccepted,
  });
  if (!ticket.ok) return { ok: false, message: ticket.message };

  // PUT firmado: un 4xx (firma vencida) no se reintenta; red/5xx sí.
  await putWithRetry({ url: ticket.uploadUrl, body: file, contentType: mimeType });

  const ingested = await ingestStagedCustomerPhotoAction({
    path: ticket.path,
    designId: opts.designId ?? undefined,
    productSlug: opts.productSlug,
    productSizeCm: opts.productSizeCm,
    mimeType,
    rightsAccepted: opts.rightsAccepted,
  });
  if (!ingested.ok) return { ok: false, message: ingested.message };

  return {
    ok: true,
    assetId: ingested.assetId,
    signedUrl: ingested.signedUrl,
    canvasUrl: ingested.canvasUrl,
    width: ingested.width,
    height: ingested.height,
    validationLevel: ingested.validationLevel,
    validationMessage: ingested.validationMessage,
    validationRecommendation: ingested.validationRecommendation,
    validationChecks: ingested.validationChecks,
  };
};
