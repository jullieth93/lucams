"use client";

/*
 * VariantVolumeTiersNote — bloque «Ahorra llevando más…» reactivo a la opción
 * elegida en la PDP (ADR-209).
 *
 * Resuelve la escala efectiva (`WholesaleTier`) de la variante seleccionada en
 * `SelectedVariantProvider` (p. ej. Fotoimanes Cuadrados `4×4` vs `7×7` cm) y
 * adapta el sustantivo comercial (`packs` / `c/pack` vs `unid.` / `c/u`).
 */

import { useSelectedVariant } from "./variant-actions";
import { VolumeTiersNote } from "@/components/volume-tiers-note";
import { formatVolumeTierQtyLabel, type VisibleVolumeTier } from "@/features/cart/volume-pricing";

export function VariantVolumeTiersNote({
  tiersByVariantId,
  fallbackTiers,
  isPack = false,
  maxQty,
  maxQtyByVariantId,
  className,
}: {
  tiersByVariantId: Record<string, VisibleVolumeTier[]>;
  fallbackTiers: VisibleVolumeTier[];
  isPack?: boolean;
  maxQty?: number;
  maxQtyByVariantId?: Record<string, number>;
  className?: string;
}) {
  const { selectedId } = useSelectedVariant();
  const tiers = (selectedId ? tiersByVariantId[selectedId] : undefined) ?? fallbackTiers;
  const effectiveMax = (selectedId ? maxQtyByVariantId?.[selectedId] : undefined) ?? maxQty ?? null;
  if (!tiers || tiers.length === 0) return null;

  return (
    <VolumeTiersNote
      className={className}
      title={
        isPack
          ? "Ahorra llevando más packs (se aplica automáticamente en tu carrito)"
          : "Ahorra llevando más unidades (se aplica automáticamente en tu carrito)"
      }
      items={tiers.map((vt) => ({
        key: String(vt.minQty),
        qtyLabel: formatVolumeTierQtyLabel(vt.minQty, { maxQty: effectiveMax, isPack }),
        unitPrice: vt.unitPrice,
        priceSuffix: isPack ? "c/pack" : "c/u",
        savingsPct: vt.savingsPct,
      }))}
    />
  );
}
