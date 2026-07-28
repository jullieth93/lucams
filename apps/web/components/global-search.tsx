/*
 * <GlobalSearch /> — palette Cmd+K / Ctrl+K en el header.
 *
 * Abre al hacer click en el icono Search o cuando el usuario tipea
 * Cmd+K (Mac) / Ctrl+K (Windows/Linux). Busca productos en server-side
 * via pg_trgm fuzzy con debounce de 200ms.
 *
 * Server action: searchProducts(q) en features/products/public-service.
 */

"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Sparkles } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { LucamsLogo } from "@/components/lucams-logo";
import { formatCOP } from "@/lib/format";
import type { SearchResult } from "@/features/products/public-service";
import { searchProductsAction } from "@/app/actions/search";

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Atajo Cmd+K / Ctrl+K abre el modal.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Search con debounce 200ms. El setResults va dentro del setTimeout
  // (callback async) — eso satisface react-hooks/set-state-in-effect
  // que solo prohibe setState SÍNCRONO dentro del body del effect.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    debounceRef.current = setTimeout(() => {
      if (trimmed.length < 2) {
        setResults([]);
        return;
      }
      startTransition(async () => {
        const r = await searchProductsAction(trimmed);
        setResults(r);
      });
    }, 120);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const onSelect = (slug: string) => {
    setOpen(false);
    setQuery("");
    router.push(`/producto/${slug}`);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Buscar"
        className="text-brand-purple-dark hover:text-brand-purple hover:bg-brand-purple/5 inline-flex items-center gap-1 rounded-md px-2 py-1.5 transition-colors"
      >
        {/* Icono de marca en el trigger de búsqueda (Lucams mapache). */}
        <LucamsLogo variant="mascot" size={20} aria-hidden="true" />
        <span className="hidden text-xs sm:inline">Buscar</span>
        <kbd className="border-brand-purple/20 text-brand-muted hidden rounded border px-1.5 py-0.5 text-[10px] sm:inline">
          ⌘K
        </kbd>
      </button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Buscar productos"
        description="Escribe parte del nombre o SKU"
      >
        <div className="border-brand-purple/10 bg-brand-purple/5 flex flex-col items-center border-b py-3">
          <LucamsLogo variant="mascot" size={48} aria-hidden="true" />
          <p className="text-brand-purple-dark mt-1 text-xs font-semibold">Buscar en Lucams</p>
        </div>
        <CommandInput placeholder="Buscar productos..." value={query} onValueChange={setQuery} />
        <CommandList>
          {query.trim().length >= 2 && results.length === 0 ? (
            <CommandEmpty>
              <div className="flex flex-col items-center gap-2 py-4">
                <Sparkles className="text-brand-muted h-6 w-6" />
                <span>Nada por aquí — prueba con otra palabra.</span>
              </div>
            </CommandEmpty>
          ) : (
            <CommandGroup
              heading={
                !query.trim()
                  ? "Empieza a escribir..."
                  : results[0]?.isSuggestion
                    ? "¿Querías decir...?"
                    : "Resultados"
              }
            >
              {results.map((p) => (
                <CommandItem
                  key={p.id}
                  value={`${p.name} ${p.slug}`}
                  onSelect={() => onSelect(p.slug)}
                  className="!py-2"
                >
                  <div className="bg-brand-cream relative h-10 w-10 shrink-0 overflow-hidden rounded">
                    {p.images.length > 0 && (
                      <Image src={p.images[0]} alt="" fill sizes="40px" className="object-cover" />
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="text-brand-purple-dark truncate text-sm font-medium">
                      {p.name}
                    </span>
                    <span className="text-brand-muted truncate text-xs">{p.category.name}</span>
                  </div>
                  <span className="text-brand-purple-dark text-sm font-bold tabular-nums">
                    {formatCOP(p.basePrice)}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
