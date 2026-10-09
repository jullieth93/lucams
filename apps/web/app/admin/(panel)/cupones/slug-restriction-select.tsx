"use client";

/*
 * Multi-select con chips para las restricciones de cupón por categoría/producto.
 *
 * Reemplaza los inputs de "slugs separados por coma" (un slug mal digitado
 * fallaba en SILENCIO en redemption.ts — el cupón simplemente nunca aplicaba).
 * Las opciones vienen del server (categorías/productos reales del catálogo),
 * así que ya no se puede escribir un slug inexistente.
 *
 * El valor se sigue serializando como slugs separados por coma en un hidden
 * input: parsePayload (actions.ts) y los schemas de features/coupons no cambian.
 *
 * Patrón tomado de product-ocasion-linker.tsx (búsqueda + lista clicleable).
 */

import { useState } from "react";
import { X } from "lucide-react";

export type SlugOption = { slug: string; name: string };

export function SlugRestrictionSelect({
  name,
  options,
  initialSelected = [],
  placeholder = "Buscar para agregar…",
}: {
  name: string;
  options: SlugOption[];
  /** Slugs ya guardados (edición). Pueden incluir slugs que ya no existen
   *  en el catálogo: se muestran como chips removibles pero no re-agregables. */
  initialSelected?: string[];
  placeholder?: string;
}) {
  const [selected, setSelected] = useState<string[]>(initialSelected);
  const [search, setSearch] = useState("");

  const knownSlugs = new Set(options.map((o) => o.slug));
  const available = options.filter((o) => !selected.includes(o.slug));
  const q = search.trim().toLowerCase();
  const filtered = q
    ? available.filter((o) => o.name.toLowerCase().includes(q) || o.slug.toLowerCase().includes(q))
    : available;

  const add = (slug: string) => {
    setSelected((s) => [...s, slug]);
    setSearch("");
  };
  const remove = (slug: string) => setSelected((s) => s.filter((x) => x !== slug));

  return (
    <div className="rounded border border-slate-300 bg-white p-2">
      {/* parsePayload hace split(",")+trim sobre este valor — sin cambios server. */}
      <input type="hidden" name={name} value={selected.join(",")} />

      {selected.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selected.map((slug) => (
            <span
              key={slug}
              className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-800"
            >
              <span className="font-mono">{slug}</span>
              {!knownSlugs.has(slug) && (
                <span className="font-semibold text-amber-700">(ya no existe — quítalo)</span>
              )}
              <button
                type="button"
                onClick={() => remove(slug)}
                aria-label={`Quitar ${slug}`}
                className="text-slate-500 hover:text-rose-600"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
      />

      <div className="mt-1 max-h-40 space-y-0.5 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-1 py-1 text-xs text-slate-500">
            {q ? "Ninguna opción coincide con la búsqueda." : "No quedan opciones por agregar."}
          </p>
        ) : (
          filtered.slice(0, 30).map((o) => (
            <button
              key={o.slug}
              type="button"
              onClick={() => add(o.slug)}
              className="flex w-full items-center justify-between gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-slate-50"
            >
              <span className="text-slate-800">{o.name}</span>
              <span className="font-mono text-[10px] text-slate-500">{o.slug}</span>
            </button>
          ))
        )}
        {filtered.length > 30 && (
          <p className="px-1 py-1 text-[10px] text-slate-500">
            +{filtered.length - 30} más — refina la búsqueda
          </p>
        )}
      </div>
    </div>
  );
}
