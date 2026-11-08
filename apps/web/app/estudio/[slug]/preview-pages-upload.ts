/*
 * Subida de las páginas por unidad/set del preview (pager del «Ver» en
 * carrito/pedidos/gracias) con UN reintento y reporte visible del fallo.
 *
 * Por qué existe (revalidación 2026-10-20 — el pedido real LCM-2026-0001 quedó
 * sin `previewPagesCount`): ambos editores (foto y letras) subían las páginas en
 * un request best-effort tras el finalize y un fallo caía a un `console.error`
 * invisible → el carrito/pedido perdían el pager para siempre sin que nadie se
 * enterara. Ahora: 1 reintento automático tras 1.5 s y, si aun así falla, POST
 * a /api/log-error (ErrorReport deduplicado, visible en /admin/observability).
 * Sigue siendo no-bloqueante para la compra: el caller decide (best-effort).
 *
 * LOTES (auditoría 2026-11-08): las páginas viajan en varios requests porque
 * Vercel corta el body de una Server Action en ~4.5 MB y un set de 24 páginas
 * (≤1 MB c/u) no cabe en uno solo — antes el request de 24 MB moría con el 413
 * genérico. Cada lote lleva pageOffset + totalPages; el servidor escribe las
 * páginas en su posición real y solo el lote FINAL sella Design.previewPagesCount
 * (un lote intermedio fallido deja el pager sin sellar, como antes del cambio).
 */

"use client";

import { uploadDesignPreviewPagesAction } from "@/features/personalization/actions";

const RETRY_DELAY_MS = 1500;

/**
 * Presupuesto de bytes por lote: bajo el presupuesto del payload de la Server
 * Action (4 MB, ver client-image-compress) con margen para el multipart
 * overhead y los campos de control. Las páginas llegan ≤1 MB (cap del server).
 */
const PREVIEW_PAGES_BATCH_BUDGET_BYTES = 3 * 1024 * 1024;

function reportPreviewPagesFailure(designId: string, detail: string): void {
  void fetch("/api/log-error", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    body: JSON.stringify({
      message: `preview-pages upload falló tras reintento (diseño ${designId}): ${detail}`,
      url: typeof window !== "undefined" ? window.location.href : undefined,
    }),
  }).catch(() => {});
}

/** FormData FRESCO de un lote (el FormData no es reutilizable entre requests). */
function buildBatchForm(
  designId: string,
  pages: readonly Blob[],
  offset: number,
  totalPages: number,
): FormData {
  const form = new FormData();
  form.set("designId", designId);
  form.set("pageOffset", String(offset));
  form.set("totalPages", String(totalPages));
  pages.forEach((blob, i) => form.set(`page_${i}`, blob, `page-${offset + i + 1}.webp`));
  return form;
}

/** Un lote con 1 reintento. Devuelve el detalle del fallo (o null si subió). */
async function uploadBatch(
  designId: string,
  pages: readonly Blob[],
  offset: number,
  totalPages: number,
): Promise<string | null> {
  let lastDetail = "desconocido";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await uploadDesignPreviewPagesAction(
        buildBatchForm(designId, pages, offset, totalPages),
      );
      if (res.ok) return null;
      lastDetail = res.message;
    } catch (err) {
      lastDetail = err instanceof Error ? err.message : String(err);
    }
    if (attempt === 1) await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
  }
  return lastDetail;
}

/**
 * Sube las páginas del preview EN LOTES (por presupuesto de bytes), cada uno
 * con un reintento. Si un lote falla se abortan los demás (un pager a medias
 * nunca se sella) y se reporta. Nunca lanza: devuelve false y lo reporta.
 */
export async function uploadPreviewPagesWithRetry(
  designId: string,
  pages: readonly Blob[],
): Promise<boolean> {
  const batches: { offset: number; pages: Blob[] }[] = [];
  let current: Blob[] = [];
  let currentBytes = 0;
  for (const page of pages) {
    if (current.length > 0 && currentBytes + page.size > PREVIEW_PAGES_BATCH_BUDGET_BYTES) {
      batches.push({ offset: 0, pages: current });
      current = [];
      currentBytes = 0;
    }
    current.push(page);
    currentBytes += page.size;
  }
  if (current.length > 0) batches.push({ offset: 0, pages: current });
  let offset = 0;
  for (const batch of batches) {
    batch.offset = offset;
    offset += batch.pages.length;
  }

  for (const batch of batches) {
    const failure = await uploadBatch(designId, batch.pages, batch.offset, pages.length);
    if (failure !== null) {
      console.error("[studio.preview.pages-upload]", failure);
      reportPreviewPagesFailure(designId, `lote desde página ${batch.offset + 1}: ${failure}`);
      return false;
    }
  }
  return true;
}
