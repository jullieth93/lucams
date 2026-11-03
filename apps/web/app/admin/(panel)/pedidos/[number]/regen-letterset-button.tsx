"use client";

import { useActionState } from "react";
import { RefreshCw } from "lucide-react";
import { regenerateLettersetProductionAction } from "./actions";

/**
 * Botón «Regenerar archivos por ficha» (ADR-188, owner 2026-11-03): visible solo en
 * ítems de sets de letras cuya producción quedó en LÁMINA por set (históricos o
 * fallo transitorio del encolado en el finalize). Encola el RenderJob por ficha y
 * el worker reemplaza las láminas por los PNG 300 DPI individuales.
 */
export function RegenLettersetButton({
  designId,
  orderNumber,
}: {
  designId: string;
  orderNumber: string;
}) {
  const [state, action, pending] = useActionState(regenerateLettersetProductionAction, null);
  return (
    <div className="mt-1.5">
      <form action={action}>
        <input type="hidden" name="designId" value={designId} />
        <input type="hidden" name="orderNumber" value={orderNumber} />
        <button
          type="submit"
          disabled={pending}
          className="text-brand-purple-dark hover:bg-brand-purple/5 border-brand-purple/30 inline-flex items-center gap-1.5 rounded-md border bg-white px-2.5 py-1.5 text-[11px] font-semibold disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`} />
          {pending ? "Regenerando…" : "Regenerar archivos por ficha"}
        </button>
      </form>
      {state?.error && <p className="mt-1 text-[11px] text-rose-600">{state.error}</p>}
      {state?.success && <p className="mt-1 text-[11px] text-emerald-700">{state.success}</p>}
    </div>
  );
}
