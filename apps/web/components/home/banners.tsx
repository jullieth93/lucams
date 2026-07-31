/*
 * <HomeBanners> — franja de banners/promos de la portada (roadmap B6).
 *
 * Los items llegan ya resueltos del CMS (`getCmsBanners` en lib/cms.ts):
 * imagen de la mediateca + título + enlace, solo los activos. Con 0 items la
 * sección NO se renderiza (la home queda como antes de B6 — regla de oro).
 *
 * Presentación: con varios banners, tira horizontal con scroll-snap (el borde
 * del siguiente asoma como pista de scroll; sin librería de carrusel — el
 * contenido lo maneja Lucy desde /admin/contenido, no hay autoplay que
 * mantener). Con un solo banner ocupa todo el ancho.
 */

import Image from "next/image";
import Link from "next/link";
import type { CmsBannerItem } from "@/lib/cms";

export function HomeBanners({ items }: { items: CmsBannerItem[] }) {
  if (items.length === 0) return null;
  const single = items.length === 1;

  return (
    <section aria-label="Promociones" className="mx-auto max-w-6xl px-6 pt-8 sm:px-10 sm:pt-10">
      <ul className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2">
        {items.map((b) => (
          <li
            key={`${b.url}-${b.titulo}`}
            className={
              single
                ? "w-full shrink-0 snap-center"
                : "w-[85%] shrink-0 snap-center sm:w-[62%] lg:w-[48%]"
            }
          >
            <Link
              href={b.enlace}
              className="ring-brand-purple/10 group relative block overflow-hidden rounded-2xl shadow-sm ring-1 transition hover:shadow-md"
            >
              <Image
                src={b.url}
                alt={b.alt}
                width={b.width}
                height={b.height}
                sizes={
                  single
                    ? "(max-width: 1152px) 100vw, 1152px"
                    : "(max-width: 640px) 85vw, (max-width: 1024px) 62vw, 550px"
                }
                className="h-auto w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              />
              <span className="from-brand-purple-dark/80 via-brand-purple-dark/40 absolute inset-x-0 bottom-0 bg-gradient-to-t to-transparent px-4 pt-8 pb-3 text-sm font-semibold text-white">
                {b.titulo}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
