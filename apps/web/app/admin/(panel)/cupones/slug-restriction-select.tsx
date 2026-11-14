"use client";

/*
 * Multi-select con chips para las restricciones de cupón por categoría/producto.
 *
 * Las opciones provienen del servidor (categorías y productos reales del catálogo),
 * evitando errores de digitación en slugs. Soporta `disabled` para vistas de
 * solo lectura (cupones archivados o roles analíticos).
 */

import { useState } from "react";
import { X } from "lucide-react";

export type SlugOption = { slug: string; name: string };

export function SlugRestrictionSelect({
  name,
  options,
  initialSelected = [],
  placeholder = "Buscar para agregar…",
  disabled = false,
}: {
  name: string;
  options: SlugOption[];
  initialSelected?: string[];
  placeholder?: string;
  disabled?: boolean;
}) {
  const [selected, setSelected] = useState<string[]>(initialSelected);
  const [search, setSearch] = useState("");

  const knownSlugs = new Set(options.map((o) => o.slug));
  const optionNameBySlug = new Map(options.map((o) => [o.slug, o.name]));
  const available = options.filter((o) => !selected.includes(o.slug));
  const q = search.trim().toLowerCase();
  const filtered = q
    ? available.filter((o) => o.name.toLowerCase().includes(q) || o.slug.toLowerCase().includes(q))
    : available;

  const add = (slug: string) => {
    if (disabled) return;
    setSelected((s) => [...s, slug]);
    setSearch("");
  };
  const remove = (slug: string) => {
    if (disabled) return;
    setSelected((s) => s.filter((x) => x !== slug));
  };

  return (
    <div className="border-brand-purple/20 rounded-lg border bg-white p-2.5">
      <input type="hidden" name={name} value={selected.join(",")} />

      {selected.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selected.map((slug) => (
            <span
              key={slug}
              className="bg-brand-purple/10 text-brand-purple-dark inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
            >
              <span>{optionNameBySlug.get(slug) ?? slug}</span>
              <code className="text-brand-muted font-mono text-[10px]">{slug}</code>
              {!knownSlugs.has(slug) && (
                <span className="font-semibold text-amber-700">(ya no existe)</span>
              )}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => remove(slug)}
                  aria-label={`Quitar ${slug}`}
                  className="text-brand-muted hover:text-rose-600"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      ) : disabled ? (
        <p className="text-brand-muted text-xs">Sin restricción (aplica a todo el catálogo).</p>
      ) : null}

      {!disabled && (
        <>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={placeholder}
            className="border-brand-purple/15 focus:border-brand-purple focus:ring-brand-purple/20 w-full rounded-md border px-2.5 py-1.5 text-xs focus:ring-2 focus:outline-none"
          />

          <div className="mt-1.5 max-h-40 space-y-0.5 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-brand-muted px-1 py-1 text-xs">
                {q ? "Ninguna opción coincide con tu búsqueda." : "No quedan opciones por agregar."}
              </p>
            ) : (
              filtered.slice(0, 30).map((o) => (
                <button
                  key={o.slug}
                  type="button"
                  onClick={() => add(o.slug)}
                  className="hover:bg-brand-purple/5 flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-xs transition-colors"
                >
                  <span className="text-brand-purple-dark font-medium">{o.name}</span>
                  <span className="text-brand-muted font-mono text-[10px]">{o.slug}</span>
                </button>
              ))
            )}
            {filtered.length > 30 && (
              <p className="text-brand-muted px-2 py-1 text-[10px]">
                +{filtered.length - 30} más — refina la búsqueda
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
