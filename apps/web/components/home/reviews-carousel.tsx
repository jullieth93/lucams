/*
 * Carousel de reseñas reales (featured).
 *
 * Usa Embla con autoplay lento. Si no hay reseñas, el padre renderea
 * empty state con mascote.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Star } from "lucide-react";
import type { StorefrontReview } from "@/features/reviews/public-service";

export function ReviewsCarousel({ reviews }: { reviews: StorefrontReview[] }) {
  const [emblaRef, emblaApi] = useEmblaCarousel(
    { loop: true, align: "start", containScroll: "trimSnaps" },
    [Autoplay({ delay: 7000, stopOnInteraction: false, stopOnMouseEnter: true })],
  );
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [snaps, setSnaps] = useState<number[]>([]);
  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => {
      setSelectedIdx(emblaApi.selectedScrollSnap());
      setSnaps(emblaApi.scrollSnapList());
    };
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    queueMicrotask(onSelect);
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi]);

  if (reviews.length === 0) return null;

  return (
    <div className="relative">
      <div className="px-0 sm:px-12">
        <div className="overflow-hidden" ref={emblaRef}>
          <div className="flex gap-4">
            {reviews.map((r) => (
              <div
                key={r.id}
                className="min-w-0 shrink-0 grow-0 basis-full sm:basis-1/2 lg:basis-1/3"
              >
                <ReviewCard review={r} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={scrollPrev}
        aria-label="Reseña anterior"
        className="bg-brand-purple/90 hover:bg-brand-purple absolute top-1/2 left-0 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-white shadow-lg transition-colors sm:flex"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={scrollNext}
        aria-label="Siguiente reseña"
        className="bg-brand-purple/90 hover:bg-brand-purple absolute top-1/2 right-0 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-white shadow-lg transition-colors sm:flex"
      >
        <ChevronRight className="h-5 w-5" />
      </button>

      <div className="mt-4 flex justify-center gap-1.5">
        {snaps.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => emblaApi?.scrollTo(i)}
            aria-label={`Ir a reseña ${i + 1}`}
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

function ReviewCard({ review }: { review: StorefrontReview }) {
  return (
    <article className="border-brand-purple/10 flex h-full flex-col rounded-xl border bg-white p-5">
      <div className="mb-3 flex items-center gap-0.5">
        {Array.from({ length: 5 }, (_, i) => (
          <Star
            key={i}
            className={
              "h-4 w-4 " +
              (i < review.rating
                ? "fill-brand-yellow text-brand-yellow"
                : "fill-brand-purple/10 text-brand-purple/20")
            }
          />
        ))}
      </div>
      <p className="text-brand-purple-dark/85 mb-4 line-clamp-5 text-sm leading-relaxed">
        “{review.comment}”
      </p>
      <div className="border-brand-purple/10 mt-auto border-t pt-3">
        <p className="text-brand-purple-dark text-sm font-semibold">
          {review.authorName ?? "Cliente Lucams"}
        </p>
        <p className="text-brand-muted text-xs">
          {review.authorCity ? `${review.authorCity} · ` : ""}
          <Link
            href={`/producto/${review.productSlug}`}
            className="text-brand-purple hover:underline"
          >
            {review.productName}
          </Link>
        </p>
      </div>
    </article>
  );
}
