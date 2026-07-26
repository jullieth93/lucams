"use client";

/*
 * Formulario de creación de nivel mayorista. El precio se digita en PESOS
 * (la conversión a centavos ocurre server-side en la action) — dejarlo claro
 * en el label evita errores de ×100 de la admin.
 */

import { useActionState } from "react";
import { formatCOP } from "@/lib/format";
import { createWholesaleTierAction, type TierActionState } from "./actions";

export type ProductOption = {
  id: string;
  name: string;
  basePrice: number; // centavos — solo se muestra como referencia
};

export function CreateTierForm({ products }: { products: ProductOption[] }) {
  const [state, formAction, isPending] = useActionState<TierActionState | null, FormData>(
    createWholesaleTierAction,
    null,
  );

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div>
          <label
            htmlFor="t-product"
            className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold"
          >
            Producto <span className="text-rose-600">*</span>
          </label>
          <select
            id="t-product"
            name="productId"
            defaultValue=""
            className="border-brand-purple/25 focus:border-brand-purple focus:ring-brand-purple/20 w-full rounded-md border bg-white px-3 py-2 text-sm focus:ring-2 focus:outline-none"
          >
            <option value="">Todo el catálogo</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({formatCOP(p.basePrice)})
              </option>
            ))}
          </select>
          {state?.fieldErrors?.productId && (
            <p className="mt-1 text-xs text-rose-600">{state.fieldErrors.productId[0]}</p>
          )}
          <p className="text-brand-muted mt-1 text-xs">
            “Todo el catálogo” aplica el nivel a cualquier producto.
          </p>
        </div>
        <div>
          <label
            htmlFor="t-minqty"
            className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold"
          >
            Cantidad mínima <span className="text-rose-600">*</span>
          </label>
          <input
            id="t-minqty"
            name="minQty"
            type="number"
            min={2}
            step={1}
            required
            placeholder="10"
            className="border-brand-purple/25 focus:border-brand-purple focus:ring-brand-purple/20 w-full rounded-md border bg-white px-3 py-2 text-sm focus:ring-2 focus:outline-none"
          />
          {state?.fieldErrors?.minQty && (
            <p className="mt-1 text-xs text-rose-600">{state.fieldErrors.minQty[0]}</p>
          )}
          <p className="text-brand-muted mt-1 text-xs">
            A partir de cuántas unidades aplica este precio (mínimo 2).
          </p>
        </div>
        <div>
          <label
            htmlFor="t-price"
            className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold"
          >
            Precio por unidad (pesos) <span className="text-rose-600">*</span>
          </label>
          <input
            id="t-price"
            name="unitPricePesos"
            type="number"
            min={1}
            step={1}
            required
            placeholder="3500"
            className="border-brand-purple/25 focus:border-brand-purple focus:ring-brand-purple/20 w-full rounded-md border bg-white px-3 py-2 text-sm focus:ring-2 focus:outline-none"
          />
          {state?.fieldErrors?.unitPrice && (
            <p className="mt-1 text-xs text-rose-600">{state.fieldErrors.unitPrice[0]}</p>
          )}
          <p className="text-brand-muted mt-1 text-xs">
            En pesos colombianos, sin puntos ni signos. Ej: 3500 = $3.500.
          </p>
        </div>
      </div>
      <div>
        <label
          htmlFor="t-note"
          className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold"
        >
          Nota interna (opcional)
        </label>
        <input
          id="t-note"
          name="note"
          maxLength={200}
          placeholder="Ej: precio pactado con tiendas aliadas"
          className="border-brand-purple/25 focus:border-brand-purple focus:ring-brand-purple/20 w-full rounded-md border bg-white px-3 py-2 text-sm focus:ring-2 focus:outline-none"
        />
        {state?.fieldErrors?.note && (
          <p className="mt-1 text-xs text-rose-600">{state.fieldErrors.note[0]}</p>
        )}
      </div>
      <label className="text-brand-purple-dark inline-flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" name="isActive" defaultChecked className="accent-brand-purple" />
        Activar inmediatamente
      </label>
      {state?.error && (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="bg-gradient-brand inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Creando…" : "Crear nivel"}
      </button>
    </form>
  );
}
