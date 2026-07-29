"use client";

/*
 * Formulario de Material — se usa en dos contextos:
 *   - mode="create": card "Agregar material" al tope de la página.
 *   - mode="edit":   <details> desplegable dentro de cada fila de la tabla.
 *
 * Un solo componente para no duplicar campos; la action cambia según el modo.
 * El costo por unidad se pide en PESOS (ej. 2500) y la action lo guarda
 * en centavos COP — el admin nunca ve centavos.
 */

import { useActionState } from "react";
import { createMaterialAction, updateMaterialAction, type MaterialActionState } from "./actions";

export type MaterialFormValues = {
  id: string;
  name: string;
  unit: string;
  stock: number;
  minStock: number;
  /** Costo por unidad YA convertido a pesos (centavos/100) para mostrar en el input. */
  costPerUnitPesos: number | null;
  note: string | null;
  isActive: boolean;
};

// Mismo catálogo de unidades que valida la action (schema model Material.unit).
const UNIT_OPTIONS = ["unidad", "pliego", "metro", "ml", "paquete"] as const;

const inputCls =
  "border-brand-purple/25 focus:border-brand-purple focus:ring-brand-purple/20 w-full rounded-md border bg-white px-3 py-2 text-sm focus:ring-2 focus:outline-none";
const labelCls = "text-brand-purple-dark/70 mb-1 block text-xs font-semibold";

export function MaterialForm({
  mode,
  material,
}: {
  mode: "create" | "edit";
  material?: MaterialFormValues;
}) {
  const action = mode === "create" ? createMaterialAction : updateMaterialAction;
  const [state, formAction, isPending] = useActionState<MaterialActionState | null, FormData>(
    action,
    null,
  );

  return (
    <form action={formAction} className="space-y-3">
      {mode === "edit" && material && <input type="hidden" name="id" value={material.id} />}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label htmlFor={`m-name-${material?.id ?? "new"}`} className={labelCls}>
            Nombre <span className="text-rose-600">*</span>
          </label>
          <input
            id={`m-name-${material?.id ?? "new"}`}
            name="name"
            required
            maxLength={120}
            defaultValue={material?.name ?? ""}
            placeholder="Ej: Papel fotográfico 200g"
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor={`m-unit-${material?.id ?? "new"}`} className={labelCls}>
            Unidad <span className="text-rose-600">*</span>
          </label>
          <select
            id={`m-unit-${material?.id ?? "new"}`}
            name="unit"
            defaultValue={material?.unit ?? "unidad"}
            className={inputCls}
          >
            {UNIT_OPTIONS.map((u) => (
              <option key={u} value={u}>
                {u.charAt(0).toUpperCase() + u.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div>
          <label htmlFor={`m-stock-${material?.id ?? "new"}`} className={labelCls}>
            Stock actual <span className="text-rose-600">*</span>
          </label>
          <input
            id={`m-stock-${material?.id ?? "new"}`}
            name="stock"
            type="number"
            required
            min="0"
            step="any"
            defaultValue={material?.stock ?? 0}
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor={`m-min-${material?.id ?? "new"}`} className={labelCls}>
            Stock mínimo <span className="text-rose-600">*</span>
          </label>
          <input
            id={`m-min-${material?.id ?? "new"}`}
            name="minStock"
            type="number"
            required
            min="0"
            step="any"
            defaultValue={material?.minStock ?? 0}
            className={inputCls}
          />
          <p className="text-brand-muted mt-1 text-xs">
            Si el stock baja de este número, verás la alerta “Bajo stock”.
          </p>
        </div>
        <div>
          <label htmlFor={`m-cost-${material?.id ?? "new"}`} className={labelCls}>
            Costo por unidad (pesos, opcional)
          </label>
          <input
            id={`m-cost-${material?.id ?? "new"}`}
            name="costPerUnit"
            type="number"
            min="0"
            step="1"
            defaultValue={material?.costPerUnitPesos ?? ""}
            placeholder="Ej: 2500"
            className={inputCls}
          />
          <p className="text-brand-muted mt-1 text-xs">
            En pesos, sin puntos ni decimales. Sirve para costear la fabricación.
          </p>
        </div>
      </div>

      <div>
        <label htmlFor={`m-note-${material?.id ?? "new"}`} className={labelCls}>
          Nota (opcional)
        </label>
        <input
          id={`m-note-${material?.id ?? "new"}`}
          name="note"
          maxLength={300}
          defaultValue={material?.note ?? ""}
          placeholder="Ej: proveedor, referencia, dónde se guarda…"
          className={inputCls}
        />
      </div>

      <label className="text-brand-purple-dark inline-flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={material?.isActive ?? true}
          className="accent-brand-purple"
        />
        Activo (disponible para producción)
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
        {isPending ? "Guardando…" : mode === "create" ? "Agregar material" : "Guardar cambios"}
      </button>
    </form>
  );
}
