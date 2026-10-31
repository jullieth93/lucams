/*
 * Normalizador ÚNICO de raster para TODA entrada de imagen no confiable
 * (LUC-SEC-004/005, auditoría 2026-10-30).
 *
 * ANTES: el camino de fotos de cliente (uploadCustomerPhoto) estaba endurecido
 * pero los snapshots de producción (inline `production_i` y área de paso
 * `_client` en production-assets) solo validaban tamaño — bytes arbitrarios
 * llegaban al bucket privado de imprenta con MIME impuesto por el servidor.
 * Y NINGÚN decode aplicaba un presupuesto de píxeles: el default de sharp es
 * ~268 MP (lib/index.d.ts: "default 268402689"), así que un PNG de 2 KB que
 * declare 50.000×50.000 materializaba gigabytes de RGBA en una Function
 * serverless; con HEIC, heic-decode materializa el RGBA completo de forma
 * síncrona sin tope previo.
 *
 * QUÉ HACE ESTE MÓDULO (en este orden, todo fail-closed):
 *   1. Techo de bytes de entrada.
 *   2. Magic bytes reales (sniffImageMime) — texto/HTML/SVG/poliglotas y
 *      formatos fuera de la allowlist (GIF, TIFF, PDF…) se rechazan ANTES
 *      de tocar el decoder.
 *   3. HEIC: lee las dimensiones del box `ispe` (readHeicMaxPixels) ANTES de
 *      heic-decode; sobre presupuesto → rechazo sin materializar RGBA. Red de
 *      seguridad post-decode cuando el ispe no parsea.
 *   4. sharp con límites EXPLÍCITOS: limitInputPixels (presupuesto por caso de
 *      uso), limitInputChannels ≤4, pages: 1 (multipágina se reduce al primer
 *      frame — documentado, ningún formato con páginas entra hoy) y
 *      failOn configurable ("warning" por defecto: truncados/corruptos fuera).
 *   5. Rechazo de dimensiones/relación de aspecto absurdas.
 *   6. Re-encode CANÓNICO sin metadatos (EXIF/XMP/ICC fuera; orientación EXIF
 *      horneada con rotate()).
 *   7. Techo de bytes de SALIDA.
 *
 * NO reemplaza al antivirus para documentos: si el negocio acepta PDF/TIFF en
 * el futuro, van a cuarentena + scanner, nunca por aquí.
 */

import "server-only";
import { sniffImageMime } from "@/lib/image-sniff";

/** Razones de rechazo (para logs/métricas; al cliente van mensajes genéricos). */
export type RasterRejectReason =
  | "too-large-input"
  | "not-an-image"
  | "decode-failed"
  | "too-many-pixels"
  | "bad-dimensions"
  | "too-large-output";

export class RasterRejected extends Error {
  constructor(
    public readonly reason: RasterRejectReason,
    detail?: string,
  ) {
    super(detail ? `${reason}: ${detail}` : reason);
    this.name = "RasterRejected";
  }
}

/**
 * Presupuestos de píxeles por caso de uso. El máster de imprenta más grande del
 * catálogo ronda 3.240 px de lado (~12 MP) y las fotos de celular actuales no
 * pasan de ~48 MP — los techos dejan holgura ×4 y quedan 5× por debajo del
 * default de sharp (~268 MP), que es lo que hacía explotable una bomba.
 */
export const RASTER_PIXEL_BUDGET = {
  /** Snapshots de producción del cliente (inline o área de paso). */
  production: 50_000_000,
  /** Preview/páginas del Estudio (cliente). */
  preview: 25_000_000,
  /** Fotos crudas del cliente (customer-uploads). */
  photo: 50_000_000,
} as const;

/** Relación de aspecto máxima aceptada (la tira más larga del catálogo ≈ 4:1). */
export const RASTER_MAX_ASPECT_RATIO = 20;

export type NormalizeRasterOptions = {
  /** Presupuesto de píxeles (width × height) de la ENTRADA. */
  maxPixels: number;
  /** Techo de bytes de la entrada (defensa en profundidad; los callers ya capean). */
  maxInputBytes: number;
  /** Techo de bytes de la SALIDA re-codificada (opcional). */
  maxOutputBytes?: number;
  /** Relación de aspecto máxima (default RASTER_MAX_ASPECT_RATIO). */
  maxAspectRatio?: number;
  /** Formato de salida: "keep" = el formato REAL sniffado. */
  output:
    | { format: "keep" }
    | { format: "png" }
    | { format: "jpeg"; quality?: number }
    | { format: "webp"; quality?: number };
  /**
   * Severidad de fallo del decoder (sharp `failOn`). Default "warning":
   * truncados y corruptos rechazados. Nunca bajar a "none" para entrada hostil.
   */
  failOn?: "warning" | "error";
};

export type NormalizedRaster = {
  buffer: Buffer;
  mime: string;
  width: number;
  height: number;
};

/**
 * Lee el área máxima declarada por los boxes `ispe` de un HEIC/HEIF (ISOBMFF)
 * SIN decodificar: meta → iprp → ipco → ispe (version/flags + width + height).
 * Devuelve el área (width × height) del ispe más grande, o null si no parsea —
 * el caller decide: sobre presupuesto rechaza pre-decode; sin ispe, queda la
 * red de seguridad post-decode.
 */
export function readHeicMaxPixels(buf: Buffer): number | null {
  const walk = (start: number, end: number, depth: number): number[] => {
    const found: number[] = [];
    let off = start;
    while (off + 8 <= end && off + 8 <= buf.length) {
      const size = buf.readUInt32BE(off);
      const type = buf.toString("ascii", off + 4, off + 8);
      if (size < 8 || off + size > buf.length || off + size > end) break;
      const contentStart = off + 8;
      const contentEnd = off + size;
      if (type === "ispe" && size >= 20) {
        // FullBox: 4 bytes version/flags, luego width y height (u32 BE).
        const w = buf.readUInt32BE(contentStart + 4);
        const h = buf.readUInt32BE(contentStart + 8);
        if (w > 0 && h > 0) found.push(w * h);
      }
      // Contenedores con hijos (meta es FullBox: +4 bytes de version/flags).
      if (depth < 6 && (type === "meta" || type === "iprp" || type === "ipco")) {
        found.push(...walk(contentStart + (type === "meta" ? 4 : 0), contentEnd, depth + 1));
      }
      off += size;
    }
    return found;
  };
  const areas = walk(0, buf.length, 0);
  return areas.length > 0 ? Math.max(...areas) : null;
}

/**
 * Normaliza un raster de entrada no confiable. Lanza RasterRejected (typed)
 * ante cualquier incumplimiento — NUNCA devuelve bytes sin re-codificar.
 */
export async function normalizeRasterImage(
  input: Buffer,
  opts: NormalizeRasterOptions,
): Promise<NormalizedRaster> {
  if (input.length === 0) throw new RasterRejected("not-an-image", "buffer vacío");
  if (input.length > opts.maxInputBytes) {
    throw new RasterRejected(
      "too-large-input",
      `${input.length} bytes > techo ${opts.maxInputBytes}`,
    );
  }

  const realMime = sniffImageMime(input);
  if (!realMime) throw new RasterRejected("not-an-image", "magic bytes desconocidos");

  // sharp endurecido (loaders con CVE bloqueados) — import perezoso como en el
  // resto del proyecto (no cargar el binario nativo en lambdas que no lo usan).
  const sharp = (await import("./sharp-safe")).default;
  const failOn = opts.failOn ?? "warning";

  let pipeline;
  if (realMime === "image/heic" || realMime === "image/heif") {
    // LUC-SEC-005 — heic-decode materializa el RGBA completo de forma síncrona:
    // el presupuesto se aplica ANTES (ispe) y DESPUÉS (dimensiones reales).
    const declared = readHeicMaxPixels(input);
    if (declared !== null && declared > opts.maxPixels) {
      throw new RasterRejected("too-many-pixels", `HEIC declara ${declared} px (ispe)`);
    }
    let decoded: { data: Uint8Array | Uint8ClampedArray; width: number; height: number };
    try {
      const { default: heicDecode } = await import("heic-decode");
      decoded = await heicDecode({ buffer: input });
    } catch (err) {
      throw new RasterRejected(
        "decode-failed",
        `HEIC: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const pixels = decoded.width * decoded.height;
    if (pixels > opts.maxPixels) {
      throw new RasterRejected("too-many-pixels", `HEIC real ${pixels} px (post-decode)`);
    }
    // Los píxeles crudos se codifican a JPEG de inmediato: la etapa intermedia
    // debe ser una imagen decodificable para la verificación de dimensiones y
    // el re-encode canónico posterior (raw sin formato no lo es).
    pipeline = sharp(Buffer.from(decoded.data.buffer as ArrayBuffer), {
      raw: { width: decoded.width, height: decoded.height, channels: 4 },
    }).jpeg({ quality: 92, mozjpeg: true });
    // La orientación EXIF del HEIC la aplica libheif al decodificar (no rotate extra).
  } else {
    if (realMime !== "image/jpeg" && realMime !== "image/png" && realMime !== "image/webp") {
      throw new RasterRejected("not-an-image", `formato no aceptado: ${realMime}`);
    }
    pipeline = sharp(input, {
      limitInputPixels: opts.maxPixels,
      limitInputChannels: 4,
      pages: 1, // multipágina/animado → primer frame, decisión explícita y documentada
      failOn,
    }).rotate(); // hornea orientación EXIF y descarta el resto de metadata
  }

  // Verificación de dimensiones sobre metadata REAL (post-snisff, pre-encode).
  let out;
  try {
    out = await pipeline.toBuffer({ resolveWithObject: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/pixel limit/i.test(msg)) {
      throw new RasterRejected("too-many-pixels", msg);
    }
    throw new RasterRejected("decode-failed", msg);
  }

  const width = out.info.width;
  const height = out.info.height;
  const pixels = width * height;
  if (pixels > opts.maxPixels) {
    throw new RasterRejected("too-many-pixels", `${width}×${height} = ${pixels} px`);
  }
  const aspect = Math.max(width, height) / Math.max(1, Math.min(width, height));
  const maxAspect = opts.maxAspectRatio ?? RASTER_MAX_ASPECT_RATIO;
  if (aspect > maxAspect) {
    throw new RasterRejected("bad-dimensions", `aspecto ${aspect.toFixed(1)}:1 > ${maxAspect}:1`);
  }

  // Re-encode CANÓNICO sin metadatos (sharp no copia EXIF/XMP/ICC salvo
  // withMetadata explícito — la salida queda limpia por construcción).
  let finalPipeline = sharp(out.data);
  let mime: string;
  const fmt = opts.output.format;
  if (fmt === "png") {
    finalPipeline = finalPipeline.png();
    mime = "image/png";
  } else if (fmt === "jpeg") {
    finalPipeline = finalPipeline.jpeg({ quality: opts.output.quality ?? 92, mozjpeg: true });
    mime = "image/jpeg";
  } else if (fmt === "webp") {
    finalPipeline = finalPipeline.webp({ quality: opts.output.quality ?? 82 });
    mime = "image/webp";
  } else {
    // keep: formato real sniffado (heic ya salió como píxeles crudos → jpeg)
    mime = realMime === "image/heic" || realMime === "image/heif" ? "image/jpeg" : realMime;
    if (mime === "image/jpeg") finalPipeline = finalPipeline.jpeg({ mozjpeg: true });
    else if (mime === "image/webp") finalPipeline = finalPipeline.webp();
    else finalPipeline = finalPipeline.png();
  }
  const finalBuf = await finalPipeline.toBuffer();
  if (opts.maxOutputBytes && finalBuf.length > opts.maxOutputBytes) {
    throw new RasterRejected(
      "too-large-output",
      `${finalBuf.length} bytes > techo ${opts.maxOutputBytes}`,
    );
  }
  return { buffer: finalBuf, mime, width, height };
}
