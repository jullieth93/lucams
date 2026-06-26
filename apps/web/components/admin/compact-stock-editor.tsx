"use client";

/*
 * <CompactStockEditor> — versión densa del editor de stock para usar
 * dentro de filas de tabla.
 *
 * Lucy 2026-06-26 — hotfix UI inventario: SimpleVariantStockEditor (diseñado
 * para el panel del producto) ocupa demasiado vertical y horizontal cuando
 * se mete en una columna de tabla. Esta versión:
 *  - 1 sola fila (input + botón icon-only Save)
 *  - Sin label (la columna ya dice "Stock" o "Cantidad")
 *  - Botón deshabilitado si no hay cambios → cero ruido visual
 *  - Hint de delta SOLO si el user editó algo distinto
 *  - Feedback: toast-like inline solo si error (éxito = revalidatePath
 *    refresca el value mostrado en la columna stock = self-evident)
 *
 * Comparte server action con SimpleVariantStockEditor (setVariantStockAction
 * con audit InventoryLog + recordAdminAction).
 */

import { useActionState, useState } from "react";
import { Save, AlertCircle } from "lucide-react";
import { MAX_STOCK_VALUE } from "@/features/products/stock-constants";
import {
  setVariantStockAction,
  type StockActionState,
} from "@/app/admin/(panel)/productos/stock-actions";

export function CompactStockEditor({
  variantId,
  productId,
  currentStock,
}: {
  variantId: string;
  productId: string;
  currentStock: number;
}) {
  const [state, formAction, pending] = useActionState<StockActionState | null, FormData>(
    setVariantStockAction,
    null,
  );
  const [value, setValue] = useState<string>(String(currentStock));
  const numeric = Number(value);
  const hasChange = value !== "" && Number.isFinite(numeric) && numeric !== currentStock;
  const delta = hasChange ? numeric - currentStock : 0;

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="variantId" value={variantId} />
      <input type="hidden" name="productId" value={productId} />

      <div className="flex items-center gap-1.5">
        <input
          type="number"
          name="newStock"
          min={0}
          max={MAX_STOCK_VALUE}
          step={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          required
          disabled={pending}
          aria-label="Nueva cantidad de stock"
          className="border-brand-purple/25 text-brand-purple-dark focus:border-brand-purple focus:ring-brand-purple/30 h-9 w-20 rounded-md border bg-white px-2 text-sm tabular-nums focus:ring-2 focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={pending || !hasChange}
          aria-label="Guardar nuevo stock"
          title={
            !hasChange
              ? "Sin cambios para guardar"
              : delta > 0
                ? `Agregar ${delta} unidades`
                : `Quitar ${Math.abs(delta)} unidades`
          }
          className="bg-brand-purple hover:bg-brand-purple-dark inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-white shadow-sm transition-colors disabled:bg-brand-purple/30 disabled:cursor-not-allowed"
        >
          {pending ? (
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          ) : (
            <Save className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Hint delta inline — solo cuando user editó */}
      {hasChange && !state?.error && (
        <p className="text-brand-purple-dark/60 text-[10px] font-medium tabular-nums">
          {delta > 0 ? "+" : ""}
          {delta.toLocaleString("es-CO")}
        </p>
      )}

      {/* Error inline compacto */}
      {state?.error && (
        <p
          role="alert"
          className="flex items-center gap-1 text-[10px] font-medium text-red-700"
          title={state.error}
        >
          <AlertCircle className="h-3 w-3" />
          {state.error.length > 30 ? `${state.error.slice(0, 28)}…` : state.error}
        </p>
      )}
    </form>
  );
}
