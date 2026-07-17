"use client";

/*
 * ADR-064 — Acciones por fila de la conciliación COD. Dos formularios colapsables: "Registrar remesa"
 * (recibí el efectivo) y "Registrar discrepancia" (no cuadra / no llegó). Patrón order-actions.tsx
 * (useActionState + <details>). Montos en PESOS (lo familiar para Lucy); el server los pasa a centavos.
 */

import { useActionState } from "react";
import { markCodRemittedAction, flagCodDiscrepancyAction } from "./actions";
import { formatCOP } from "@/lib/format";

type Result = { error?: string; success?: string } | null;

function Notice({ state }: { state: Result }) {
  if (!state?.success && !state?.error) return null;
  return (
    <div
      className={`mt-1 rounded-md p-1.5 text-[11px] ${
        state.success ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"
      }`}
    >
      {state.success ?? state.error}
    </div>
  );
}

export function CodRowActions({
  orderId,
  expectedAmount,
  status,
}: {
  orderId: string;
  expectedAmount: number;
  status: "PENDING_REMIT" | "REMITTED" | "DISCREPANCY";
}) {
  const [remitState, remitAction, remitPending] = useActionState(markCodRemittedAction, null);
  const [discState, discAction, discPending] = useActionState(flagCodDiscrepancyAction, null);
  const expectedPesos = Math.round(expectedAmount / 100);

  return (
    <div className="flex flex-col gap-1.5">
      {/* Registrar remesa (recibí el efectivo) */}
      <details className="group">
        <summary className="text-brand-purple-dark hover:bg-brand-purple/5 border-brand-purple/20 cursor-pointer list-none rounded-md border px-2 py-1 text-[11px] font-semibold">
          {status === "REMITTED" ? "✓ Remitido · corregir" : "Registrar remesa"}
        </summary>
        <form action={remitAction} className="bg-brand-cream/40 mt-1.5 space-y-1.5 rounded-md p-2">
          <input type="hidden" name="orderId" value={orderId} />
          <label className="text-brand-muted block text-[11px]">
            Monto recibido (pesos)
            <input
              type="text"
              inputMode="numeric"
              name="remittedAmountPesos"
              placeholder={`${expectedPesos} (esperado)`}
              className="border-brand-purple/25 mt-0.5 w-full rounded border px-2 py-1 text-xs"
            />
            <span className="text-brand-muted">Déjalo vacío si recibiste el monto completo.</span>
          </label>
          <input
            type="text"
            name="carrierRef"
            placeholder="Referencia del depósito (opcional)"
            className="border-brand-purple/25 w-full rounded border px-2 py-1 text-xs"
          />
          <input
            type="text"
            name="note"
            placeholder="Nota (opcional)"
            className="border-brand-purple/25 w-full rounded border px-2 py-1 text-xs"
          />
          <button
            type="submit"
            disabled={remitPending}
            className="bg-brand-purple hover:bg-brand-purple-dark w-full rounded px-2 py-1 text-[11px] font-bold text-white disabled:opacity-60"
          >
            {remitPending ? "Guardando…" : `Confirmar remesa (${formatCOP(expectedAmount)})`}
          </button>
          <Notice state={remitState} />
        </form>
      </details>

      {/* Registrar discrepancia (no cuadra / no llegó) */}
      {status !== "REMITTED" && (
        <details className="group">
          <summary className="cursor-pointer list-none rounded-md border border-amber-300 px-2 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-50">
            {status === "DISCREPANCY" ? "⚠️ Discrepancia · editar" : "Registrar discrepancia"}
          </summary>
          <form action={discAction} className="mt-1.5 space-y-1.5 rounded-md bg-amber-50/60 p-2">
            <input type="hidden" name="orderId" value={orderId} />
            <input
              type="text"
              name="discrepancyReason"
              required
              placeholder="Motivo (ej. no llegó, llegó corto)"
              className="w-full rounded border border-amber-300 px-2 py-1 text-xs"
            />
            <label className="text-brand-muted block text-[11px]">
              Monto recibido (pesos, opcional)
              <input
                type="text"
                inputMode="numeric"
                name="remittedAmountPesos"
                placeholder="0 si no llegó nada"
                className="mt-0.5 w-full rounded border border-amber-300 px-2 py-1 text-xs"
              />
            </label>
            <input
              type="text"
              name="note"
              placeholder="Nota (opcional)"
              className="w-full rounded border border-amber-300 px-2 py-1 text-xs"
            />
            <button
              type="submit"
              disabled={discPending}
              className="w-full rounded bg-amber-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-amber-700 disabled:opacity-60"
            >
              {discPending ? "Guardando…" : "Marcar discrepancia"}
            </button>
            <Notice state={discState} />
          </form>
        </details>
      )}
    </div>
  );
}
