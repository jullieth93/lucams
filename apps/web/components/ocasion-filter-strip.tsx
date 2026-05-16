/*
 * <OcasionFilterStrip /> — Chips horizontales para filtrar por ocasión.
 *
 * PLAN_CATALOG_V2 1.5 + 6.8. Filtro mutually exclusive (uno a la vez).
 * Click toggle: si ya está seleccionada, la quita.
 */

"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import type { OcasionData } from "@/lib/catalog";

export function OcasionFilterStrip({ ocasiones }: { ocasiones: OcasionData[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const selected = sp.get("ocasion");

  function toggleOcasion(slug: string) {
    const params = new URLSearchParams(sp.toString());
    if (params.get("ocasion") === slug) {
      params.delete("ocasion");
    } else {
      params.set("ocasion", slug);
    }
    router.push(`/productos?${params.toString()}`);
  }

  if (ocasiones.length === 0) return null;

  return (
    <div className="mb-5">
      <div className="text-brand-purple-dark/60 mb-2 text-xs font-bold tracking-wider uppercase">
        Ocasión
      </div>
      {/* Mobile/tablet: scroll horizontal con fade en bordes. Desktop lg+: wrap a 2 líneas. */}
      <div className="relative">
        <div className="flex flex-nowrap gap-1.5 overflow-x-auto pb-2 lg:flex-wrap lg:overflow-x-visible lg:pb-0">
          {ocasiones.map((o) => {
            const isActive = selected === o.slug;
            return (
              <button
                key={o.slug}
                onClick={() => toggleOcasion(o.slug)}
                className={`flex-shrink-0 rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? "bg-brand-purple text-white"
                    : "border-brand-purple/25 text-brand-purple-dark hover:bg-brand-purple/10 border bg-white"
                }`}
              >
                {isActive && <X className="mr-1 inline h-3 w-3" />}
                {o.name}
              </button>
            );
          })}
        </div>
        {/* Fade gradient en mobile/tablet para indicar que hay más scroll. */}
        <div className="from-brand-cream pointer-events-none absolute top-0 right-0 h-full w-8 bg-gradient-to-l to-transparent lg:hidden" />
      </div>
    </div>
  );
}
