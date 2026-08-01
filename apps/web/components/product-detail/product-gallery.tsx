"use client";

/*
 * <ProductGallery> — galería del PDP con lightbox.
 *
 * - Hero image grande aspect-square con zoom CSS hover (scale 1.05)
 * - Hasta 5 thumbnails horizontales debajo, click cambia el hero
 * - Click sobre hero abre Dialog fullscreen con navegación ←/→ y Esc
 * - Empty state: gradient brand + ícono Sparkles
 *
 * Props mínimas — el page server-side ya seleccionó las imágenes.
 */

import { useEffect, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Sparkles, X, ZoomIn } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

export function ProductGallery({ images, alt }: { images: string[]; alt: string }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

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
          <Image
            src={activeImage}
            alt={alt}
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            priority
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
          <div className="absolute right-2 bottom-2 rounded-full bg-white/90 p-2 opacity-0 shadow-md transition-opacity group-hover:opacity-100">
            <ZoomIn className="text-brand-purple-dark h-4 w-4" />
          </div>
        </button>
        {images.length > 1 && (
          <div className="grid grid-cols-5 gap-2">
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
                <Image
                  src={img}
                  alt={`${alt} — vista ${idx + 1}`}
                  fill
                  sizes="(max-width: 768px) 20vw, 10vw"
                  className="object-cover"
                />
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
  onChange,
  onClose,
  onNext,
  onPrev,
}: {
  images: string[];
  alt: string;
  activeIdx: number;
  onChange: (i: number) => void;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
}) {
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") onPrev();
      else if (e.key === "ArrowRight") onNext();
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [onNext, onPrev, onClose]);

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
      <div className="relative flex-1">
        <Image
          src={images[activeIdx]}
          alt={alt}
          fill
          sizes="100vw"
          className="object-contain"
          priority
        />
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
                  onClick={() => onChange(idx)}
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
