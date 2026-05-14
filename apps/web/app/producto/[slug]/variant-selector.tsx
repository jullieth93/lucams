"use client";

/*
 * VariantSelector — M.3.b.CAT.3 (2026-05-14).
 *
 * Selector de variants del producto en PDP. Renderea solo si el producto
 * tiene 2+ variants. Patrón Casetify: cliente elige cantidad/tamaño antes
 * de hacer click en "Personalizar".
 *
 * UX:
 *   - RadioGroup vertical con cards clickeables
 *   - Cada card muestra label (auto-generado de attributes) + precio override
 *     si lo tiene + indicador "seleccionado"
 *   - Click en variant → actualiza URL query (?variant=v_id) sin reload
 *   - Visible selected via ring brand-turquoise
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { Check } from "lucide-react";
import { formatCOP } from "@/lib/format";
import { parseVariantAttributes, generateVariantLabel } from "@/features/products/variant-schemas";

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

export function VariantSelector({ productBasePrice, variants }: VariantSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentVariantId = searchParams.get("variant");

  // Default al primero si no hay selected en URL
  const selectedId = currentVariantId ?? variants[0]?.id ?? null;

  const handleSelect = (variantId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("variant", variantId);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  // Pre-compute display data — useMemo ANTES del early return (rules-of-hooks)
  const items = useMemo(
    () =>
      variants.map((v) => {
        const attrs = parseVariantAttributes(v.attributes);
        const fallbackLabel = generateVariantLabel(attrs);
        return {
          id: v.id,
          // Si el variant tiene name custom usalo, sino generado de attrs
          label: v.name && v.name !== "Default" ? v.name : fallbackLabel,
          price: v.price ?? productBasePrice,
          isSelected: v.id === selectedId,
        };
      }),
    [variants, selectedId, productBasePrice],
  );

  if (variants.length < 2) return null; // Sin variants reales, no mostrar

  return (
    <div className="mb-4">
      <p className="text-brand-purple-dark/70 mb-2 text-xs font-bold tracking-wider uppercase">
        Elegí tu opción
      </p>
      <div role="radiogroup" aria-label="Variantes del producto" className="flex flex-col gap-2">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={item.isSelected}
            onClick={() => handleSelect(item.id)}
            className={[
              "focus:ring-brand-turquoise flex w-full items-center justify-between rounded-lg p-3 text-left transition-all focus:ring-2 focus:outline-none",
              item.isSelected
                ? "ring-brand-turquoise from-brand-turquoise/10 to-brand-purple/10 bg-gradient-to-br shadow-md ring-2"
                : "ring-brand-purple/15 hover:ring-brand-purple/40 hover:bg-brand-cream/40 ring-1 hover:shadow-sm",
            ].join(" ")}
          >
            <span className="flex items-center gap-2">
              <span
                className={[
                  "flex h-5 w-5 items-center justify-center rounded-full transition-colors",
                  item.isSelected ? "bg-brand-turquoise text-white" : "ring-brand-purple/30 ring-1",
                ].join(" ")}
                aria-hidden
              >
                {item.isSelected && <Check className="h-3 w-3" strokeWidth={3} />}
              </span>
              <span
                className={[
                  "text-sm font-semibold",
                  item.isSelected ? "text-brand-purple-dark" : "text-brand-purple-dark/85",
                ].join(" ")}
              >
                {item.label}
              </span>
            </span>
            <span
              className={[
                "text-sm font-bold tabular-nums",
                item.isSelected ? "text-brand-purple-dark" : "text-brand-purple-dark/75",
              ].join(" ")}
            >
              {formatCOP(item.price)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
