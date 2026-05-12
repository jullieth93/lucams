/*
 * Carousel de productos destacados — Embla con autoplay.
 *
 * Pausa en hover. Dots + arrows kawaii. Responsive (2/3/4 slides
 * visibles según ancho).
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ProductCard } from "@/components/product-card";
import type { StorefrontProductCard } from "@/features/products/public-service";

export function FeaturedCarousel({ products }: { products: StorefrontProductCard[] }) {
  const [emblaRef, emblaApi] = useEmblaCarousel(
    {
      loop: true,
      align: "start",
      slidesToScroll: 1,
      containScroll: "trimSnaps",
    },
    [Autoplay({ delay: 5000, stopOnInteraction: false, stopOnMouseEnter: true })],
  );
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [scrollSnaps, setScrollSnaps] = useState<number[]>([]);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);
  const scrollTo = useCallback((i: number) => emblaApi?.scrollTo(i), [emblaApi]);

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

      <div className="mt-4 flex justify-center gap-1.5">
        {scrollSnaps.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => scrollTo(i)}
            aria-label={`Ir al producto ${i + 1}`}
            className={
              "h-2 rounded-full transition-all " +
              (i === selectedIdx ? "bg-brand-purple w-6" : "bg-brand-purple/30 w-2")
            }
          />
        ))}
      </div>
    </div>
  );
}
