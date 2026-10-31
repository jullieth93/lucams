"use client";

/*
 * Miniatura PAGINADA de la línea de pedido/carrito (2026-10-31, owner).
 *
 * Lineamiento de previews: TODA vista previa de un diseño multi-unidad pagina
 * por unidad (sets, tiras, separadores, packs…). La miniatura de la línea era
 * la única excepción — imagen estática de la primera unidad + badge — y el
 * pager faltaba también al abrirla desde /checkout/gracias. Este componente
 * unifica: la miniatura recorre las mismas páginas watermark (wm/pages/NN.webp)
 * con chevrons ‹ › (wrap-around) y un click en la imagen abre el lightbox
 * compartido (DesignPreviewDialog) con el pager completo.
 *
 * Estructura HTML: los chevrons son HERMANOS del trigger del diálogo (no hijos)
 * porque un <button> no puede anidar otro <button>. El trigger cubre todo el
 * contenedor; los chevrons flotan encima a los lados.
 *
 * Imágenes con <img> directo (no next/image): las URLs salen del handler
 * autorizado /api/design-preview/* y el optimizer no reenvía cookies
 * (ver isPreviewHandlerUrl en features/personalization/preview-artifacts.ts).
 */

import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DesignPreviewDialog } from "./design-preview-dialog";

export function PagedPreviewThumb({
  pages,
  fallbackUrl,
  alt,
  contain,
  placeholder,
  badge,
  sizeClassName,
  previewUrl,
  pageLabels = null,
  watermarkNote = null,
  productName,
  title,
  description,
}: {
  /** Páginas watermark por unidad; con 0-1 la miniatura es estática (fallbackUrl). */
  pages: string[];
  /** Imagen estática cuando no hay pager (thumb del diseño o foto de catálogo). */
  fallbackUrl: string | null;
  alt: string;
  /** true = object-contain con aire (mosaico/página de diseño); false = cover (catálogo). */
  contain: boolean;
  /** Placeholder cuando no hay NINGUNA imagen (ícono Sparkles del llamador). */
  placeholder: ReactNode;
  /** Overlay del llamador (badge «N unidades») — se renderiza dentro del trigger. */
  badge?: ReactNode;
  /** Clases de tamaño/forma del contenedor (h-24 w-24, rounded, bg…). */
  sizeClassName: string;
  previewUrl: string;
  pageLabels?: (string | null)[] | null;
  watermarkNote?: ReactNode;
  productName: string;
  title: ReactNode;
  description: ReactNode;
}) {
  const [index, setIndex] = useState(0);
  const paged = pages.length > 1;
  const current = paged ? pages[index] : (pages[0] ?? fallbackUrl);

  return (
    <div className={`relative flex-shrink-0 ${sizeClassName}`}>
      <DesignPreviewDialog
        previewUrl={previewUrl}
        pages={paged ? pages : null}
        pageLabels={pageLabels}
        watermarkNote={watermarkNote}
        productName={productName}
        trigger={
          <button
            type="button"
            aria-label={`Ver el diseño de ${productName}`}
            className="focus-visible:ring-brand-turquoise absolute inset-0 cursor-zoom-in overflow-hidden focus-visible:ring-2 focus-visible:outline-none"
          >
            {current ? (
              // eslint-disable-next-line @next/next/no-img-element -- URL del handler autorizado /api/design-preview/*: el optimizer de next/image no reenvía cookies y 404-earía (ver isPreviewHandlerUrl).
              <img
                src={current}
                alt={alt}
                className={`h-full w-full ${contain ? "object-contain p-1.5" : "object-cover"}`}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">{placeholder}</div>
            )}
            {badge}
          </button>
        }
        title={title}
        description={description}
      />
      {paged && (
        <>
          <button
            type="button"
            aria-label="Unidad anterior"
            onClick={() => setIndex((i) => (i - 1 + pages.length) % pages.length)}
            className="text-brand-purple-dark focus-visible:ring-brand-turquoise absolute top-1/2 left-0.5 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 shadow-sm transition hover:bg-white focus-visible:ring-2 focus-visible:outline-none"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Unidad siguiente"
            onClick={() => setIndex((i) => (i + 1) % pages.length)}
            className="text-brand-purple-dark focus-visible:ring-brand-turquoise absolute top-1/2 right-0.5 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 shadow-sm transition hover:bg-white focus-visible:ring-2 focus-visible:outline-none"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </>
      )}
    </div>
  );
}
