"use client";

import { useActionState } from "react";
import { RefreshCw } from "lucide-react";
import { retryRenderJobAction } from "./actions";

export function RetryRenderJobButton({
  designId,
  orderNumber,
  lastError,
}: {
  designId: string;
  orderNumber: string;
  lastError?: string | null;
}) {
  const [state, action, pending] = useActionState(retryRenderJobAction, null);

  return (
    <div className="mt-2 rounded-md border border-rose-200 bg-rose-50/70 p-2.5 text-[11px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-rose-700">
          ⚠️ El render 300 DPI falló — reintenta antes de producir.
        </span>
        <form action={action}>
          <input type="hidden" name="designId" value={designId} />
          <input type="hidden" name="orderNumber" value={orderNumber} />
          <button
            type="submit"
            disabled={pending}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-rose-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-rose-800 transition-colors hover:bg-rose-100 disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`} />
            {pending ? "Reintentando…" : "Reintentar render 300 DPI"}
          </button>
        </form>
      </div>
      {lastError && !state?.success && (
        <p className="mt-1 font-mono text-[10px] break-words text-rose-700/80">
          Detalle técnico: {lastError}
        </p>
      )}
      {state?.error && <p className="mt-1 font-medium text-rose-700">{state.error}</p>}
      {state?.success && <p className="mt-1 font-medium text-emerald-700">{state.success}</p>}
    </div>
  );
}
