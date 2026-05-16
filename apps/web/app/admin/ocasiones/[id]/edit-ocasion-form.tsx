"use client";

import { useActionState } from "react";
import { deleteOcasionAction, updateOcasionAction, type OcasionActionState } from "../actions";

type Props = {
  ocasion: {
    id: string;
    slug: string;
    name: string;
    description: string;
    monthHint: number | null;
    suggestedQuantityRange: { min: number; ideal: number; max: number } | null;
    order: number;
    isActive: boolean;
  };
};

export function EditOcasionForm({ ocasion }: Props) {
  const [state, formAction, isPending] = useActionState<OcasionActionState | null, FormData>(
    updateOcasionAction,
    null,
  );

  return (
    <>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="id" value={ocasion.id} />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Nombre</label>
            <input
              name="name"
              defaultValue={ocasion.name}
              required
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Slug</label>
            <input
              name="slug"
              defaultValue={ocasion.slug}
              required
              pattern="[a-z0-9-]+"
              className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Descripción semántica (bot AI)
          </label>
          <textarea
            name="description"
            defaultValue={ocasion.description}
            required
            rows={6}
            minLength={20}
            maxLength={2000}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Mes destacado</label>
            <select
              name="monthHint"
              defaultValue={ocasion.monthHint ?? ""}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">Sin mes específico</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  Mes {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Orden</label>
            <input
              name="order"
              type="number"
              min="0"
              defaultValue={ocasion.order}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <fieldset className="rounded-md border border-slate-200 p-3">
          <legend className="px-2 text-sm font-semibold text-slate-700">Cantidad sugerida</legend>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs text-slate-600">Mínimo</label>
              <input
                name="rangeMin"
                type="number"
                min="1"
                defaultValue={ocasion.suggestedQuantityRange?.min ?? ""}
                className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">Ideal</label>
              <input
                name="rangeIdeal"
                type="number"
                min="1"
                defaultValue={ocasion.suggestedQuantityRange?.ideal ?? ""}
                className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">Máximo</label>
              <input
                name="rangeMax"
                type="number"
                min="1"
                defaultValue={ocasion.suggestedQuantityRange?.max ?? ""}
                className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
              />
            </div>
          </div>
        </fieldset>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={ocasion.isActive}
            className="h-4 w-4 rounded border-slate-300"
          />
          <span className="text-slate-700">Activa (visible al cliente)</span>
        </label>

        {state?.error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            🔴 {state.error}
          </div>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {isPending ? "Guardando..." : "Guardar cambios"}
        </button>
      </form>

      <form action={deleteOcasionAction} className="mt-6 border-t border-slate-200 pt-6">
        <input type="hidden" name="id" value={ocasion.id} />
        <button
          type="submit"
          onClick={(e) => {
            if (!confirm("¿Archivar esta ocasión? Los productos asociados pierden el tag.")) {
              e.preventDefault();
            }
          }}
          className="text-sm font-medium text-red-700 hover:text-red-900"
        >
          🗑 Archivar ocasión
        </button>
      </form>
    </>
  );
}
