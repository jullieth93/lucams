"use client";

/*
 * <ProductGallery> — galería del PDP con lightbox.
 *
 * - Hero image grande aspect-square con zoom CSS hover (scale 1.05)
 * - Hasta 5 thumbnails horizontales debajo, click cambia el hero
 * - Click sobre hero abre Dialog fullscreen con navegación ←/→ y Esc, y zoom
 *   completo (rueda anclada al cursor, pinch, doble click/tap, botones +/− y
 *   pan con arrastre) — misma matemática compartida de components/preview-zoom.ts
 *   que el lightbox «Ver» del diseño (design-preview-dialog): las fotos de
 *   producto también tienen detalle que el cliente necesita revisar de cerca.
 * - Empty state: gradient brand + ícono Sparkles
 * - Fallback onError (T5): una URL rota (404 hot-linked, objeto borrado) cae al MISMO
 *   placeholder Sparkles del empty state, por imagen — el hero roto era el LCP con priority
 *   y quedaba como imagen quebrada, peor en móvil.
 *
 * Props mínimas — el page server-side ya seleccionó las imágenes.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Sparkles,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  PREVIEW_ZOOM_MAX,
  PREVIEW_ZOOM_MIN,
  PREVIEW_ZOOM_TOGGLE,
  clampPanOffset,
  clampPreviewZoom,
  pinchPreviewZoom,
  stepPreviewZoom,
  wheelPreviewZoom,
  zoomPanTowardPoint,
} from "@/components/preview-zoom";

type ZoomState = { scale: number; x: number; y: number };
const ZOOM_RESET: ZoomState = { scale: 1, x: 0, y: 0 };

/** Distancia entre dos punteros activos (gesto pinch). */
function pointerDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Placeholder de marca: el mismo del empty state (gradiente lo aporta el contenedor). */
function GalleryPlaceholder({ className }: { className: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <Sparkles className={className} />
    </div>
  );
}

export function ProductGallery({ images, alt }: { images: string[]; alt: string }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  // URLs cuya carga falló (onError de next/image) — se reemplazan por el placeholder.
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  const markFailed = (url: string) =>
    setFailed((prev) => (prev.has(url) ? prev : new Set(prev).add(url)));

  if (images.length === 0) {
    return (
      <div className="border-brand-purple/10 from-brand-turquoise/15 via-brand-cream to-brand-pink/15 relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border bg-gradient-to-br">
        <Sparkles className="text-brand-purple/30 h-20 w-20" />
      </div>
    );
  }

  const activeImage = images[activeIdx] ?? images[0];
  const next = () => setActiveIdx((i) => (i + 1) % images.length);
  const prev = () => setActiveIdx((i) => (i - 1 + images.length) % images.length);

  return (
    <>
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          aria-label="Ver imagen ampliada"
          className="border-brand-purple/10 from-brand-turquoise/15 via-brand-cream to-brand-pink/15 group relative aspect-square w-full overflow-hidden rounded-xl border bg-gradient-to-br"
        >
          {failed.has(activeImage) ? (
            <GalleryPlaceholder className="text-brand-purple/30 h-20 w-20" />
          ) : (
            <Image
              src={activeImage}
              alt={alt}
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              priority
              onError={() => markFailed(activeImage)}
              className="object-cover transition-transform duration-300 group-hover:scale-105"
            />
          )}
          <div className="absolute right-2 bottom-2 rounded-full bg-white/90 p-2 opacity-0 shadow-md transition-opacity group-hover:opacity-100">
            <ZoomIn className="text-brand-purple-dark h-4 w-4" />
          </div>
        </button>
        {images.length > 1 && (
          /* Fondo tenue + gap generoso: las miniaturas blancas sobre el fondo
            crema de la página hacían invisible el gap de 8px. El tinte
            purple/5 de la tira hace que los gutters lean como "espacio"
            dedicado (paleta crema/morada de marca). El hero de arriba no se toca. */
          <div className="bg-brand-purple/5 grid grid-cols-5 gap-3 rounded-xl p-3">
            {/* ADR-057 cert: todas las miniaturas (admin permite hasta 8/10); la grilla envuelve. */}
            {images.map((img, idx) => (
              <button
                key={`${img}-${idx}`}
                type="button"
                onClick={() => setActiveIdx(idx)}
                aria-label={`Ver imagen ${idx + 1}`}
                className={
                  "border-brand-purple/10 relative aspect-square w-full overflow-hidden rounded-md border transition " +
                  (idx === activeIdx ? "ring-brand-purple ring-2" : "opacity-70 hover:opacity-100")
                }
              >
                {failed.has(img) ? (
                  <GalleryPlaceholder className="text-brand-purple/30 h-6 w-6" />
                ) : (
                  <Image
                    src={img}
                    alt={`${alt} — vista ${idx + 1}`}
                    fill
                    sizes="(max-width: 768px) 20vw, 10vw"
                    onError={() => markFailed(img)}
                    className="object-cover"
                  />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent showCloseButton={false} className="border-none bg-black/90 p-0 sm:max-w-5xl">
          {/* Radix exige título accesible aunque el lightbox sea puramente visual. */}
          <DialogTitle className="sr-only">Galería de {alt}</DialogTitle>
          <LightboxView
            images={images}
            alt={alt}
            activeIdx={activeIdx}
            failed={failed}
            onImageError={markFailed}
            onChange={setActiveIdx}
            onClose={() => setLightboxOpen(false)}
            onNext={next}
            onPrev={prev}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function LightboxView({
  images,
  alt,
  activeIdx,
  failed,
  onImageError,
  onChange,
  onClose,
  onNext,
  onPrev,
}: {
  images: string[];
  alt: string;
  activeIdx: number;
  failed: ReadonlySet<string>;
  onImageError: (url: string) => void;
  onChange: (i: number) => void;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
}) {
  // Zoom del lightbox (2026-10-22): misma matemática compartida de
  // components/preview-zoom.ts que el «Ver» del diseño — rueda anclada al
  // cursor, pinch, doble click/tap (100%↔200%), pan con arrastre y botones.
  // El zoom se restablece al cambiar de imagen y al cerrar (desmontaje).
  const [zoom, setZoom] = useState<ZoomState>(ZOOM_RESET);
  const [gesturing, setGesturing] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ dist: number; scale: number } | null>(null);
  const panRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(
    null,
  );
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  // Tras un doble tap táctil el browser TAMBIÉN sintetiza `dblclick` (mouse de
  // compatibilidad): sin esta guardia el toggle correría dos veces y el zoom
  // quedaría en cero neto (bug verificado en Chromium móvil, 2026-10-22).
  const lastTouchToggleRef = useRef(0);

  const applyZoom = useCallback((scale: number, x: number, y: number) => {
    const nextScale = clampPreviewZoom(scale);
    if (nextScale === PREVIEW_ZOOM_MIN) {
      setZoom(ZOOM_RESET);
      return;
    }
    const baseW = imgRef.current?.offsetWidth ?? 0;
    const baseH = imgRef.current?.offsetHeight ?? 0;
    setZoom({
      scale: nextScale,
      x: clampPanOffset(x, nextScale, baseW),
      y: clampPanOffset(y, nextScale, baseH),
    });
  }, []);

  const zoomRef = useRef<ZoomState>(ZOOM_RESET);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  // Rueda = zoom anclado al cursor. Listener nativo NO pasivo (el onWheel de
  // React se registra pasivo y el preventDefault sería no-op). Mismo criterio
  // que design-preview-dialog: el lightbox es modal fullscreen, la rueda no
  // atrapa scroll ajeno.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      const current = zoomRef.current;
      const nextScale = wheelPreviewZoom(current.scale, e.deltaY);
      const img = imgRef.current;
      if (!img) {
        applyZoom(nextScale, current.x, current.y);
        return;
      }
      const rect = img.getBoundingClientRect();
      const pointX = e.clientX - (rect.left + rect.width / 2 - current.x);
      const pointY = e.clientY - (rect.top + rect.height / 2 - current.y);
      applyZoom(
        nextScale,
        zoomPanTowardPoint(current.x, pointX, current.scale, nextScale),
        zoomPanTowardPoint(current.y, pointY, current.scale, nextScale),
      );
    };
    viewer.addEventListener("wheel", onWheel, { passive: false });
    return () => viewer.removeEventListener("wheel", onWheel);
  }, [applyZoom]);

  const toggleZoom = useCallback(() => {
    setZoom((z) => {
      const next = z.scale === PREVIEW_ZOOM_MIN ? PREVIEW_ZOOM_TOGGLE : PREVIEW_ZOOM_MIN;
      if (next === PREVIEW_ZOOM_MIN) return ZOOM_RESET;
      const baseW = imgRef.current?.offsetWidth ?? 0;
      const baseH = imgRef.current?.offsetHeight ?? 0;
      return {
        scale: next,
        x: clampPanOffset(z.x, next, baseW),
        y: clampPanOffset(z.y, next, baseH),
      };
    });
  }, []);

  const resetZoom = useCallback(() => setZoom(ZOOM_RESET), []);
  const goNext = useCallback(() => {
    resetZoom();
    onNext();
  }, [onNext, resetZoom]);
  const goPrev = useCallback(() => {
    resetZoom();
    onPrev();
  }, [onPrev, resetZoom]);
  const goTo = useCallback(
    (i: number) => {
      resetZoom();
      onChange(i);
    },
    [onChange, resetZoom],
  );

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setGesturing(true);
    const points = [...pointersRef.current.values()];
    if (points.length === 2) {
      pinchRef.current = { dist: pointerDistance(points[0], points[1]), scale: zoom.scale };
      panRef.current = null;
      lastTapRef.current = null;
    } else if (points.length === 1) {
      panRef.current = { startX: e.clientX, startY: e.clientY, baseX: zoom.x, baseY: zoom.y };
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const points = [...pointersRef.current.values()];
    if (points.length === 2 && pinchRef.current) {
      applyZoom(
        pinchPreviewZoom(
          pinchRef.current.scale,
          pinchRef.current.dist,
          pointerDistance(points[0], points[1]),
        ),
        zoom.x,
        zoom.y,
      );
    } else if (points.length === 1 && panRef.current && zoom.scale > PREVIEW_ZOOM_MIN) {
      applyZoom(
        zoom.scale,
        panRef.current.baseX + (e.clientX - panRef.current.startX),
        panRef.current.baseY + (e.clientY - panRef.current.startY),
      );
    }
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const wasPinch = pointersRef.current.size >= 2;
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size === 0) setGesturing(false);
    pinchRef.current = null;

    if (wasPinch) {
      const [remaining] = [...pointersRef.current.entries()];
      if (remaining) {
        panRef.current = {
          startX: remaining[1].x,
          startY: remaining[1].y,
          baseX: zoom.x,
          baseY: zoom.y,
        };
      }
      lastTapRef.current = null;
      return;
    }

    // Doble tap (táctil): solo taps simples sin arrastre. La distancia se mide
    // contra el pointerdown guardado (mismo criterio que design-preview-dialog).
    const downPos = panRef.current;
    if (e.pointerType === "touch" && downPos && pointersRef.current.size === 0) {
      const moved = Math.hypot(e.clientX - downPos.startX, e.clientY - downPos.startY);
      const now = Date.now();
      const last = lastTapRef.current;
      lastTapRef.current = moved < 12 ? { time: now, x: e.clientX, y: e.clientY } : null;
      if (moved < 12 && last && now - last.time < 350) {
        lastTapRef.current = null;
        lastTouchToggleRef.current = now;
        toggleZoom();
      }
    }
    if (pointersRef.current.size === 0) panRef.current = null;
  }

  // dblclick de MOUSE alterna el zoom; el dblclick sintetizado tras un doble
  // tap táctil se ignora (ya alternó vía pointerup — ver lastTouchToggleRef).
  const handleDoubleClick = useCallback(() => {
    if (Date.now() - lastTouchToggleRef.current < 500) return;
    toggleZoom();
  }, [toggleZoom]);

  const zoomed = zoom.scale > PREVIEW_ZOOM_MIN;

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [goNext, goPrev, onClose]);

  return (
    <div className="relative flex h-[90vh] flex-col">
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar"
        className="absolute top-3 right-3 z-10 rounded-full bg-white/10 p-2 text-white backdrop-blur hover:bg-white/20"
      >
        <X className="h-5 w-5" />
      </button>
      {/* Controles de zoom: alternativa de teclado/un puntero a los gestos
          (WCAG 2.5.1), mismo patrón que el «Ver» del diseño. */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-1 rounded-full bg-white/10 px-1 py-1 text-white backdrop-blur">
        <button
          type="button"
          onClick={() => applyZoom(stepPreviewZoom(zoom.scale, -1), zoom.x, zoom.y)}
          disabled={zoom.scale <= PREVIEW_ZOOM_MIN}
          aria-label="Alejar la imagen"
          className="rounded-full p-2 hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ZoomOut className="h-4 w-4" aria-hidden />
        </button>
        <span className="w-11 text-center text-xs font-medium tabular-nums" aria-live="polite">
          {Math.round(zoom.scale * 100)}%
        </span>
        <button
          type="button"
          onClick={() => applyZoom(stepPreviewZoom(zoom.scale, 1), zoom.x, zoom.y)}
          disabled={zoom.scale >= PREVIEW_ZOOM_MAX}
          aria-label="Acercar la imagen"
          className="rounded-full p-2 hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ZoomIn className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={resetZoom}
          disabled={!zoomed}
          aria-label="Restablecer el zoom"
          className="rounded-full p-2 hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <RotateCcw className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {/* touch-none: los gestos (pinch/pan/doble tap) los manejan los pointer
          events de acá; sin esto el navegador secuestra el pinch. */}
      <div
        ref={viewerRef}
        className="relative flex-1 touch-none overflow-hidden select-none"
        style={{ cursor: zoomed ? (gesturing ? "grabbing" : "grab") : "zoom-in" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleDoubleClick}
      >
        {failed.has(images[activeIdx]) ? (
          <GalleryPlaceholder className="h-20 w-20 text-white/40" />
        ) : (
          <Image
            ref={imgRef}
            src={images[activeIdx]}
            alt={alt}
            fill
            sizes="100vw"
            draggable={false}
            className={
              "object-contain " + (gesturing ? "" : "transition-transform duration-150")
            }
            style={{ transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})` }}
            onError={() => onImageError(images[activeIdx])}
            priority
          />
        )}
      </div>
      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={onPrev}
            aria-label="Imagen anterior"
            className="absolute top-1/2 left-3 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white backdrop-blur hover:bg-white/20"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={onNext}
            aria-label="Imagen siguiente"
            className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white backdrop-blur hover:bg-white/20"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
          <div className="flex items-center justify-center gap-2 bg-black/50 px-3 py-2 text-white">
            <span className="text-xs tabular-nums">
              {activeIdx + 1} / {images.length}
            </span>
            <div className="ml-auto flex gap-1">
              {images.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => goTo(idx)}
                  aria-label={`Ir a imagen ${idx + 1}`}
                  className={
                    "h-1.5 rounded-full transition " +
                    (idx === activeIdx ? "w-6 bg-white" : "w-1.5 bg-white/40")
                  }
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
