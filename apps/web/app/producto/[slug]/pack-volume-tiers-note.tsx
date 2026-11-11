"use client";

/*
 * PackVolumeTiersNote — escala de ahorro de las familias vendidas por PACKS
 * (polaroid/cuadrados, ADR-101) con el MISMO bloque «Ahorra llevando más» de
 * los WholesaleTier reales (VolumeTiersNote; owner 2026-11-10 — antes el
 * descuento de estas familias solo se insinuaba con un tachado/chip y el
 * cliente no entendía cuánto ahorraba por presentación).
 *
 * Los grupos (tamaño × imán) llegan precalculados del server; la nota sigue la
 * variante elegida vía SelectedVariantProvider (cuadrados: cambia de tamaño y
 * la escala cambia con ella).
 */

import { useSelectedVariant } from "./variant-actions";
import { VolumeTiersNote } from "@/components/volume-tiers-note";
import type { PackVolumeTierGroup } from "@/features/cart/volume-pricing";

export function PackVolumeTiersNote({
  groups,
  groupKeyByVariantId,
  className,
}: {
  groups: PackVolumeTierGroup[];
  /** variantId → clave de grupo de derivePackVolumeTiers. */
  groupKeyByVariantId: Record<string, string>;
  className?: string;
}) {
  const { selectedId } = useSelectedVariant();
  if (groups.length === 0) return null;
  const selectedKey = selectedId ? groupKeyByVariantId[selectedId] : undefined;
  const group = groups.find((g) => g.key === selectedKey) ?? groups[0]!;
  return (
    <VolumeTiersNote
      className={className}
      title="Ahorra llevando más packs (el descuento ya viene en el precio de cada presentación)"
      items={group.tiers.map((t) => ({
        key: String(t.packs),
        qtyLabel: `${t.packs} ${t.packs === 1 ? "pack" : "packs"}`,
        unitPrice: t.packPrice,
        priceSuffix: "c/pack",
        savingsPct: t.savingsPct,
      }))}
    />
  );
}
