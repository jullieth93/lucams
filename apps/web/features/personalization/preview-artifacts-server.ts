/*
 * Generación y upload de los artefactos watermark del preview (2026-10-13).
 *
 * Server-only (sharp + Supabase service). La convención de paths y la selección
 * de exhibición viven en ./preview-artifacts (puro). Toda la generación es
 * BEST-EFFORT para el finalize: si sharp o Storage fallan se loguea y se
 * devuelve null/false — el preview limpio ya quedó subido y las superficies
 * degradan a él (nunca se bloquea una compra por la marca de agua).
 */

import "server-only";
import { supabaseService } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";
import { applyTiledWatermark } from "@/lib/watermark";
import {
  PREVIEW_PAGES_MAX,
  PREVIEW_THUMB_MAX_EDGE_PX,
  designPreviewPagePath,
  designPreviewThumbPath,
  designPreviewWmPagePath,
  designPreviewWmPath,
} from "./preview-artifacts";

const PREVIEWS_BUCKET = "design-previews";

/** Calidad WebP de las páginas limpias re-codificadas server-side. */
const PREVIEW_PAGE_WEBP_QUALITY = 82;

async function uploadWebp(path: string, data: Buffer): Promise<boolean> {
  const { error } = await supabaseService.storage.from(PREVIEWS_BUCKET).upload(path, data, {
    contentType: "image/webp",
    // 1 año, igual que el preview limpio: los paths son estables por diseño y su
    // contenido no cambia una vez finalizado (el re-finalize pisa con upsert).
    cacheControl: "31536000",
    upsert: true,
  });
  if (error) {
    logger.warn(
      { event: "design.preview_artifacts.upload_fail", path, err: error.message },
      "Upload de artefacto watermark falló",
    );
    return false;
  }
  return true;
}

/**
 * Genera y sube la versión WATERMARK del preview global y la miniatura
 * representativa (el global reducido a ≤800 px — si luego llegan páginas por
 * unidad, saveDesignPreviewPages la reemplaza por la primera página legible).
 * Devuelve true si ambos objetos quedaron subidos (el caller sella
 * Design.previewWatermarkedAt solo en ese caso).
 */
export async function uploadPreviewWatermarkArtifacts(
  designId: string,
  previewBuffer: Buffer,
): Promise<boolean> {
  try {
    const [wm, thumb] = await Promise.all([
      applyTiledWatermark(previewBuffer),
      applyTiledWatermark(previewBuffer, { maxEdgePx: PREVIEW_THUMB_MAX_EDGE_PX }),
    ]);
    const [wmOk, thumbOk] = await Promise.all([
      uploadWebp(designPreviewWmPath(designId), wm.data),
      uploadWebp(designPreviewThumbPath(designId), thumb.data),
    ]);
    return wmOk && thumbOk;
  } catch (err) {
    logger.warn(
      {
        event: "design.preview_artifacts.generate_fail",
        designId,
        err: err instanceof Error ? err.message : String(err),
      },
      "No se pudieron generar los artefactos watermark del preview (best-effort)",
    );
    return false;
  }
}

/**
 * Red de seguridad (rara): el finalize subió el preview limpio pero su paso
 * watermark falló. Regenera SOLO preview-wm.webp descargando el preview limpio
 * ya público. Devuelve true si el objeto quedó subido.
 */
export async function ensurePreviewWatermarkGlobal(
  designId: string,
  previewUrl: string,
): Promise<boolean> {
  try {
    const res = await fetch(previewUrl);
    if (!res.ok) return false;
    const buffer = Buffer.from(await res.arrayBuffer());
    const wm = await applyTiledWatermark(buffer);
    return await uploadWebp(designPreviewWmPath(designId), wm.data);
  } catch (err) {
    logger.warn(
      {
        event: "design.preview_artifacts.ensure_wm_fail",
        designId,
        err: err instanceof Error ? err.message : String(err),
      },
      "No se pudo regenerar el preview watermark global (best-effort)",
    );
    return false;
  }
}

/**
 * Sube las páginas por unidad del preview (las compone el Estudio con el MISMO
 * compositor de la modal «Vista previa» — fidelidad WYSIWYG): versión limpia
 * re-codificada a WebP en pages/NN.webp y versión watermark en wm/pages/NN.webp,
 * y regenera thumb.webp desde la PRIMERA página (la miniatura representativa:
 * el montaje global de un set multi-unidad se veía como "punticos" en el
 * carrito). Devuelve el número de páginas subidas, o null si falló todo.
 */
export async function uploadPreviewPages(
  designId: string,
  pages: Buffer[],
): Promise<number | null> {
  if (pages.length === 0 || pages.length > PREVIEW_PAGES_MAX) return null;
  try {
    const sharp = (await import("./sharp-safe")).default;
    // Decode + watermark de TODAS las páginas primero: si una no decodifica se
    // aborta sin subir nada (todo-o-nada — un set de páginas a medias dejaría
    // un pager con huecos en el carrito).
    const processed = await Promise.all(
      pages.map(async (page) => ({
        clean: await sharp(page).rotate().webp({ quality: PREVIEW_PAGE_WEBP_QUALITY }).toBuffer(),
        wm: await applyTiledWatermark(page),
      })),
    );
    for (const [i, p] of processed.entries()) {
      const n = i + 1;
      const [cleanOk, wmOk] = await Promise.all([
        uploadWebp(designPreviewPagePath(designId, n), p.clean),
        uploadWebp(designPreviewWmPagePath(designId, n), p.wm.data),
      ]);
      if (!cleanOk || !wmOk) return null; // upload parcial: no sellar el count
    }
    // Miniatura representativa: primera unidad/página legible, con watermark.
    const thumb = await applyTiledWatermark(pages[0]!, {
      maxEdgePx: PREVIEW_THUMB_MAX_EDGE_PX,
    });
    if (!(await uploadWebp(designPreviewThumbPath(designId), thumb.data))) return null;
    return processed.length;
  } catch (err) {
    logger.warn(
      {
        event: "design.preview_pages.generate_fail",
        designId,
        err: err instanceof Error ? err.message : String(err),
      },
      "No se pudieron procesar las páginas del preview (best-effort)",
    );
    return null;
  }
}
