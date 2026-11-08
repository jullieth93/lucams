/*
 * Upload de las páginas por unidad del preview (2026-10-13; 2026-11-03: sin
 * watermark — ADR-191: el anti-copia tiling se retiró de los previews de
 * diseño, ver preview-artifacts.ts).
 *
 * Server-only (sharp + Supabase service). La convención de paths y la selección
 * de exhibición viven en ./preview-artifacts (puro). La generación es
 * BEST-EFFORT para el finalize: si sharp o Storage fallan se loguea y se
 * devuelve null — el preview limpio ya quedó subido y las superficies lo usan
 * (nunca se bloquea una compra por las páginas del pager).
 */

import "server-only";
import { supabaseService } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";
import { PREVIEW_PAGES_MAX, designPreviewPagePath } from "./preview-artifacts";

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
      "Upload de página del preview falló",
    );
    return false;
  }
  return true;
}

/**
 * Sube las páginas por unidad del preview (las compone el Estudio con el MISMO
 * compositor de la modal «Vista previa» — fidelidad WYSIWYG), re-codificadas a
 * WebP en pages/NN.webp. Devuelve el número de páginas subidas, o null si falló
 * todo.
 *
 * `offset` (auditoría 2026-11-08 — subida por lotes): el Estudio envía las
 * páginas en varios requests porque Vercel corta el body de una Server Action
 * en ~4.5 MB y 24 páginas × 1 MB no caben en uno solo. Cada lote se escribe en
 * su posición real (offset+i+1) y es todo-o-nada EN SU LOTE (un lote a medias
 * dejaría un pager con huecos); el sellado de Design.previewPagesCount lo hace
 * el llamador solo con el lote final.
 */
export async function uploadPreviewPages(
  designId: string,
  pages: Buffer[],
  offset = 0,
): Promise<number | null> {
  if (pages.length === 0 || offset < 0 || offset + pages.length > PREVIEW_PAGES_MAX) return null;
  try {
    const sharp = (await import("./sharp-safe")).default;
    // Decode de TODAS las páginas del lote primero: si una no decodifica se
    // aborta sin subir nada del lote (todo-o-nada por lote).
    const processed = await Promise.all(
      pages.map((page) =>
        // LUC-SEC-005 — presupuesto explícito por página (las compone el
        // Estudio = origen cliente).
        sharp(page, {
          limitInputPixels: 25_000_000,
          limitInputChannels: 4,
          pages: 1,
          failOn: "warning",
        })
          .rotate()
          .webp({ quality: PREVIEW_PAGE_WEBP_QUALITY })
          .toBuffer(),
      ),
    );
    for (const [i, p] of processed.entries()) {
      if (!(await uploadWebp(designPreviewPagePath(designId, offset + i + 1), p))) return null;
    }
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
