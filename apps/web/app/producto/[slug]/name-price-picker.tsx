"use client";

/*
 * ADR-057 (2026-07-12) — Selector de "¿cuántas letras?" para Nombre Personalizado (precio
 * POR FICHA). La ficha configura; el editor personaliza. Aquí el cliente ve el precio EXACTO
 * según la cantidad de letras (nº letras × precio-por-ficha) antes de entrar al Estudio, y el
 * CTA lleva ese conteo como hint (?letters=N). El editor recalcula el total en vivo con las
 * letras reales que escriba — mismo cálculo que el carrito, así que nunca hay desajuste.
 */

import { useState } from "react";
import Link from "next/link";
import { Minus, Plus, Sparkles } from "lucide-react";
import { formatCOP } from "@/lib/format";

export function NamePricePicker({
  slug,
  variantId,
  perTilePrice,
  min,
  max,
  ctaNoun,
}: {
  slug: string;
  variantId: string | null;
  perTilePrice: number;
  min: number;
  max: number;
  /** "tu imán" o "tu adhesivo" según la variante (con/sin imán). */
  ctaNoun: string;
}) {
  // Arranca en un ejemplo cómodo (5 letras) acotado a [min, max].
  const [count, setCount] = useState(() => Math.min(max, Math.max(min, 5)));
  const total = count * perTilePrice;
  const variantQS = variantId ? `?variant=${variantId}&letters=${count}` : `?letters=${count}`;

  return (
    <div className="border-brand-purple/15 bg-brand-cream/40 space-y-3 rounded-2xl border p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-brand-purple-dark text-sm font-semibold">¿Cuántas letras tendrá?</p>
          <p className="text-brand-muted text-xs">
            {formatCOP(perTilePrice)} por ficha · {min}–{max} letras
          </p>
        </div>
        <div className="border-brand-purple/20 flex items-center gap-1 rounded-full border bg-white p-1">
          <button
            type="button"
            onClick={() => setCount((c) => Math.max(min, c - 1))}
            disabled={count <= min}
            aria-label="Menos letras"
            className="text-brand-purple hover:bg-brand-purple/10 flex h-8 w-8 items-center justify-center rounded-full transition disabled:opacity-30"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="font-display text-brand-purple-dark w-7 text-center text-lg font-bold tabular-nums">
            {count}
          </span>
          <button
            type="button"
            onClick={() => setCount((c) => Math.min(max, c + 1))}
            disabled={count >= max}
            aria-label="Más letras"
            className="text-brand-purple hover:bg-brand-purple/10 flex h-8 w-8 items-center justify-center rounded-full transition disabled:opacity-30"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="border-brand-purple/15 flex items-baseline justify-between border-t border-dashed pt-3">
        <span className="text-brand-muted text-xs">
          {count} × {formatCOP(perTilePrice)}
        </span>
        <span className="text-brand-purple-dark text-2xl font-bold tabular-nums">
          {formatCOP(total)}
        </span>
      </div>

      <Link
        href={`/estudio/${slug}${variantQS}`}
        className="bg-brand-purple hover:bg-brand-purple-dark shadow-brand-purple/30 hover:shadow-brand-purple/40 inline-flex h-12 w-full items-center justify-center gap-2 rounded-md px-6 text-base font-semibold text-white shadow-lg transition-all hover:shadow-xl"
      >
        <Sparkles className="h-5 w-5" />
        Personalizar {ctaNoun} →
      </Link>
      <p className="text-brand-muted text-center text-xs">
        Arma tu palabra y elige los colores · ves el precio exacto al escribir
      </p>
    </div>
  );
}
