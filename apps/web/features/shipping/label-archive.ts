/*
 * Fix 1.8 (2026-10-07) — copia PROPIA del PDF de la etiqueta de envío.
 *
 * Problema: las URLs que Aveonline devuelve en generarGuia (rutasticker/rutaguia/
 * rotulo) son hosteadas por ellos y su comportamiento varía por transportadora:
 * pueden expirar, requerir sesión o responder no-PDF (y para algunas, p.ej.
 * tcc-sa, no devuelven URL alguna). El admin terminaba con "a veces no descarga
 * guías según transportadora".
 *
 * Solución: tras un createShipment exitoso, archivamos el PDF en el bucket
 * PRIVADO production-assets (mismo bucket de los PNGs de producción — es el
 * bucket admin-only de documentos de la orden; la etiqueta contiene PII del
 * destinatario, así que bucket público queda descartado) y guardamos el path en
 * Order.labelPath. El detalle admin lo sirve via signed URL de TTL corto.
 *
 * Fuentes del PDF, en orden de preferencia:
 *   1. labelPdfBase64 (archivorotulo/archivosticker de la respuesta generarGuia —
 *      INTEGRATIONS_AVEONLINE §4.3 ya lo preveía: "guardar en Supabase Storage").
 *   2. Descarga de labelUrl, luego trackingUrl (solo http(s)).
 *
 * Validaciones: tamaño máx, timeout de descarga y magic bytes %PDF (el
 * content-type que sirve Aveonline es solo indicativo — responde PHP que a veces
 * devuelve HTML de error con status 200; los magic bytes son la fuente de verdad).
 *
 * BEST-EFFORT por contrato: NUNCA lanza. Si no se logra archivar devuelve null y
 * deja logger.warn; el flujo de la orden sigue con las URLs externas como hoy.
 */

import "server-only";
import { supabaseService } from "@/lib/supabase/service";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { logger } from "@/lib/logger";

const BUCKET = "production-assets";
const MAX_LABEL_BYTES = 15 * 1024 * 1024; // 15 MB — una guía PDF real pesa <1 MB
const DOWNLOAD_TIMEOUT_MS = 12_000;

/** Path dentro del bucket para la etiqueta de una orden. */
export function shipmentLabelPath(orderId: string): string {
  return `shipping-labels/${orderId}.pdf`;
}

/**
 * ¿Es un PDF? El spec permite el header "%PDF-" dentro de los primeros 1024
 * bytes (algunos generadores anteponen whitespace/BOM), así que buscamos ahí en
 * vez de exigir offset 0.
 */
export function isPdfBuffer(buf: Buffer): boolean {
  if (buf.length < 5) return false;
  return buf.subarray(0, Math.min(buf.length, 1024)).includes("%PDF-");
}

function isHttpUrl(url: string | null | undefined): url is string {
  return !!url && (url.startsWith("https://") || url.startsWith("http://"));
}

/** Decodifica y valida un PDF en base64 (archivorotulo de Aveonline). */
function fromBase64(b64: string): Buffer | null {
  const clean = b64.replace(/\s+/g, "");
  if (!clean) return null;
  let buf: Buffer;
  try {
    buf = Buffer.from(clean, "base64");
  } catch {
    return null;
  }
  if (buf.length === 0 || buf.length > MAX_LABEL_BYTES) return null;
  return isPdfBuffer(buf) ? buf : null;
}

/** Descarga y valida un PDF desde una URL externa (Aveonline). */
async function fromUrl(url: string, orderId: string): Promise<Buffer | null> {
  let res: Response;
  try {
    res = await fetchWithTimeout(url, { timeoutMs: DOWNLOAD_TIMEOUT_MS });
  } catch (err) {
    logger.warn({
      event: "shipping.label_archive.download_fail",
      orderId,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
  if (!res.ok) {
    logger.warn({
      event: "shipping.label_archive.download_http_fail",
      orderId,
      status: res.status,
    });
    return null;
  }
  // Content-length es solo indicativo (puede faltar o mentir): si excede el tope
  // abortamos temprano; si no, el tope se aplica sobre el buffer ya descargado.
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_LABEL_BYTES) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0 || buf.length > MAX_LABEL_BYTES) return null;
  if (!isPdfBuffer(buf)) {
    // Caso real STG: el rotulador PHP de Aveonline responde 200 con HTML de error
    // (sesión expirada, guía anulada) en vez del PDF.
    logger.warn({
      event: "shipping.label_archive.not_a_pdf",
      orderId,
      contentType: res.headers.get("content-type"),
    });
    return null;
  }
  return buf;
}

/**
 * Archiva la etiqueta de la orden en production-assets y devuelve el path, o
 * null si ninguna fuente produjo un PDF válido. Nunca lanza (best-effort).
 */
export async function archiveShipmentLabel(opts: {
  orderId: string;
  labelUrl?: string | null;
  trackingUrl?: string | null;
  labelPdfBase64?: string | null;
}): Promise<string | null> {
  const { orderId } = opts;

  let pdf: Buffer | null = null;

  if (opts.labelPdfBase64) {
    pdf = fromBase64(opts.labelPdfBase64);
  }
  if (!pdf && isHttpUrl(opts.labelUrl)) {
    pdf = await fromUrl(opts.labelUrl, orderId);
  }
  if (!pdf && isHttpUrl(opts.trackingUrl) && opts.trackingUrl !== opts.labelUrl) {
    pdf = await fromUrl(opts.trackingUrl, orderId);
  }
  if (!pdf) return null;

  const path = shipmentLabelPath(orderId);
  const { error } = await supabaseService.storage.from(BUCKET).upload(path, pdf, {
    contentType: "application/pdf",
    cacheControl: "3600",
    // upsert: un reintento legítimo (admin "Regenerar guía" tras reconciliar) puede
    // re-archivar sobre el mismo path determinista sin chocar con el archivo viejo.
    upsert: true,
  });
  if (error) {
    logger.warn({
      event: "shipping.label_archive.upload_fail",
      orderId,
      err: error.message,
    });
    return null;
  }
  logger.info({
    event: "shipping.label_archive.ok",
    orderId,
    path,
    sizeBytes: pdf.length,
  });
  return path;
}
