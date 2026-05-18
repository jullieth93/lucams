"use client";

/*
 * VariantSelector — M.3.b.CAT.B reescrito 2026-05-18.
 *
 * Arquitectura: SINGLE SOURCE OF TRUTH = local state `selectedId`.
 *   - El selector controla su estado visual con `useState`.
 *   - La URL es UN SIDE-EFFECT (deep-link in / out), no source.
 *   - El click hace `setSelectedId(id)` INMEDIATO (urgent update) →
 *     React renderea el chip nuevo seleccionado en el siguiente paint.
 *   - Luego `router.replace(?variant=id)` en transition para que el
 *     Server Component padre re-renderee (precio header + link al
 *     Estudio + JSON-LD).
 *
 * Por qué este patrón:
 *   - El bug previo mezclaba `useState + useEffect(sync con URL) +
 *     useTransition`. React 19 agrupaba el setOptimisticId dentro de
 *     la transition → no había paint visible hasta los ~3s del RSC.
 *   - Con un solo source, no hay bucle de sync. Local state = lo
 *     que el cliente ve. Server state catches up async.
 *
 * Modo single-dim: lista vertical con price por variant.
 * Modo multi-dim: chips por dimensión + card de Precio prominente.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Check } from "lucide-react";
import { formatCOP } from "@/lib/format";
import {
  parseVariantAttributes,
  generateVariantLabel,
  type ProductVariantAttributes,
} from "@/features/products/variant-schemas";

type Variant = {
  id: string;
  name: string;
  sku: string;
  price: number | null;
  attributes: unknown;
};

type VariantSelectorProps = {
  productBasePrice: number;
  variants: Variant[];
};

const DIMENSION_LABELS: Record<string, string> = {
  quantity: "Cantidad",
  photoSlots: "Cantidad",
  sizeCm: "Tamaño",
  shape: "Forma",
  color: "Color",
  finish: "Acabado",
};

function formatDimensionValue(key: string, value: unknown): string {
  if (key === "quantity" || key === "photoSlots") return `${value} unidades`;
  if (key === "sizeCm") return `${value} cm`;
  if (key === "shape") {
    const labels: Record<string, string> = {
      rectangle: "Rectangular",
      circle: "Circular",
      heart: "Corazón",
      custom: "Custom",
    };
    return labels[String(value)] ?? String(value);
  }
  if (key === "finish") {
    const labels: Record<string, string> = {
      matte: "Mate",
      glossy: "Brillante",
      "soft-touch": "Soft-touch",
      glass: "Vidrio",
    };
    return labels[String(value)] ?? String(value);
  }
  return String(value);
}

const VISIBLE_DIMENSIONS: (keyof ProductVariantAttributes)[] = [
  "quantity",
  "photoSlots",
  "sizeCm",
  "shape",
  "color",
  "finish",
];

export function VariantSelector({ productBasePrice, variants: rawVariants }: VariantSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Filtrar la variant "Default" vacía si hay otras con attributes reales.
  const variants = useMemo(() => {
    const withAttrs = rawVariants.filter((v) => {
      const attrs = parseVariantAttributes(v.attributes);
      return Object.keys(attrs).length > 0;
    });
    return withAttrs.length > 0 ? withAttrs : rawVariants;
  }, [rawVariants]);

  // ──── SINGLE SOURCE OF TRUTH ────
  // Inicializar con URL (deep-link) si trae variant válido, sino primer variant.
  // useState con función ejecuta UNA SOLA VEZ en mount — la URL no resetea el
  // state después; cualquier cambio de variant después del mount viene del
  // click, NO de la URL.
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const fromUrl = searchParams.get("variant");
    if (fromUrl && variants.some((v) => v.id === fromUrl)) return fromUrl;
    return variants[0]?.id ?? null;
  });

  // Transition para que router.replace no bloquee paint del chip.
  const [isPending, startTransition] = useTransition();

  const selectedVariant = variants.find((v) => v.id === selectedId);

  // Click handler: urgent state update + URL sync en transition.
  function selectVariant(id: string) {
    if (id === selectedId) return; // mismo variant, nada que hacer
    setSelectedId(id);
    const params = new URLSearchParams(searchParams.toString());
    params.set("variant", id);
    startTransition(() => {
      router.replace(`?${params.toString()}`, { scroll: false });
    });
  }

  // Detectar dimensiones — y decidir si son INDEPENDIENTES o ACOPLADAS.
  //
  // Independientes: matriz cartesiana completa (cada combinación tiene
  //   un variant). Ej. 3 colores × 4 tamaños = 12 variants.
  //   → Mostrar como N selectores separados (modo multi-dim).
  //
  // Acopladas: las variantes son "presets" donde las dimensiones cambian
  //   juntas. Ej. "Set 6 fotos · 7×9 cm" y "Set 9 fotos · 6×8 cm" — no
  //   existen "9 fotos · 7×9 cm" ni "6 fotos · 4×5 cm".
  //   → Mostrar como UNA lista única (modo single-dim) para evitar que el
  //   cliente clickee combinaciones imposibles. Esta es la arquitectura
  //   que usa Casetify/Shutterfly/Society6 con kits/presets.
  //
  // Heurística: si #variants < producto-cartesiano-de-cardinalidades →
  // acopladas. Si la matriz está completa → independientes.
  const dimensions = useMemo(() => {
    if (variants.length < 2) return [];
    const dimMap: Record<string, Set<string>> = {};
    for (const v of variants) {
      const attrs = parseVariantAttributes(v.attributes);
      for (const key of VISIBLE_DIMENSIONS) {
        const value = attrs[key];
        if (value === undefined || value === null) continue;
        if (!dimMap[key]) dimMap[key] = new Set();
        dimMap[key].add(String(value));
      }
    }
    const dimKeys = VISIBLE_DIMENSIONS.filter((key) => dimMap[key] && dimMap[key].size > 1);
    if (dimKeys.length === 0) return [];

    // Detectar acoplamiento: si las dimensiones no son combinables libremente
    // (matriz incompleta), retornar [] para que el componente caiga al modo
    // single-dim (lista única con presets).
    const cartesianProduct = dimKeys.reduce((acc, key) => acc * dimMap[key].size, 1);
    if (variants.length < cartesianProduct) {
      return []; // dimensiones acopladas → lista única
    }

    return dimKeys.map((key) => {
      const rawValues = Array.from(dimMap[key]);
      const isNumeric = key === "quantity" || key === "photoSlots";
      const values = isNumeric ? rawValues.sort((a, b) => Number(a) - Number(b)) : rawValues.sort();
      return { key, label: DIMENSION_LABELS[key] ?? key, values };
    });
  }, [variants]);

  // Valor actual por dimensión (del variant seleccionado) — refleja
  // INMEDIATO porque selectedVariant depende de selectedId (local).
  const currentValues = useMemo(() => {
    if (!selectedVariant) return {} as Record<string, string>;
    const attrs = parseVariantAttributes(selectedVariant.attributes);
    const result: Record<string, string> = {};
    for (const dim of dimensions) {
      const value = attrs[dim.key as keyof ProductVariantAttributes];
      if (value !== undefined && value !== null) result[dim.key] = String(value);
    }
    return result;
  }, [selectedVariant, dimensions]);

  function handleSelectValue(dimKey: string, value: string) {
    // INVARIANTE: el variant resultante DEBE tener `value` en `dimKey`.
    // Esa es la dimensión que el cliente explícitamente eligió. Las demás
    // dimensiones se preservan en el mejor esfuerzo (best match), pero
    // si el catálogo no tiene un variant con la combinación exacta, se
    // sacrifica una dimensión NO-clickeada antes que la clickeada.
    //
    // Paso 1: filtrar variants que cumplen la dimensión clickeada.
    const candidates = variants.filter((v) => {
      const attrs = parseVariantAttributes(v.attributes);
      const dimValue = attrs[dimKey as keyof ProductVariantAttributes];
      return dimValue !== undefined && String(dimValue) === value;
    });
    if (candidates.length === 0) return; // no hay variant con ese value

    // Paso 2: si solo hay uno, ese es. Si hay varios, elegir el que más
    // coincide con `currentValues` en las DEMÁS dimensiones (preservar
    // la intención del cliente lo más posible).
    let bestVariant = candidates[0];
    let bestScore = -1;
    for (const v of candidates) {
      const attrs = parseVariantAttributes(v.attributes);
      let score = 0;
      for (const [k, val] of Object.entries(currentValues)) {
        if (k === dimKey) continue; // ya garantizado por el filter
        const variantValue = attrs[k as keyof ProductVariantAttributes];
        if (variantValue !== undefined && String(variantValue) === val) score++;
      }
      if (score > bestScore) {
        bestScore = score;
        bestVariant = v;
      }
    }
    selectVariant(bestVariant.id);
  }

  if (variants.length < 2) return null;

  // ── Modo single-dimension: lista vertical con precio por variant ──
  if (dimensions.length <= 1) {
    return (
      <div className="mb-4">
        <p className="text-brand-purple-dark/70 mb-2 text-xs font-bold tracking-wider uppercase">
          Elige tu opción
        </p>
        <div role="radiogroup" aria-label="Variantes del producto" className="flex flex-col gap-2">
          {variants.map((v) => {
            const attrs = parseVariantAttributes(v.attributes);
            const fallbackLabel = generateVariantLabel(attrs);
            const label = v.name && v.name !== "Default" ? v.name : fallbackLabel;
            const price = v.price ?? productBasePrice;
            const isSelected = v.id === selectedId;
            return (
              <button
                key={v.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => selectVariant(v.id)}
                className={[
                  "focus:ring-brand-turquoise flex w-full cursor-pointer items-center justify-between rounded-lg p-3 text-left transition-all focus:ring-2 focus:outline-none",
                  isSelected
                    ? "ring-brand-turquoise from-brand-turquoise/10 to-brand-purple/10 bg-gradient-to-br shadow-md ring-2"
                    : "ring-brand-purple/15 hover:ring-brand-purple/40 hover:bg-brand-cream/40 ring-1 hover:shadow-sm",
                ].join(" ")}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={[
                      "flex h-5 w-5 items-center justify-center rounded-full transition-colors",
                      isSelected ? "bg-brand-turquoise text-white" : "ring-brand-purple/30 ring-1",
                    ].join(" ")}
                    aria-hidden
                  >
                    {isSelected && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                  <span
                    className={[
                      "text-sm font-semibold",
                      isSelected ? "text-brand-purple-dark" : "text-brand-purple-dark/85",
                    ].join(" ")}
                  >
                    {label}
                  </span>
                </span>
                <span
                  className={[
                    "text-sm font-bold tabular-nums",
                    isSelected ? "text-brand-purple-dark" : "text-brand-purple-dark/75",
                  ].join(" ")}
                >
                  {formatCOP(price)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Modo multi-dimension: chips por dimensión + card de Precio ──
  const currentPrice = selectedVariant?.price ?? productBasePrice;

  return (
    <div className="mb-4 space-y-4">
      {dimensions.map((dim) => (
        <div key={dim.key}>
          <p className="text-brand-purple-dark/70 mb-2 text-xs font-bold tracking-wider uppercase">
            {dim.label}
          </p>
          <div role="radiogroup" aria-label={dim.label} className="flex flex-wrap gap-2">
            {dim.values.map((value) => {
              const isSelected = currentValues[dim.key] === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => handleSelectValue(dim.key, value)}
                  className={[
                    "focus:ring-brand-turquoise cursor-pointer rounded-lg px-3 py-2 text-sm font-semibold transition-all focus:ring-2 focus:outline-none",
                    isSelected
                      ? "bg-brand-purple text-white shadow-md"
                      : "ring-brand-purple/20 text-brand-purple-dark hover:ring-brand-purple/50 hover:bg-brand-cream/50 bg-white ring-1",
                  ].join(" ")}
                >
                  {formatDimensionValue(dim.key, value)}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* Precio del variant seleccionado, prominente. Refleja inmediato
          porque depende de selectedVariant (local). isPending solo
          indica que el server aún está sincronizando el resto del PDP. */}
      <div className="from-brand-turquoise/8 to-brand-purple/8 ring-brand-purple/15 flex items-center justify-between rounded-lg bg-gradient-to-br p-3 ring-1">
        <span className="text-brand-purple-dark/70 text-xs font-bold tracking-wider uppercase">
          Precio
          {isPending && (
            <span className="text-brand-purple/60 ml-1.5 font-normal normal-case">
              · sincronizando…
            </span>
          )}
        </span>
        <span className="text-brand-purple-dark text-xl font-bold tabular-nums">
          {formatCOP(currentPrice)}
        </span>
      </div>
    </div>
  );
}
