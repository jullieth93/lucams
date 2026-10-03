"use client";

/*
 * Imagen de la ProductCard con fallback onError (T5).
 *
 * ProductCard es un Server Component y next/image exige Client Component para pasar onError
 * (Next 16: los props que reciben funciones solo se serializan en client components), así que
 * la imagen vive en este wrapper. Si la URL falla (404 hot-linked, objeto borrado del bucket),
 * cae al MISMO placeholder que ya se usa cuando el producto no tiene imágenes (Sparkles sobre
 * el gradiente de marca del contenedor) en vez de quedar como imagen rota — peor en móvil,
 * donde la card es lo primero que se ve en el PLP.
 */

import { useState } from "react";
import Image from "next/image";
import { Sparkles } from "lucide-react";

export function ProductCardImage({ src, outOfStock }: { src: string; outOfStock: boolean }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Sparkles className="text-brand-muted h-12 w-12" />
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt=""
      fill
      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
      loading="lazy"
      onError={() => setFailed(true)}
      className={`object-cover transition-transform duration-300 group-hover:scale-105 ${
        outOfStock ? "opacity-50 grayscale" : ""
      }`}
    />
  );
}
