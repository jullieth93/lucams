"use client";

/*
 * Fila de un nivel mayorista (WholesaleTier) en /admin/mayorista.
 * Incluye:
 *   - Barra visual de ahorro frente al precio base (`.admin-bar-grow-x`).
 *   - Semáforo de margen bruto contra `Product.cost` (alerta roja visual cuando
 *     `unitPrice < cost` por D2).
 *   - Edición inline con retroalimentación inmediata de margen.
 *   - Eliminación protegida con Step-up MFA (`<ReauthForm>`).
 *   - Modo lectura estricto (`!canEdit`) para `FINANCE_ANALYST`.
 */

import { useActionState, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { AdminBadge, AdminTableRow } from "@/components/admin-page";
import { ReauthForm } from "@/components/admin/mfa-reauth";
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
  variantLabel?: string | null;
  note: string | null;
  isActive: boolean;
  createdLabel: string;
};

const inputClass =
  "border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 h-9 w-full rounded-lg border bg-white px-2.5 text-sm tabular-nums focus:ring-2 focus:outline-none";

export function TierRow({
  tier,
  referencePrice,
  unitCost,
  maxMinQty = 100,
  unitPlural = "unidades",
  canEdit,
}: {
  tier: TierRowData;
  referencePrice: number | null;
  unitCost: number | null;
  maxMinQty?: number;
  unitPlural?: string;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [editPricePesos, setEditPricePesos] = useState(String(Math.round(tier.unitPrice / 100)));
  const [state, formAction, pending] = useActionState(updateWholesaleTierAction, null);

  const savingsPct =
    referencePrice !== null && referencePrice > 0 && tier.unitPrice < referencePrice
      ? Math.max(1, Math.round(((referencePrice - tier.unitPrice) / referencePrice) * 100))
      : null;

  const hasCost = unitCost !== null && unitCost > 0;
  const marginCents = hasCost ? tier.unitPrice - unitCost : null;
  const marginPct =
    marginCents !== null && tier.unitPrice > 0
      ? Math.round((marginCents / tier.unitPrice) * 100)
      : null;
  const isBelowCost = marginCents !== null && marginCents < 0;

  if (editing && canEdit) {
    const draftCents = Math.round((Number(editPricePesos) || 0) * 100);
    const draftBelowCost = hasCost && draftCents > 0 && draftCents < unitCost;

    return (
      <AdminTableRow>
        <td colSpan={7} className="bg-brand-cream/30 px-4 py-3.5">
          <form action={formAction} className="space-y-2.5">
            <input type="hidden" name="id" value={tier.id} />
            {state?.error && (
              <p role="alert" className="text-xs font-medium text-rose-700">
                {state.error}
              </p>
            )}
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[10rem_12rem_1fr_auto] sm:items-end">
              <label className="block">
                <span className="text-brand-purple-dark mb-0.5 block text-[11px] font-semibold">
                  Cantidad mínima (2–{maxMinQty})
                </span>
                <input
                  type="number"
                  name="minQty"
                  min={2}
                  max={maxMinQty}
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
                  Precio unitario (pesos)
                </span>
                <input
                  type="number"
                  name="unitPricePesos"
                  min={1}
                  max={5000000}
                  step={1}
                  required
                  value={editPricePesos}
                  onChange={(e) => setEditPricePesos(e.target.value)}
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
            {draftBelowCost && unitCost !== null && (
              <p className="flex items-center gap-1.5 text-xs font-medium text-rose-700">
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                Quedará {formatCOP(unitCost - draftCents)} por debajo del costo BOM (
                {formatCOP(unitCost)}/u).
              </p>
            )}
          </form>
        </td>
      </AdminTableRow>
    );
  }

  return (
    <AdminTableRow className={isBelowCost || tier.minQty > maxMinQty ? "bg-rose-50/40" : undefined}>
      <td className="px-4 py-3 align-top">
        <span className="text-brand-purple-dark block font-semibold tabular-nums">
          {tier.minQty.toLocaleString("es-CO")}
          {tier.minQty >= maxMinQty ? "" : "+"} {unitPlural}
        </span>
        {tier.minQty > maxMinQty && (
          <span className="mt-0.5 inline-flex items-center gap-1 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-800">
            <AlertTriangle className="h-3 w-3" />
            Supera el tope de {maxMinQty} {unitPlural}
          </span>
        )}
        {tier.variantLabel && (
          <span className="bg-brand-purple/10 text-brand-purple-dark mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold">
            Opción: {tier.variantLabel}
          </span>
        )}
        <span className="text-brand-muted block text-[11px] tabular-nums">
          Mín. {formatCOP(tier.minQty * tier.unitPrice)}
        </span>
      </td>

      <td className="text-brand-purple-dark px-4 py-3 text-right align-top font-semibold tabular-nums">
        {formatCOP(tier.unitPrice)}
      </td>

      <td className="px-4 py-3 align-top">
        {savingsPct !== null && referencePrice !== null ? (
          <div className="min-w-[8rem] space-y-1">
            <div className="flex items-center justify-between gap-2 text-xs tabular-nums">
              <span className="font-semibold text-emerald-700">−{savingsPct}%</span>
              <span className="text-brand-muted text-[11px]">
                −{formatCOP(referencePrice - tier.unitPrice)}/u
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="admin-bar-grow-x h-full rounded-full bg-emerald-500"
                style={{ width: `${Math.min(100, Math.max(6, savingsPct * 2))}%` }}
              />
            </div>
          </div>
        ) : (
          <span className="text-brand-muted text-xs">Según producto</span>
        )}
      </td>

      <td className="px-4 py-3 align-top">
        {hasCost && marginCents !== null && marginPct !== null ? (
          <div className="space-y-0.5">
            {isBelowCost ? (
              <AdminBadge tone="rose">
                <AlertTriangle className="mr-1 inline h-3 w-3" />
                Bajo costo ({marginPct}%)
              </AdminBadge>
            ) : marginPct < 20 ? (
              <AdminBadge tone="amber">Ajustado ({marginPct}%)</AdminBadge>
            ) : (
              <AdminBadge tone="emerald">Sano ({marginPct}%)</AdminBadge>
            )}
            <p
              className={`text-[11px] tabular-nums ${
                isBelowCost ? "font-semibold text-rose-700" : "text-brand-muted"
              }`}
            >
              {marginCents >= 0 ? `+${formatCOP(marginCents)}/u` : formatCOP(marginCents) + "/u"}
            </p>
          </div>
        ) : (
          <span className="text-brand-muted text-xs">Sin costo BOM</span>
        )}
      </td>

      <td className="px-4 py-3 align-top">
        <p className="text-brand-purple-dark/85 text-xs">{tier.note ?? "—"}</p>
        <p className="text-brand-muted mt-0.5 text-[11px]">{tier.createdLabel}</p>
      </td>

      <td className="px-4 py-3 text-center align-top">
        {tier.isActive ? (
          <AdminBadge tone="emerald">Activo</AdminBadge>
        ) : (
          <AdminBadge tone="amber">Desactivado</AdminBadge>
        )}
      </td>

      {canEdit && (
        <td className="px-4 py-3 align-top">
          <div className="flex flex-wrap items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => {
                setEditPricePesos(String(Math.round(tier.unitPrice / 100)));
                setEditing(true);
              }}
              className="text-brand-purple hover:text-brand-purple-dark text-xs font-semibold"
            >
              Editar
            </button>
            <form action={toggleWholesaleTierAction}>
              <input type="hidden" name="id" value={tier.id} />
              <button
                type="submit"
                className={
                  tier.isActive
                    ? "text-xs font-semibold text-amber-700 hover:text-amber-900"
                    : "text-xs font-semibold text-emerald-700 hover:text-emerald-900"
                }
              >
                {tier.isActive ? "Desactivar" : "Activar"}
              </button>
            </form>
            <ReauthForm
              action={deleteWholesaleTierAction}
              confirmMessage="¿Eliminar este nivel mayorista? Dejará de aplicar de inmediato en el carrito y en la ficha del producto."
            >
              <input type="hidden" name="id" value={tier.id} />
              <button
                type="submit"
                className="text-brand-muted text-xs font-semibold hover:text-rose-600"
              >
                Eliminar
              </button>
            </ReauthForm>
          </div>
        </td>
      )}
    </AdminTableRow>
  );
}
