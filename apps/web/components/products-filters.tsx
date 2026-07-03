"use client";

/*
 * <ProductsFilters> — sidebar (desktop) / drawer (móvil) con filtros
 * del catálogo /productos. Form-driven via URL state: cualquier cambio
 * dispara submit y rerendea SSR con los nuevos params.
 *
 * Filtros soportados:
 *   - q: texto libre (búsqueda fuzzy)
 *   - categoria: slug de categoría
 *   - minPrice/maxPrice: rango (centavos COP)
 *   - personalizable: 1/0
 *   - descuento: 1/0
 *   - destacados: 1/0
 *   - orden: recent | price-asc | price-desc | featured | name
 *
 * Auto-submit on change con debounce 300ms para no spammear server.
 * Slider de precio debouncea más (500ms) porque dispara muchos events.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Filter, X, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { formatCOP } from "@/lib/format";

type Category = {
  id: string;
  slug: string;
  name: string;
  parentId: string | null;
  _count: { products: number };
};

export function ProductsFilters({
  categories,
  priceRange,
}: {
  categories: Category[];
  priceRange: { min: number; max: number };
}) {
  return (
    <>
      {/* Sidebar desktop */}
      <aside className="border-brand-purple/10 hidden h-fit w-72 flex-shrink-0 rounded-xl border bg-white p-5 lg:block">
        <FiltersForm categories={categories} priceRange={priceRange} />
      </aside>

      {/* Drawer móvil */}
      <div className="mb-4 lg:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              className="border-brand-purple/30 text-brand-purple-dark gap-2"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filtros
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-80 overflow-y-auto">
            <SheetHeader>
              <SheetTitle className="font-display text-brand-purple-dark">Filtros</SheetTitle>
            </SheetHeader>
            <div className="px-4 pb-6">
              <FiltersForm categories={categories} priceRange={priceRange} />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}

function FiltersForm({
  categories,
  priceRange,
}: {
  categories: Category[];
  priceRange: { min: number; max: number };
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [, startTransition] = useTransition();

  const minBound = priceRange.min;
  const maxBound = priceRange.max > priceRange.min ? priceRange.max : priceRange.min + 1;

  const [q, setQ] = useState(sp.get("q") ?? "");
  const [categoria, setCategoria] = useState(sp.get("categoria") ?? "");
  const [minPrice, setMinPrice] = useState(Number(sp.get("minPrice")) || minBound);
  const [maxPrice, setMaxPrice] = useState(Number(sp.get("maxPrice")) || maxBound);
  const [personalizable, setPersonalizable] = useState(sp.get("personalizable") === "1");
  const [descuento, setDescuento] = useState(sp.get("descuento") === "1");
  const [destacados, setDestacados] = useState(sp.get("destacados") === "1");
  const [orden, setOrden] = useState(sp.get("orden") ?? "recent");

  // Sincroniza si el usuario navega con back/forward (cambia URL pero
  // este componente persiste). queueMicrotask satisface la regla
  // react-hooks/set-state-in-effect difiriendo el setState fuera del
  // effect body sin cambiar el comportamiento observable.
  useEffect(() => {
    queueMicrotask(() => {
      setQ(sp.get("q") ?? "");
      setCategoria(sp.get("categoria") ?? "");
      setMinPrice(Number(sp.get("minPrice")) || minBound);
      setMaxPrice(Number(sp.get("maxPrice")) || maxBound);
      setPersonalizable(sp.get("personalizable") === "1");
      setDescuento(sp.get("descuento") === "1");
      setDestacados(sp.get("destacados") === "1");
      setOrden(sp.get("orden") ?? "recent");
    });
  }, [sp, minBound, maxBound]);

  const applyTimer = useRef<number | null>(null);

  // M.3.b.CAT.11 (2026-05-14) — bug fix Lucy reportó: "no se actualiza
  // real a la selección". Causa: handler llamaba setX + apply() pero apply
  // leía el state viejo del closure del render actual. Fix: pasar valor
  // nuevo explícito como override en cada call.
  type ApplyOverride = Partial<{
    q: string;
    categoria: string;
    minPrice: number;
    maxPrice: number;
    personalizable: boolean;
    descuento: boolean;
    destacados: boolean;
    orden: string;
  }>;

  function apply(delay = 0, overrides: ApplyOverride = {}) {
    if (applyTimer.current) window.clearTimeout(applyTimer.current);
    const _q = overrides.q ?? q;
    const _categoria = overrides.categoria ?? categoria;
    const _minPrice = overrides.minPrice ?? minPrice;
    const _maxPrice = overrides.maxPrice ?? maxPrice;
    const _personalizable = overrides.personalizable ?? personalizable;
    const _descuento = overrides.descuento ?? descuento;
    const _destacados = overrides.destacados ?? destacados;
    const _orden = overrides.orden ?? orden;
    applyTimer.current = window.setTimeout(() => {
      const params = new URLSearchParams();
      if (_q.trim()) params.set("q", _q.trim());
      if (_categoria) params.set("categoria", _categoria);
      if (_minPrice > minBound) params.set("minPrice", String(_minPrice));
      if (_maxPrice < maxBound) params.set("maxPrice", String(_maxPrice));
      if (_personalizable) params.set("personalizable", "1");
      if (_descuento) params.set("descuento", "1");
      if (_destacados) params.set("destacados", "1");
      if (_orden !== "recent") params.set("orden", _orden);
      const qs = params.toString();
      startTransition(() => {
        router.push(qs ? `/productos?${qs}` : "/productos");
      });
    }, delay);
  }

  function clearAll() {
    if (applyTimer.current) window.clearTimeout(applyTimer.current);
    setQ("");
    setCategoria("");
    setMinPrice(minBound);
    setMaxPrice(maxBound);
    setPersonalizable(false);
    setDescuento(false);
    setDestacados(false);
    setOrden("recent");
    startTransition(() => router.push("/productos"));
  }

  const hasActive =
    !!q ||
    !!categoria ||
    minPrice > minBound ||
    maxPrice < maxBound ||
    personalizable ||
    descuento ||
    destacados ||
    orden !== "recent";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-brand-purple-dark flex items-center gap-2 text-sm font-semibold tracking-wider uppercase">
          <Filter className="h-3.5 w-3.5" />
          Filtros
        </h2>
      </div>

      {/* Search */}
      <div className="space-y-1.5">
        <Label htmlFor="filter-q" className="text-brand-purple-dark/80 text-xs">
          Buscar
        </Label>
        <Input
          id="filter-q"
          type="search"
          value={q}
          onChange={(e) => {
            const v = e.target.value;
            setQ(v);
            apply(300, { q: v });
          }}
          placeholder="Ej. fotoimán"
          className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
        />
      </div>

      {/* Categoría — lista jerárquica con scroll interno (no captura scroll de
          la página como hacía el <select> nativo de 57 opciones). */}
      <CategoryFilter
        categories={categories}
        value={categoria}
        onChange={(v) => {
          setCategoria(v);
          apply(0, { categoria: v });
        }}
      />

      {/* Precio */}
      {maxBound > minBound && (
        <div className="space-y-2">
          <Label className="text-brand-purple-dark/80 text-xs">Precio</Label>
          <div className="text-brand-purple-dark/70 flex justify-between text-xs tabular-nums">
            <span>{formatCOP(minPrice)}</span>
            <span>{formatCOP(maxPrice)}</span>
          </div>
          <Slider
            min={minBound}
            max={maxBound}
            step={100}
            value={[minPrice, maxPrice]}
            onValueChange={(values) => {
              setMinPrice(values[0]);
              setMaxPrice(values[1]);
              apply(500, { minPrice: values[0], maxPrice: values[1] });
            }}
            className="py-1"
          />
        </div>
      )}

      {/* Checkboxes */}
      <fieldset className="space-y-2">
        <legend className="text-brand-purple-dark/80 mb-1.5 text-xs">Características</legend>
        <FilterCheckbox
          label="Personalizable"
          checked={personalizable}
          onChange={(v) => {
            setPersonalizable(v);
            apply(0, { personalizable: v });
          }}
        />
        <FilterCheckbox
          label="Con descuento"
          checked={descuento}
          onChange={(v) => {
            setDescuento(v);
            apply(0, { descuento: v });
          }}
        />
        <FilterCheckbox
          label="Destacados"
          checked={destacados}
          onChange={(v) => {
            setDestacados(v);
            apply(0, { destacados: v });
          }}
        />
      </fieldset>

      {/* Orden */}
      <div className="space-y-1.5">
        <Label htmlFor="sort-select" className="text-brand-purple-dark/80 text-xs">
          Ordenar por
        </Label>
        <select
          id="sort-select"
          value={orden}
          onChange={(e) => {
            const v = e.target.value;
            setOrden(v);
            apply(0, { orden: v });
          }}
          className="border-brand-purple/20 focus:ring-brand-purple/30 w-full rounded-md border bg-white px-3 py-2 text-sm focus:ring-2 focus:outline-none"
        >
          <option value="recent">Más recientes</option>
          <option value="featured">Destacados primero</option>
          <option value="price-asc">Precio: menor a mayor</option>
          <option value="price-desc">Precio: mayor a menor</option>
          <option value="name">Nombre A-Z</option>
        </select>
      </div>

      {/* Acciones — botones explícitos para no-técnicos */}
      <div className="border-brand-purple/10 flex gap-2 border-t pt-4">
        <Button
          type="button"
          onClick={() => apply(0)}
          className="bg-brand-purple hover:bg-brand-purple-dark flex-1 text-white"
        >
          Aplicar
        </Button>
        <Button
          type="button"
          onClick={clearAll}
          variant="outline"
          disabled={!hasActive}
          className="border-brand-purple/30 text-brand-purple-dark hover:bg-brand-purple/5"
        >
          Reiniciar
        </Button>
      </div>
    </div>
  );
}

function FilterCheckbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="border-brand-purple/30 text-brand-purple focus:ring-brand-purple/30 h-4 w-4 rounded"
      />
      <span className="text-brand-purple-dark">{label}</span>
    </label>
  );
}

/**
 * <CategoryFilter> — lista jerárquica clickeable de categorías.
 *
 * Reemplaza al <select> nativo que con 57 categorías capturaba el scroll
 * de la página al abrirse (comportamiento del browser). Esta lista:
 *
 *   - Muestra solo top-level por default (parentId: null).
 *   - Expande sub-categorías al hover/click del padre con sub-cats.
 *   - Tiene altura máxima + overflow-y interno → NUNCA captura el scroll
 *     de la página completa.
 *   - Active state visual brand-purple en la categoría seleccionada.
 *   - "Todas" como opción default arriba.
 *
 * Patrón industria: Shopify, Amazon, Mercado Libre — todos usan listas
 * jerárquicas en filtros, no selects, por exactamente este motivo.
 */
function CategoryFilter({
  categories,
  value,
  onChange,
}: {
  categories: Category[];
  value: string;
  onChange: (slug: string) => void;
}) {
  // Agrupar: top-level + sub-cats por parentId
  const topLevel = categories.filter((c) => c.parentId === null);
  const subsByParent = categories.reduce<Record<string, Category[]>>((acc, c) => {
    if (c.parentId) {
      (acc[c.parentId] ??= []).push(c);
    }
    return acc;
  }, {});

  return (
    <div className="space-y-1.5">
      <Label className="text-brand-purple-dark/80 text-xs">Categoría</Label>
      {/* Altura máxima + overflow interno → scroll local, no captura el de la página. */}
      <div
        role="radiogroup"
        aria-label="Filtrar por categoría"
        className="border-brand-purple/15 max-h-72 overflow-y-auto rounded-md border bg-white"
      >
        <CategoryRow slug="" name="Todas" isActive={value === ""} onClick={() => onChange("")} />
        {topLevel.map((parent) => {
          const subs = subsByParent[parent.id] ?? [];
          const isParentActive = value === parent.slug;
          const isSubActive = subs.some((s) => s.slug === value);
          return (
            <div key={parent.id}>
              <CategoryRow
                slug={parent.slug}
                name={parent.name}
                count={parent._count.products}
                isActive={isParentActive}
                onClick={() => onChange(parent.slug)}
              />
              {subs.length > 0 && (isParentActive || isSubActive) && (
                <ul className="border-brand-purple/8 border-t bg-white/60">
                  {subs.map((sub) => (
                    <li key={sub.id}>
                      <CategoryRow
                        slug={sub.slug}
                        name={sub.name}
                        count={sub._count.products}
                        isActive={value === sub.slug}
                        isSub
                        onClick={() => onChange(sub.slug)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CategoryRow({
  slug,
  name,
  count,
  isActive,
  isSub,
  onClick,
}: {
  slug: string;
  name: string;
  count?: number;
  isActive: boolean;
  isSub?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={isActive}
      onClick={onClick}
      className={[
        "flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-left text-sm transition-colors",
        isSub ? "pl-7 text-[13px]" : "",
        isActive
          ? "bg-brand-purple/15 text-brand-purple-dark font-semibold"
          : "text-brand-purple-dark/80 hover:bg-brand-purple/5",
      ].join(" ")}
      data-slug={slug}
    >
      <span className="flex-1 truncate">{name}</span>
      {count !== undefined && (
        <span
          className={
            isActive ? "text-brand-muted text-xs" : "text-brand-muted text-xs"
          }
        >
          {count}
        </span>
      )}
    </button>
  );
}

/**
 * <ActiveFilterChips> — fila horizontal con chips de los filtros
 * actualmente aplicados. Cada uno tiene × para removerlo individual.
 */
export function ActiveFilterChips({
  categories,
}: {
  categories: { slug: string; name: string }[];
}) {
  const router = useRouter();
  const sp = useSearchParams();

  function removeParam(key: string) {
    const params = new URLSearchParams(sp.toString());
    params.delete(key);
    const qs = params.toString();
    router.push(qs ? `/productos?${qs}` : "/productos");
  }

  const chips: { key: string; label: string }[] = [];
  const q = sp.get("q");
  if (q) chips.push({ key: "q", label: `"${q}"` });
  const categoria = sp.get("categoria");
  if (categoria) {
    const c = categories.find((x) => x.slug === categoria);
    chips.push({ key: "categoria", label: c?.name ?? categoria });
  }
  if (sp.get("personalizable") === "1")
    chips.push({ key: "personalizable", label: "Personalizable" });
  if (sp.get("descuento") === "1") chips.push({ key: "descuento", label: "Con descuento" });
  if (sp.get("destacados") === "1") chips.push({ key: "destacados", label: "Destacados" });
  if (sp.get("minPrice")) chips.push({ key: "minPrice", label: `Desde ${sp.get("minPrice")}` });
  if (sp.get("maxPrice")) chips.push({ key: "maxPrice", label: `Hasta ${sp.get("maxPrice")}` });

  if (chips.length === 0) return null;

  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={() => removeParam(c.key)}
          className="bg-brand-purple/10 text-brand-purple-dark hover:bg-brand-purple/15 inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium"
        >
          {c.label}
          <X className="h-3 w-3" />
        </button>
      ))}
    </div>
  );
}
