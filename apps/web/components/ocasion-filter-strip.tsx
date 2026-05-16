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
    <div className="-mx-2 mb-5 overflow-x-auto px-2 pb-1">
      <div className="flex items-center gap-1.5">
        <span className="text-brand-purple-dark/60 mr-1 flex-shrink-0 text-xs font-bold tracking-wider uppercase">
          Ocasión:
        </span>
        {ocasiones.map((o) => {
          const isActive = selected === o.slug;
          return (
            <button
              key={o.slug}
              onClick={() => toggleOcasion(o.slug)}
              className={`flex-shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
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
    </div>
  );
}
