/*
 * Pipeline UNIFICADO de subida de fotos del Estudio (fix STG 2026-10-05).
 *
 * Hallazgo STG: "subir fotos en Mis Fotos es demorado". Había DOS caminos
 * divergentes para la misma acción:
 *   - Sidebar ("Mis fotos") — aplicaba upscale local (client-photo-upscale,
 *     Web Worker) + compresión cliente (client-image-compress) ANTES de subir,
 *     pero procesaba los archivos SECUENCIALMENTE (N fotos = N × (decode +
 *     worker + RTT) en serie).
 *   - Picker modal (tap-on-slot) — subía el archivo CRUDO (fotos de iPhone de
 *     5-8 MB) por la Server Action, sin upscale ni compresión: más lento por
 *     foto y candidato al 413 de Vercel (~4.5 MB por request) que el sidebar
 *     ya había resuelto.
 *
 * Ahora ambos caminos corren ESTE pipeline por archivo:
 *
 *   1. upscalePhotoForPrint — re-muestreo local si la foto queda bajo el mínimo
 *      de impresión (Web Worker, ~sin costo de main thread; NO es singleton:
 *      cada llamada crea y termina su propio worker, así que varios en
 *      paralelo son seguros — ver client-photo-upscale.ts).
 *   2. compressImageForUpload — WebP 2400px q0.85 si supera ~2 MB (bajo el
 *      techo de Vercel; evita el 413 también en el picker).
 *   3. shrinkToFitUploadBudget — reducción OBLIGATORIA si aun así el preparado
 *      supera el presupuesto del payload (4 MB, bajo el techo de plataforma
 *      ~4.5 MB): baja borde largo/calidad progresivamente con PISO en el lado
 *      menor = px de 300 DPI del producto cuando se conoce (nunca sacrifica el
 *      mínimo de impresión por caber). Ver decisión HEIC abajo.
 *   4. uploadDesignAssetAction — la misma Server Action de siempre.
 *
 * DECISIÓN HEIC (robustez 2026-10-13): los HEIC de iPhone (1-5 MB) no pasaban
 * por el compresor (el navegador típico no los decodifica) y los de >4.5 MB
 * reventaban con el 413 genérico de Vercel. Se evaluó subida directa a Storage
 * con signed upload URL (createSignedUploadUrl + transcode posterior) y se
 * DESCARTÓ por invasiva: exige una acción nueva de firma, mover la validación
 * de ownership/límites a dos pasos y un transcode-or-delete sobre objetos ya
 * persistidos. La ruta elegida cubre los casos reales sin ese costo:
 *   - Safari decodea HEIC nativamente → el shrink del paso 3 lo convierte a
 *     WebP/JPEG en cliente y cabe siempre.
 *   - Chrome/Firefox no decodean HEIC → el HEIC típico de iPhone (1-2.5 MB)
 *     cabe en el payload y el SERVIDOR lo transcodifica a JPEG q92 con
 *     heic-decode antes de persistir (uploadCustomerPhoto, lib/storage.ts) —
 *     el asset y su metadata quedan web-compatible.
 *   - HEIC >4 MB en navegador sin decode → FAIL-CLOSED honesto (paso 3
 *     devuelve null): error claro al usuario ANTES de subir, no el 413 mudo.
 *
 * Multi-archivo: `processPhotoFiles` corre hasta 3 archivos en vuelo
 * (mapWithConcurrency de upload-with-retry) y entrega los resultados EN EL
 * ORDEN EN QUE SE ELIGIERON, no en orden de finalización: el orden de la
 * lista "Mis fotos" define qué foto cae en qué slot con «Llenar slots», así
 * que debe ser determinista. El flush es por prefijo contiguo: la foto 2 no
 * espera a que termine la 1, pero se PUBLICA después si la 1 aún no termina.
 *
 * Un archivo que falla NO frena a los demás (igual que el loop secuencial con
 * `continue` del sidebar): cada resultado es un outcome ok/error y el caller
 * decide el mensaje. La Server Action se INYECTA (`upload`) para que el módulo
 * no importe código de servidor y sea testeable con fakes.
 */

import {
  compressImageForUpload,
  shrinkToFitUploadBudget,
  UPLOAD_PAYLOAD_BUDGET_BYTES,
} from "../client-image-compress";
import { isStillBelowMinimum, upscalePhotoForPrint } from "../client-photo-upscale";
import { parseSizeCm, PX_PER_CM_300DPI } from "../client-photo-upscale-core";
import { mapWithConcurrency } from "./upload-with-retry";
import type { StudioAsset } from "../types";

/** Shape estructural del resultado de `uploadDesignAssetAction` (inyectada). */
export type UploadAssetSuccess = {
  ok: true;
  assetId: string;
  signedUrl: string;
  width: number;
  height: number;
  validationLevel?: StudioAsset["validationLevel"];
  validationMessage?: string;
  validationRecommendation?: string;
  validationChecks?: StudioAsset["validationChecks"];
};
export type UploadAssetFailure = { ok: false; message: string };
export type UploadAssetFn = (
  formData: FormData,
) => Promise<UploadAssetSuccess | UploadAssetFailure>;

/** Concurrencia del pipeline multi-archivo (mismo tope que los PUT de Storage). */
export const UPLOAD_PIPELINE_CONCURRENCY = 3;

export type PreparedPhoto = {
  /** Archivo listo para subir (mejorado y/o comprimido, o el original). */
  file: File;
  /**
   * false cuando el preparado NO cupo en el presupuesto del payload ni tras
   * la reducción obligatoria (o el navegador no lo decodifica): el caller NO
   * debe intentar el upload (sería el 413 genérico) y reporta fail-closed.
   */
  fitsBudget: boolean;
  /** true si hubo re-muestreo local por resolución insuficiente. */
  improved: boolean;
  /** true si aun tras el upscale sigue bajo el mínimo absoluto del servidor. */
  improvedButLow: boolean;
  /** Dimensiones de la foto ORIGINAL (solo cuando improved — metadata de sesión). */
  originalWidth?: number;
  originalHeight?: number;
};

/**
 * Secuencia upscale → compresión → reducción-al-presupuesto compartida por
 * sidebar y picker. Los dos primeros pasos caen al archivo original ante
 * cualquier fallo (fail-open: el servidor decide como antes); el tercero es
 * FAIL-CLOSED solo sobre el presupuesto del payload (fitsBudget=false cuando
 * no hay forma honesta de hacerlo caber — ver header del módulo).
 */
export async function preparePhotoForUpload(
  file: File,
  productSizeCm?: string,
): Promise<PreparedPhoto> {
  const upscaled = await upscalePhotoForPrint(file, productSizeCm);
  const compressed = await compressImageForUpload(upscaled?.file ?? file);

  let finalFile = compressed;
  if (compressed.size > UPLOAD_PAYLOAD_BUDGET_BYTES) {
    // Piso de impresión: los px de 300 DPI del lado menor del producto cuando
    // se conoce (misma regla que lib/photo-validation.ts del servidor). Sin
    // sizeCm, shrinkToFitUploadBudget usa su piso documentado.
    const parsed = parseSizeCm(productSizeCm);
    const minEdgeFloorPx = parsed
      ? Math.ceil(Math.min(parsed.widthCm, parsed.heightCm) * PX_PER_CM_300DPI)
      : undefined;
    finalFile = (await shrinkToFitUploadBudget(compressed, { minEdgeFloorPx })) ?? compressed;
  }

  return {
    file: finalFile,
    fitsBudget: finalFile.size <= UPLOAD_PAYLOAD_BUDGET_BYTES,
    improved: upscaled?.improved ?? false,
    improvedButLow: upscaled ? isStillBelowMinimum(upscaled) : false,
    ...(upscaled?.improved
      ? { originalWidth: upscaled.originalWidth, originalHeight: upscaled.originalHeight }
      : {}),
  };
}

/** FormData de la Server Action de subida (mismos campos en ambos caminos). */
export function buildAssetFormData(
  file: File,
  opts: { designId: string | null; rightsAccepted: boolean },
): FormData {
  const formData = new FormData();
  formData.append("file", file);
  if (opts.designId) formData.append("designId", opts.designId);
  formData.append("rightsAccepted", opts.rightsAccepted ? "true" : "false");
  return formData;
}

/**
 * ¿El fallo del framework/plataforma es de TAMAÑO? (puro — extraído del
 * sidebar). El 413 de Vercel llega como HTML no-RSC y Next lo traduce a
 * "An unexpected response was received from the server" (sin "413" en el
 * texto — hallazgo H7, 2026-08-06): el mensaje de tamaño también aplica ahí,
 * y si el archivo supera el tope del server (10 MB) la causa ES el tamaño
 * aunque el error no lo diga.
 */
export function isTooBigUploadError(preparedSizeBytes: number, reason: string): boolean {
  return (
    preparedSizeBytes > 10 * 1024 * 1024 ||
    /413|too large|end of form|network|fetch failed|unexpected response/i.test(reason)
  );
}

export type ProcessedPhoto =
  | {
      ok: true;
      fileName: string;
      /** Asset listo para publicar en el store / devolver al editor. */
      asset: StudioAsset;
      improved: boolean;
      improvedButLow: boolean;
    }
  | {
      ok: false;
      fileName: string;
      /** "server" = la acción respondió ok:false (serverMessage tiene el texto). */
      kind: "too-big" | "network" | "server";
      serverMessage?: string;
    };

export type ProcessPhotoFilesOptions = {
  productSizeCm?: string;
  designId: string | null;
  rightsAccepted: boolean;
  /** Server Action de subida, inyectada (testeable + sin import de servidor). */
  upload: UploadAssetFn;
  /** Tope de archivos en vuelo (default UPLOAD_PIPELINE_CONCURRENCY). */
  concurrency?: number;
  /**
   * Se invoca UNA vez por archivo, EN ORDEN de selección, a medida que cada
   * prefijo contiguo queda listo (ver doc del módulo).
   */
  onReady: (outcome: ProcessedPhoto) => void;
};

async function processOne(file: File, opts: ProcessPhotoFilesOptions): Promise<ProcessedPhoto> {
  const prepared = await preparePhotoForUpload(file, opts.productSizeCm);
  // Fail-closed honesto (robustez 2026-10-13): si el preparado no cupo en el
  // presupuesto del payload ni tras la reducción obligatoria, NO se intenta el
  // upload — el request moriría con el 413 genérico de la plataforma y el
  // usuario no entendería nada. El caller muestra el mensaje de tamaño claro.
  if (!prepared.fitsBudget) {
    return { ok: false, fileName: file.name, kind: "too-big" };
  }
  let result: UploadAssetSuccess | UploadAssetFailure;
  try {
    result = await opts.upload(
      buildAssetFormData(prepared.file, {
        designId: opts.designId,
        rightsAccepted: opts.rightsAccepted,
      }),
    );
  } catch (err) {
    // El framework/plataforma mató el request ANTES de la acción (413 de
    // Vercel, "Unexpected end of form", red): sin este catch el usuario no
    // veía NADA (silencio total — verificación de uploads 2026-08-05).
    const reason = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      fileName: file.name,
      kind: isTooBigUploadError(prepared.file.size, reason) ? "too-big" : "network",
    };
  }
  if (!result.ok) {
    return { ok: false, fileName: file.name, kind: "server", serverMessage: result.message };
  }
  return {
    ok: true,
    fileName: file.name,
    asset: {
      id: result.assetId,
      signedUrl: result.signedUrl,
      width: result.width,
      height: result.height,
      // Si hubo upscale local, las dimensiones de la ORIGINAL (metadata de
      // sesión): el chip de calidad mide la nitidez real, no los píxeles
      // re-muestreados (que no crean detalle).
      ...(prepared.improved
        ? { originalWidth: prepared.originalWidth, originalHeight: prepared.originalHeight }
        : {}),
      validationLevel: result.validationLevel,
      validationMessage: result.validationMessage,
      validationRecommendation: result.validationRecommendation,
      validationChecks: result.validationChecks,
    },
    improved: prepared.improved,
    improvedButLow: prepared.improvedButLow,
  };
}

/**
 * Procesa y sube todos los archivos con concurrencia limitada, entregando los
 * resultados en orden de selección vía `onReady` (y como retorno). Nunca
 * lanza por un archivo individual: los fallos llegan como outcomes ok:false.
 */
export async function processPhotoFiles(
  files: readonly File[],
  opts: ProcessPhotoFilesOptions,
): Promise<ProcessedPhoto[]> {
  const outcomes: Array<ProcessedPhoto | undefined> = new Array(files.length);
  let nextFlush = 0;
  const flush = () => {
    while (nextFlush < outcomes.length && outcomes[nextFlush] !== undefined) {
      opts.onReady(outcomes[nextFlush]!);
      nextFlush++;
    }
  };
  await mapWithConcurrency(
    [...files],
    opts.concurrency ?? UPLOAD_PIPELINE_CONCURRENCY,
    async (file, i) => {
      outcomes[i] = await processOne(file, opts);
      flush();
    },
  );
  return outcomes as ProcessedPhoto[];
}
