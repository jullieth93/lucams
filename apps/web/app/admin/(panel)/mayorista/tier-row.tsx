"use client";

/*
 * Fila de un nivel mayorista (WholesaleTier) en /admin/mayorista, con EDICIÓN
 * inline (2026-11-11, owner — antes solo había Desactivar/Eliminar: «editar»
 * exigía borrar y recrear el nivel). El botón «Editar» cambia la fila a un
 * formulario en línea (cantidad mínima, precio en PESOS, nota) con validación
 * del server action `updateWholesaleTierAction`; el alcance (producto/global)
 * y el estado activo no se editan acá.
 */

import { useActionState, useState } from "react";
import { AdminBadge, AdminTableRow } from "@/components/admin-page";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { formatCOP } from "@/lib/format";
import {
  deleteWholesaleTierAction,
  toggleWholesaleTierAction,
  updateWholesaleTierAction,
} from "./actions";

export type TierRowData = {
  id: string;
  minQty: number;
  unitPrice: number;
  note: string | null;
  isActive: boolean;
  /** Fecha ya formateada en el server (es-CO). */
  createdLabel: string;
};

const inputClass =
  "border-brand-purple/25 focus:border-brand-purple focus:ring-brand-purple/20 h-9 w-full rounded-md border bg-white px-2 text-sm focus:ring-2 focus:outline-none";

export function TierRow({ tier }: { tier: TierRowData }) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState(updateWholesaleTierAction, null);

  if (editing) {
    return (
      <AdminTableRow>
        <td colSpan={6} className="px-4 py-3">
          <form action={formAction} className="space-y-2">
            <input type="hidden" name="id" value={tier.id} />
            {state?.error && (
              <p role="alert" className="text-xs font-medium text-rose-700">
                {state.error}
              </p>
            )}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[10rem_12rem_1fr_auto] sm:items-end">
              <label className="block">
                <span className="text-brand-purple-dark mb-0.5 block text-[11px] font-semibold">
                  Cantidad mínima
                </span>
                <input
                  type="number"
                  name="minQty"
                  min={2}
                  required
                  defaultValue={tier.minQty}
                  className={inputClass}
                />
                {state?.fieldErrors?.minQty?.[0] && (
                  <span className="text-[11px] text-rose-700">{state.fieldErrors.minQty[0]}</span>
                )}
              </label>
              <label className="block">
                <span className="text-brand-purple-dark mb-0.5 block text-[11px] font-semibold">
                  Precio por unidad (pesos)
                </span>
                <input
                  type="number"
                  name="unitPricePesos"
                  min={1}
                  step={1}
                  required
                  defaultValue={Math.round(tier.unitPrice / 100)}
                  className={inputClass}
                />
                {state?.fieldErrors?.unitPrice?.[0] && (
                  <span className="text-[11px] text-rose-700">
                    {state.fieldErrors.unitPrice[0]}
                  </span>
                )}
              </label>
              <label className="block">
                <span className="text-brand-purple-dark mb-0.5 block text-[11px] font-semibold">
                  Nota (opcional)
                </span>
                <input
                  type="text"
                  name="note"
                  maxLength={200}
                  defaultValue={tier.note ?? ""}
                  className={inputClass}
                />
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={pending}
                  className="bg-brand-purple hover:bg-brand-purple-dark min-h-9 rounded-full px-4 text-xs font-semibold text-white transition-colors disabled:opacity-60"
                >
                  {pending ? "Guardando…" : "Guardar"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  disabled={pending}
                  className="text-brand-muted hover:text-brand-purple-dark min-h-9 rounded-full px-3 text-xs font-medium transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </form>
        </td>
      </AdminTableRow>
    );
  }

  return (
    <AdminTableRow>
      <td className="text-brand-purple-dark px-4 py-3 align-top font-semibold tabular-nums">
        {tier.minQty.toLocaleString("es-CO")}+ unidades
      </td>
      <td className="text-brand-purple-dark px-4 py-3 text-right align-top font-semibold tabular-nums">
        {formatCOP(tier.unitPrice)}
      </td>
      <td className="text-brand-muted px-4 py-3 align-top text-xs">{tier.note ?? "—"}</td>
      <td className="px-4 py-3 text-center align-top">
        {tier.isActive ? (
          <AdminBadge tone="emerald">Activo</AdminBadge>
        ) : (
          <AdminBadge tone="amber">Desactivado</AdminBadge>
        )}
      </td>
      <td className="text-brand-muted px-4 py-3 align-top text-xs">{tier.createdLabel}</td>
      <td className="px-4 py-3 align-top">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-brand-purple hover:text-brand-purple-dark text-[11px] font-medium"
          >
            Editar
          </button>
          <form action={toggleWholesaleTierAction}>
            <input type="hidden" name="id" value={tier.id} />
            <button
              type="submit"
              className={
                tier.isActive
                  ? "text-[11px] font-medium text-amber-700 hover:text-amber-900"
                  : "text-[11px] font-medium text-emerald-700 hover:text-emerald-900"
              }
            >
              {tier.isActive ? "Desactivar" : "Activar"}
            </button>
          </form>
          <ConfirmAction
            action={deleteWholesaleTierAction}
            message="¿Eliminar este nivel de precio? Dejará de aplicar de inmediato."
          >
            <input type="hidden" name="id" value={tier.id} />
            <button
              type="submit"
              className="text-brand-muted text-[11px] font-medium hover:text-rose-600"
            >
              Eliminar
            </button>
          </ConfirmAction>
        </div>
      </td>
    </AdminTableRow>
  );
}
