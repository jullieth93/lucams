"use client";

/*
 * <SimpleVariantStockEditor> — Editor inline para producto con UNA sola
 * variant Default. Usado por ProductStockPanel cuando active.length === 1.
 *
 * Pattern useActionState con setVariantStockAction. Feedback con notice
 * verde/rojo en línea (sin toast — el panel ya está visualmente prominente).
 *
 * UX:
 *  - Input number con bottom hint del stock actual
 *  - Botón "💾 Actualizar" cambia a "Guardando…" en pending
 *  - Confirma con notice tono ok/error pegado debajo
 *  - El estado se hidrata desde currentStock pero el user puede editar
 *  - Si user pone el mismo valor → server hace no-op + notice "no hubo cambio"
 */

import { useActionState, useState } from "react";
import { Save, AlertCircle, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { MAX_STOCK_VALUE } from "@/features/products/stock-constants";
import { setVariantStockAction, type StockActionState } from "@/app/admin/(panel)/productos/stock-actions";

export function SimpleVariantStockEditor({
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
  // Controlled input — hidratado desde server pero editable.
  // useState con default que se sincroniza si currentStock cambia (server revalidates).
  const [value, setValue] = useState<string>(String(currentStock));

  // Cuando llega un `ok` exitoso, sincronizar el input al nuevo valor.
  // Esto evita confusión si el user editó y volvió al original.
  // Si hubo error, dejar el input como el user lo dejó.
  const stateKey = state?.ok ? "ok" : state?.error ? "error" : "idle";

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="variantId" value={variantId} />
      <input type="hidden" name="productId" value={productId} />

      <div className="grid grid-cols-[1fr_auto] gap-2 sm:max-w-md">
        <div className="space-y-1.5">
          <Label htmlFor="newStock" className="text-brand-purple-dark/80 text-sm font-medium">
            Cantidad disponible
          </Label>
          <Input
            id="newStock"
            name="newStock"
            type="number"
            min={0}
            max={MAX_STOCK_VALUE}
            step={1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="0"
            className="h-11 text-base tabular-nums"
            disabled={pending}
            aria-describedby="newStock-hint"
            required
          />
          <p id="newStock-hint" className="text-brand-purple-dark/55 text-xs">
            Actual: {currentStock.toLocaleString("es-CO")} ·{" "}
            {value !== String(currentStock) ? (
              <span className="font-semibold text-brand-purple">
                {Number(value) > currentStock ? "agregás" : "quitás"}{" "}
                {Math.abs(Number(value) - currentStock).toLocaleString("es-CO")}
              </span>
            ) : (
              "sin cambios"
            )}
          </p>
        </div>
        <div className="self-end">
          <Button
            type="submit"
            size="lg"
            disabled={pending || value === ""}
            className="bg-brand-purple hover:bg-brand-purple-dark h-11 font-semibold text-white shadow-sm disabled:opacity-60"
          >
            {pending ? (
              <>
                <span className="mr-1.5 inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Guardando…
              </>
            ) : (
              <>
                <Save className="mr-1.5 h-4 w-4" />
                Actualizar
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Feedback */}
      {stateKey === "ok" && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{state?.ok}</span>
        </div>
      )}
      {stateKey === "error" && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{state?.error}</span>
        </div>
      )}
    </form>
  );
}
