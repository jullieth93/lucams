"use client";

/*
 * VariantSelector — M.3.b.CAT.B (Lucy 2026-05-15).
 *
 * Selector multi-dimensión. Detecta dinámicamente las dimensiones de los
 * variants disponibles (ej. quantity + sizeCm) y renderea un grupo de chips
 * por cada dimensión. Cliente elige una opción por dimensión; el sistema
 * busca el variant que matchea TODAS las selecciones.
 *
 * Si el producto tiene variants con UNA sola dimensión (ej. solo quantity),
 * se mantiene el comportamiento V1: lista vertical con label compuesto.
 *
 * URL sync: ?variant=<id> sin reload.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
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

// Labels y formatters por dimensión conocida.
// `quantity` y `photoSlots` muestran ambos "Cantidad" — son la misma idea
// contextual desde la perspectiva del cliente y nunca coexisten en un mismo
// producto del seed actual. Si en el futuro coexisten, el sistema mostrará
// dos secciones con el mismo label — habría que diferenciar acá.
const DIMENSION_LABELS: Record<string, string> = {
  quantity: "Cantidad",
  photoSlots: "Cantidad",
  sizeCm: "Tamaño",
  shape: "Forma",
  color: "Color",
  finish: "Acabado",
};

function formatDimensionValue(key: string, value: unknown): string {
  if (key === "quantity") return `${value} unidades`;
  if (key === "photoSlots") return `${value} unidades`;
  if (key === "sizeCm") return `${value} cm`;
  if (key === "shape") {
    const shapeLabels: Record<string, string> = {
      rectangle: "Rectangular",
      circle: "Circular",
      heart: "Corazón",
      custom: "Custom",
    };
    return shapeLabels[String(value)] ?? String(value);
  }
  if (key === "finish") {
    const finishLabels: Record<string, string> = {
      matte: "Mate",
      glossy: "Brillante",
      "soft-touch": "Soft-touch",
      glass: "Vidrio",
    };
    return finishLabels[String(value)] ?? String(value);
  }
  return String(value);
}

// Dimensiones que mostramos como chips. Otros (aspectRatio, cornerRadiusPx)
// son técnicos y se infieren — no se exponen al cliente.
// Orden importa: las dimensiones aparecen como secciones en este orden.
//   Cantidad (quantity) primero — decisión más común del cliente.
//   Luego Fotos / Tamaño / Forma / Color / Acabado.
const VISIBLE_DIMENSIONS: (keyof ProductVariantAttributes)[] = [
  "quantity",
  "photoSlots",
  "sizeCm",
  "shape",
  "color",
  "finish",
];

export function VariantSelector({ productBasePrice, variants }: VariantSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentVariantId = searchParams.get("variant");

  // Default al primero si no hay selected en URL
  const selectedId = currentVariantId ?? variants[0]?.id ?? null;
  const selectedVariant = variants.find((v) => v.id === selectedId);

  // Detectar dimensiones presentes en los variants y los valores únicos.
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
    // Solo dimensiones con >1 valor son selectables (sino no aportan).
    // Garantizamos el orden de VISIBLE_DIMENSIONS (Cantidad primero) y
    // ordenamos los valores numéricos cuando aplica (6 antes de 12).
    return VISIBLE_DIMENSIONS.filter((key) => dimMap[key] && dimMap[key].size > 1).map((key) => {
      const rawValues = Array.from(dimMap[key]);
      const isNumeric = key === "quantity" || key === "photoSlots";
      const values = isNumeric ? rawValues.sort((a, b) => Number(a) - Number(b)) : rawValues.sort();
      return {
        key,
        label: DIMENSION_LABELS[key] ?? key,
        values,
      };
    });
  }, [variants]);

  // Valor actual por dimensión (del variant seleccionado).
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
    // Buscar el variant que matchea: nueva selección en dimKey + valores actuales
    // en las demás dimensiones. Si no existe match exacto, fallback al variant
    // con más coincidencias (preserva tantas dimensiones como posible).
    const targetValues = { ...currentValues, [dimKey]: value };
    let bestVariant: Variant | null = null;
    let bestScore = -1;
    for (const v of variants) {
      const attrs = parseVariantAttributes(v.attributes);
      let score = 0;
      let matches = 0;
      for (const [k, val] of Object.entries(targetValues)) {
        const variantValue = attrs[k as keyof ProductVariantAttributes];
        if (variantValue !== undefined && String(variantValue) === val) {
          score++;
          matches++;
        }
      }
      // Prefer exact match
      if (matches === Object.keys(targetValues).length) {
        bestVariant = v;
        break;
      }
      if (score > bestScore) {
        bestScore = score;
        bestVariant = v;
      }
    }
    if (!bestVariant) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("variant", bestVariant.id);
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  if (variants.length < 2) return null;

  // ── Modo single-dimension legacy: lista vertical compuesta ──
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
                onClick={() => {
                  const params = new URLSearchParams(searchParams.toString());
                  params.set("variant", v.id);
                  router.replace(`?${params.toString()}`, { scroll: false });
                }}
                className={[
                  "focus:ring-brand-turquoise flex w-full items-center justify-between rounded-lg p-3 text-left transition-all focus:ring-2 focus:outline-none",
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

  // ── Modo multi-dimension: chips por dimensión + precio en sección aparte ──
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
                    "focus:ring-brand-turquoise rounded-lg px-3 py-2 text-sm font-semibold transition-all focus:ring-2 focus:outline-none",
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

      {/* Precio del variant seleccionado, prominente */}
      <div className="from-brand-turquoise/8 to-brand-purple/8 ring-brand-purple/15 flex items-center justify-between rounded-lg bg-gradient-to-br p-3 ring-1">
        <span className="text-brand-purple-dark/70 text-xs font-bold tracking-wider uppercase">
          Precio
        </span>
        <span className="text-brand-purple-dark text-xl font-bold tabular-nums">
          {formatCOP(currentPrice)}
        </span>
      </div>
    </div>
  );
}
