"use client";

import { useActionState, useState } from "react";
import { createCouponAction, type CouponActionState } from "./actions";

export function CreateCouponForm() {
  const [state, formAction, isPending] = useActionState<CouponActionState | null, FormData>(
    createCouponAction,
    null,
  );
  const [type, setType] = useState<"PERCENT" | "FIXED" | "FREE_SHIPPING">("PERCENT");

  const today = new Date().toISOString().slice(0, 10);
  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const nextMonthStr = nextMonth.toISOString().slice(0, 10);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Código <span className="text-red-600">*</span>
          </label>
          <input
            name="code"
            required
            placeholder="ej. MAMA2026"
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
            {type === "FIXED" && <span className="text-xs text-slate-500"> (COP centavos)</span>}
            {type === "FREE_SHIPPING" && <span className="text-xs text-slate-500"> (n/a)</span>}
          </label>
          <input
            name="value"
            type="number"
            min={type === "PERCENT" ? 1 : 0}
            max={type === "PERCENT" ? 100 : undefined}
            required
            defaultValue={type === "FREE_SHIPPING" ? 0 : ""}
            disabled={type === "FREE_SHIPPING"}
            placeholder={type === "PERCENT" ? "15" : type === "FIXED" ? "500000" : "—"}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Descripción pública (bot AI)
        </label>
        <input
          name="description"
          maxLength={200}
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
            defaultValue={today}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Válido hasta <span className="text-red-600">*</span>
          </label>
          <input
            name="validTo"
            type="date"
            required
            defaultValue={nextMonthStr}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <fieldset className="rounded-md border border-slate-200 p-3">
        <legend className="px-2 text-sm font-semibold text-slate-700">
          Restricciones (opcional)
        </legend>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-slate-600">Mínimo orden (COP)</label>
            <input
              name="minOrder"
              type="number"
              min="0"
              placeholder="ej. 5000000"
              className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-600">Mínimo cantidad unidades</label>
            <input
              name="requiresMinQuantity"
              type="number"
              min="1"
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
            defaultChecked
            className="h-4 w-4 rounded border-slate-300"
          />
          <span className="text-slate-700">Activo</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isPublic" className="h-4 w-4 rounded border-slate-300" />
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
          {isPending ? "Creando..." : "Crear cupón"}
        </button>
        {/* 6b: Cancelar limpia el form y cierra el colapsable. */}
        <button
          type="reset"
          disabled={isPending}
          onClick={(e) => e.currentTarget.closest("details")?.removeAttribute("open")}
          className="border-brand-purple/25 text-brand-purple-dark hover:bg-brand-purple/5 rounded-md border bg-white px-4 py-2 text-sm font-semibold disabled:opacity-60"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
