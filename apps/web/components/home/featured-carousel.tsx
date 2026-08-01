/*
 * Carousel de productos destacados — Embla con autoplay.
 *
 * Pausa en hover + botón pausa/play visible (WCAG 2.2.2). Con
 * prefers-reduced-motion el autoplay NO se inicializa. Dots con área
 * táctil ≥ 24×24 (WCAG 2.5.8) + arrows kawaii. Responsive (2/3/4
 * slides visibles según ancho).
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { ProductCard } from "@/components/product-card";
import { usePrefersReducedMotion } from "@/app/estudio/[slug]/use-prefers-reduced-motion";
import type { StorefrontProductCard } from "@/features/products/public-service";

export function FeaturedCarousel({ products }: { products: StorefrontProductCard[] }) {
  // WCAG 2.2.2 / 2.3.3 — si el sistema pide "reducir movimiento", el plugin de
  // autoplay ni siquiera se registra: el carrusel queda estático (hook del Estudio, #16).
  const prefersReducedMotion = usePrefersReducedMotion();
  const [emblaRef, emblaApi] = useEmblaCarousel(
    {
      loop: true,
      align: "start",
      slidesToScroll: 1,
      containScroll: "trimSnaps",
    },
    prefersReducedMotion
      ? []
      : [Autoplay({ delay: 5000, stopOnInteraction: false, stopOnMouseEnter: true })],
  );
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [scrollSnaps, setScrollSnaps] = useState<number[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);
  const scrollTo = useCallback((i: number) => emblaApi?.scrollTo(i), [emblaApi]);
  // WCAG 2.2.2 — control visible para pausar/reanudar el movimiento automático.
  const toggleAutoplay = useCallback(() => {
    const autoplay = emblaApi?.plugins().autoplay;
    if (!autoplay) return;
    if (autoplay.isPlaying()) autoplay.stop();
    else autoplay.play();
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => {
      setSelectedIdx(emblaApi.selectedScrollSnap());
      setScrollSnaps(emblaApi.scrollSnapList());
    };
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    // Trigger inicial vía microtask para evitar setState dentro del effect body.
    queueMicrotask(onSelect);
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi]);

  // El estado del botón pausa/play sigue al plugin vía sus eventos — así también
  // refleja la pausa por hover de stopOnMouseEnter.
  useEffect(() => {
    if (!emblaApi) return;
    const autoplay = emblaApi.plugins().autoplay;
    if (!autoplay) return;
    const onPlay = () => setIsPlaying(true);
    const onStop = () => setIsPlaying(false);
    emblaApi.on("autoplay:play", onPlay);
    emblaApi.on("autoplay:stop", onStop);
    queueMicrotask(() => setIsPlaying(autoplay.isPlaying()));
    return () => {
      emblaApi.off("autoplay:play", onPlay);
      emblaApi.off("autoplay:stop", onStop);
    };
  }, [emblaApi, prefersReducedMotion]);

  if (products.length === 0) return null;

  return (
    <div className="relative">
      {/* Padding lateral en desktop para que las arrows queden fuera del slide area */}
      <div className="px-0 sm:px-12">
        <div className="overflow-hidden" ref={emblaRef}>
          <div className="flex gap-4">
            {products.map((p) => (
              <div
                key={p.id}
                className="min-w-0 shrink-0 grow-0 basis-1/2 sm:basis-1/3 lg:basis-1/4"
              >
                <ProductCard product={p} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={scrollPrev}
        aria-label="Anterior"
        className="bg-brand-purple/90 hover:bg-brand-purple absolute top-1/2 left-0 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-white shadow-lg transition-colors sm:flex"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={scrollNext}
        aria-label="Siguiente"
        className="bg-brand-purple/90 hover:bg-brand-purple absolute top-1/2 right-0 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-white shadow-lg transition-colors sm:flex"
      >
        <ChevronRight className="h-5 w-5" />
      </button>

      <div className="mt-4 flex items-center justify-center gap-1">
        {scrollSnaps.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => scrollTo(i)}
            aria-label={`Ir al producto ${i + 1}`}
            // Área táctil ≥ 24×24 (WCAG 2.5.8): el botón envuelve al dot visual; en
            // móvil los dots son la única navegación (las flechas son hidden sm:flex).
            className="flex h-6 w-6 items-center justify-center"
          >
            <span
              className={
                "h-2 rounded-full transition-all " +
                (i === selectedIdx ? "bg-brand-purple w-6" : "bg-brand-purple/30 w-2")
              }
            />
          </button>
        ))}
        {!prefersReducedMotion && (
          <button
            type="button"
            onClick={toggleAutoplay}
            aria-label={isPlaying ? "Pausar carrusel" : "Reproducir carrusel"}
            className="text-brand-purple hover:bg-brand-purple/10 ml-1 flex h-6 w-6 items-center justify-center rounded-full transition-colors"
          >
            {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
    </div>
  );
}
