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
 */

"use client";

import { uploadDesignPreviewPagesAction } from "@/features/personalization/actions";

const RETRY_DELAY_MS = 1500;

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

/**
 * Sube las páginas del preview con un reintento. `buildForm` debe construir un
 * FormData FRESCO por intento (el FormData no es reutilizable entre requests).
 * Nunca lanza por fallo de la action: devuelve false y lo reporta.
 */
export async function uploadPreviewPagesWithRetry(
  designId: string,
  buildForm: () => FormData,
): Promise<boolean> {
  let lastDetail = "desconocido";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await uploadDesignPreviewPagesAction(buildForm());
      if (res.ok) return true;
      lastDetail = res.message;
    } catch (err) {
      lastDetail = err instanceof Error ? err.message : String(err);
    }
    if (attempt === 1) await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
  }
  console.error("[studio.preview.pages-upload]", lastDetail);
  reportPreviewPagesFailure(designId, lastDetail);
  return false;
}
