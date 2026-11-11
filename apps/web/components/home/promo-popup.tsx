"use client";

/*
 * <PromoPopup> — ventana emergente de banners/promos al abrir la portada
 * (owner 2026-11-11: antes era una franja inline bajo el hero, roadmap B6; el
 * owner prefiere el formato emergente — más visibilidad para la campaña).
 *
 * Reglas:
 *   - Solo si hay al menos un banner ACTIVO en el CMS (`home.banners`); sin
 *     banners no se monta nada (regla de oro B6 intacta).
 *   - Se muestra UNA vez por sesión del navegador (sessionStorage): cerrarla
 *     (X, backdrop o ESC) la marca como vista hasta cerrar la pestaña.
 *   - Con varios banners activos: pager ‹ › + dots (mismo patrón del pager del
 *     lightbox de diseños); con uno, imagen a todo lo ancho.
 *   - La imagen completa enlaza al destino del banner (ruta interna o URL).
 *   - Radix Dialog: foco atrapado, cierre por ESC y backdrop (a11y gratis).
 */

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { CmsBannerItem } from "@/lib/cms";

/** Marca de "ya vista" por sesión de navegador (pestaña). */
const SEEN_KEY = "lucams-promo-popup-v1";

export function PromoPopup({ items }: { items: CmsBannerItem[] }) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (items.length === 0) return;
    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === "1";
    } catch {
      // sessionStorage bloqueado (modo estricto): mostrar igual — la promo
      // importa más que el recuerdo de la marca.
    }
    if (seen) return;
    // setTimeout (no setState síncrono en el efecto — regla react-hooks): la
    // ventana abre tras el primer paint, sin parpadeo ni renders en cascada.
    const t = window.setTimeout(() => setOpen(true), 400);
    return () => window.clearTimeout(t);
  }, [items.length]);

  if (items.length === 0) return null;
  const current = items[Math.min(index, items.length - 1)]!;
  const paged = items.length > 1;

  function close() {
    try {
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      // Sin storage no se persiste la marca; no pasa nada.
    }
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent aria-label={current.titulo} className="overflow-hidden p-0 sm:max-w-xl">
        <DialogTitle className="sr-only">{current.titulo}</DialogTitle>
        <Link
          href={current.enlace}
          onClick={close}
          className="focus-visible:ring-brand-turquoise group relative block focus-visible:ring-2 focus-visible:outline-none"
        >
          <Image
            src={current.url}
            alt={current.alt}
            width={current.width}
            height={current.height}
            sizes="(max-width: 640px) 100vw, 576px"
            className="h-auto w-full object-cover"
            priority
          />
          <span className="from-brand-purple-dark/80 via-brand-purple-dark/40 absolute inset-x-0 bottom-0 bg-gradient-to-t to-transparent px-4 pt-10 pb-4 text-base font-semibold text-white">
            {current.titulo}
          </span>
        </Link>
        {paged && (
          <div className="flex items-center justify-center gap-3 pb-3">
            <button
              type="button"
              onClick={() => setIndex((i) => (i - 1 + items.length) % items.length)}
              aria-label="Banner anterior"
              className="text-brand-purple hover:bg-brand-purple/10 focus-visible:ring-brand-turquoise inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            {items.map((b, k) => (
              <button
                key={`${b.url}-${k}`}
                type="button"
                aria-label={`Banner ${k + 1} de ${items.length}`}
                aria-current={k === index}
                onClick={() => setIndex(k)}
                className="focus-visible:ring-brand-turquoise inline-flex h-9 w-9 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:outline-none"
              >
                <span
                  aria-hidden
                  className={
                    k === index
                      ? "bg-brand-purple h-2 w-5 rounded-full transition-all"
                      : "bg-brand-purple/25 h-2 w-2 rounded-full transition-all"
                  }
                />
              </button>
            ))}
            <button
              type="button"
              onClick={() => setIndex((i) => (i + 1) % items.length)}
              aria-label="Banner siguiente"
              className="text-brand-purple hover:bg-brand-purple/10 focus-visible:ring-brand-turquoise inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
