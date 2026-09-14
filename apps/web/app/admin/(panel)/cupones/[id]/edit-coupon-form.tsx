"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { updateCouponAction, type CouponActionState } from "../actions";
import { formatCOP } from "@/lib/format";

type EditableCoupon = {
  id: string;
  code: string;
  type: "PERCENT" | "FIXED" | "FREE_SHIPPING";
  /** Centavos COP para FIXED; porcentaje (1-100) para PERCENT; ignorado en FREE_SHIPPING. */
  value: number;
  description: string | null;
  isPublic: boolean;
  isActive: boolean;
  validFrom: Date;
  validTo: Date;
  /** Centavos COP (null = sin mínimo). */
  minOrder: number | null;
  maxUses: number | null;
  maxUsesPerCustomer: number | null;
  requiresMinQuantity: number | null;
  appliesToCategories: string[];
  appliesToProductSlugs: string[];
};

/*
 * Edición de un cupón existente. Espeja CreateCouponForm (mismos campos, misma
 * conversión pesos→centavos en el server) porque parsePayload es COMPARTIDO entre
 * create y update: cualquier campo que falte en el form llegaría null/false y se
 * persistiría así — el form debe mandar SIEMPRE todos los campos editables.
 *
 * Fechas: se muestran como YYYY-MM-DD en hora Colombia (en-CA + timeZone
 * explícito, igual que el form de crear) — determinista en SSR e hidratación.
 */
export function EditCouponForm({ coupon }: { coupon: EditableCoupon }) {
  const [state, formAction, isPending] = useActionState<CouponActionState | null, FormData>(
    updateCouponAction,
    null,
  );
  const [type, setType] = useState<"PERCENT" | "FIXED" | "FREE_SHIPPING">(coupon.type);
  // #3 — el admin edita en PESOS; el server convierte a centavos (×100) al guardar.
  const [valueStr, setValueStr] = useState(
    coupon.type === "FIXED" ? String(coupon.value / 100) : String(coupon.value),
  );
  const [minOrderStr, setMinOrderStr] = useState(
    coupon.minOrder != null ? String(coupon.minOrder / 100) : "",
  );

  const toDateInput = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={coupon.id} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Código <span className="text-red-600">*</span>
          </label>
          <input
            name="code"
            required
            defaultValue={coupon.code}
            pattern="[A-Z0-9_-]+"
            className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm uppercase"
            style={{ textTransform: "uppercase" }}
          />
          {state?.fieldErrors?.code && (
            <p className="mt-1 text-xs text-red-600">{state.fieldErrors.code[0]}</p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Tipo <span className="text-red-600">*</span>
          </label>
          <select
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="PERCENT">% Descuento</option>
            <option value="FIXED">$ Descuento fijo</option>
            <option value="FREE_SHIPPING">Envío gratis</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Valor
            {type === "PERCENT" && <span className="text-xs text-slate-500"> (1-100)</span>}
            {type === "FIXED" && <span className="text-xs text-slate-500"> (pesos)</span>}
            {type === "FREE_SHIPPING" && <span className="text-xs text-slate-500"> (n/a)</span>}
          </label>
          <input
            name="value"
            type="number"
            min={type === "PERCENT" ? 1 : 0}
            max={type === "PERCENT" ? 100 : undefined}
            required
            value={type === "FREE_SHIPPING" ? "0" : valueStr}
            onChange={(e) => setValueStr(e.target.value)}
            disabled={type === "FREE_SHIPPING"}
            placeholder={type === "PERCENT" ? "15" : type === "FIXED" ? "5000" : "—"}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
          />
          {type === "FIXED" && Number(valueStr) > 0 && (
            <p className="mt-1 text-xs text-slate-500">
              = {formatCOP(Math.round(Number(valueStr) * 100))} de descuento
            </p>
          )}
          {type === "PERCENT" && Number(valueStr) > 0 && (
            <p className="mt-1 text-xs text-slate-500">= {valueStr}% de descuento</p>
          )}
          {state?.fieldErrors?.value && (
            <p className="mt-1 text-xs text-red-600">{state.fieldErrors.value[0]}</p>
          )}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Descripción pública (bot AI)
        </label>
        <input
          name="description"
          maxLength={200}
          defaultValue={coupon.description ?? ""}
          placeholder="ej. 15% off Día de la Madre, vence 12 de mayo"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Válido desde <span className="text-red-600">*</span>
          </label>
          <input
            name="validFrom"
            type="date"
            required
            defaultValue={toDateInput(coupon.validFrom)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          {state?.fieldErrors?.validFrom && (
            <p className="mt-1 text-xs text-red-600">{state.fieldErrors.validFrom[0]}</p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Válido hasta <span className="text-red-600">*</span>
          </label>
          <input
            name="validTo"
            type="date"
            required
            defaultValue={toDateInput(coupon.validTo)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          {state?.fieldErrors?.validTo && (
            <p className="mt-1 text-xs text-red-600">{state.fieldErrors.validTo[0]}</p>
          )}
        </div>
      </div>

      <fieldset className="rounded-md border border-slate-200 p-3">
        <legend className="px-2 text-sm font-semibold text-slate-700">
          Restricciones (opcional)
        </legend>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-slate-600">Mínimo orden (pesos)</label>
            <input
              name="minOrder"
              type="number"
              min="0"
              value={minOrderStr}
              onChange={(e) => setMinOrderStr(e.target.value)}
              placeholder="ej. 50000"
              className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
            />
            {Number(minOrderStr) > 0 && (
              <p className="mt-1 text-xs text-slate-500">
                = {formatCOP(Math.round(Number(minOrderStr) * 100))}
              </p>
            )}
            {state?.fieldErrors?.minOrder && (
              <p className="mt-1 text-xs text-red-600">{state.fieldErrors.minOrder[0]}</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-600">Mínimo cantidad unidades</label>
            <input
              name="requiresMinQuantity"
              type="number"
              min="1"
              defaultValue={coupon.requiresMinQuantity ?? ""}
              placeholder="ej. 6"
              className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-600">Máx usos totales</label>
            <input
              name="maxUses"
              type="number"
              min="1"
              defaultValue={coupon.maxUses ?? ""}
              placeholder="ej. 100"
              className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-600">Máx usos por cliente</label>
            <input
              name="maxUsesPerCustomer"
              type="number"
              min="1"
              defaultValue={coupon.maxUsesPerCustomer ?? ""}
              placeholder="ej. 1"
              className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs text-slate-600">
              Solo aplica en categorías (slugs separados por coma)
            </label>
            <input
              name="appliesToCategories"
              defaultValue={coupon.appliesToCategories.join(", ")}
              placeholder="ej. de-temporada,cuadros-decoracion"
              className="w-full rounded border border-slate-300 px-2 py-1 font-mono text-xs"
            />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs text-slate-600">
              Solo aplica en productos (slugs separados por coma)
            </label>
            <input
              name="appliesToProductSlugs"
              defaultValue={coupon.appliesToProductSlugs.join(", ")}
              placeholder="ej. big-box-dia-mama,cuadro-15x15-con-foto"
              className="w-full rounded border border-slate-300 px-2 py-1 font-mono text-xs"
            />
          </div>
        </div>
      </fieldset>

      <div className="flex gap-6">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={coupon.isActive}
            className="h-4 w-4 rounded border-slate-300"
          />
          <span className="text-slate-700">Activo</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="isPublic"
            defaultChecked={coupon.isPublic}
            className="h-4 w-4 rounded border-slate-300"
          />
          <span className="text-slate-700">
            Público (se puede mostrar abiertamente, ej. en una promoción o el bot de WhatsApp)
          </span>
        </label>
      </div>

      {state?.error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          🔴 {state.error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {isPending ? "Guardando..." : "Guardar cambios"}
        </button>
        <Link
          href="/admin/cupones"
          className="border-brand-purple/25 text-brand-purple-dark hover:bg-brand-purple/5 rounded-md border bg-white px-4 py-2 text-sm font-semibold"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
