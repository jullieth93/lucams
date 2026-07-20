"use client";

/*
 * ADR-065 — Formularios del block-list COD (cliente). Agregar (teléfono/email + motivo) y retirar
 * (con confirmación). Patrón conciliacion-actions.tsx (useActionState).
 */

import { useActionState } from "react";
import { addBlockedIdentityAction, removeBlockedIdentityAction } from "./actions";

type Result = { error?: string; success?: string } | null;

function Notice({ state }: { state: Result }) {
  if (!state?.success && !state?.error) return null;
  return (
    <div
      role={state.error ? "alert" : undefined}
      className={`mt-2 rounded-md p-2 text-xs ${
        state.success ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"
      }`}
    >
      {state.success ?? state.error}
    </div>
  );
}

export function AddBlockForm() {
  const [state, action, pending] = useActionState(addBlockedIdentityAction, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-2">
        <label className="text-brand-purple-dark flex flex-col gap-1 text-xs font-semibold">
          Tipo
          <select
            name="kind"
            defaultValue="PHONE"
            className="border-brand-purple/25 rounded-md border bg-white px-2 py-1.5 text-sm"
          >
            <option value="PHONE">Teléfono</option>
            <option value="EMAIL">Email</option>
          </select>
        </label>
        <label className="text-brand-purple-dark flex flex-1 flex-col gap-1 text-xs font-semibold">
          Valor a bloquear
          <input
            name="value"
            required
            placeholder="3001234567 o correo@ejemplo.com"
            className="border-brand-purple/25 rounded-md border bg-white px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-brand-purple-dark flex flex-1 flex-col gap-1 text-xs font-semibold">
          Motivo
          <input
            name="reason"
            required
            placeholder="Ej. 3 pedidos COD no recibidos"
            className="border-brand-purple/25 rounded-md border bg-white px-2 py-1.5 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="bg-brand-purple hover:bg-brand-purple-dark rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Bloqueando…" : "Bloquear"}
        </button>
      </div>
      <Notice state={state} />
    </form>
  );
}

export function RemoveBlockButton({ id, label }: { id: string; label: string }) {
  const [state, action, pending] = useActionState(removeBlockedIdentityAction, null);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`¿Retirar el bloqueo de "${label}"? Podrá volver a pagar contra entrega.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
      >
        {pending ? "…" : "Retirar"}
      </button>
      <Notice state={state} />
    </form>
  );
}
