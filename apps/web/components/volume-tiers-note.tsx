/*
 * VolumeTiersNote — bloque «Ahorra llevando más…» de la PDP (owner 2026-11-10:
 * unificado para TODO el catálogo, con el look de bola-navidena-personalizada).
 *
 * Lo alimentan dos fuentes, mismo visual:
 *   1. WholesaleTier reales (resolveVisibleVolumeTiers) — descuento por
 *      cantidad que el carrito aplica automáticamente (bola, mini libros…).
 *   2. La escala DERIVADA de las presentaciones pack (derivePackVolumeTiers +
 *      PackVolumeTiersNote en app/producto/[slug]) — el descuento ya viene en
 *      el precio de cada presentación (polaroid/cuadrados).
 */

import { Sparkles } from "lucide-react";
import { formatCOP } from "@/lib/format";

export type VolumeTierNoteItem = {
  key: string;
  /** Etiqueta de cantidad: "3+ unid." (tiers reales) o "2 packs" (derivada). */
  qtyLabel: string;
  /** Precio unitario de referencia (centavos COP). */
  unitPrice: number;
  /** Sufijo del precio: "c/u" o "c/pack". */
  priceSuffix: string;
  savingsPct: number;
};

export function VolumeTiersNote({
  title,
  items,
  className,
}: {
  title: string;
  items: VolumeTierNoteItem[];
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <div
      aria-label="Descuentos por cantidad"
      className={[
        "border-brand-purple/15 bg-brand-purple/5 rounded-xl border p-3",
        className ?? "",
      ].join(" ")}
    >
      <p className="text-brand-purple-dark flex items-center gap-1.5 text-xs font-semibold">
        <Sparkles className="text-brand-purple h-3.5 w-3.5 flex-shrink-0" aria-hidden />
        {title}
      </p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {items.map((item) => (
          <li
            key={item.key}
            className="border-brand-purple/15 inline-flex items-center gap-1.5 rounded-lg border bg-white px-2.5 py-1 text-xs shadow-2xs"
          >
            <span className="text-brand-muted font-medium">{item.qtyLabel}</span>
            <span className="text-brand-purple-dark font-bold tabular-nums">
              {formatCOP(item.unitPrice)} {item.priceSuffix}
            </span>
            <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
              −{item.savingsPct}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
