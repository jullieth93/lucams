/*
 * Detección de MIME REAL por magic bytes (nunca el Content-Type del cliente).
 *
 * Extraído de lib/storage.ts (2026-10-30, LUC-SEC-004/005) para que el
 * normalizador de raster la use sin ciclo de imports. storage.ts la re-exporta
 * (compatibilidad con los call sites existentes). Módulo puro.
 */

/**
 * Devuelve el MIME real de un buffer de imagen o null si no es un raster/contenedor
 * reconocido. La allowlist de cada upload decide qué mimes acepta.
 */
export function sniffImageMime(buf: Buffer): string | null {
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
