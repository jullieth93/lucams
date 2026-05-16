"use client";

import { useActionState } from "react";
import { createOcasionAction, type OcasionActionState } from "./actions";

export function CreateOcasionForm() {
  const [state, formAction, isPending] = useActionState<OcasionActionState | null, FormData>(
    createOcasionAction,
    null,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="name" className="mb-1 block text-sm font-medium text-slate-700">
            Nombre <span className="text-red-600">*</span>
          </label>
          <input
            id="name"
            name="name"
            required
            placeholder="ej. Cumpleaños"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none"
          />
          {state?.fieldErrors?.name && (
            <p className="mt-1 text-xs text-red-600">{state.fieldErrors.name[0]}</p>
          )}
        </div>

        <div>
          <label htmlFor="slug" className="mb-1 block text-sm font-medium text-slate-700">
            Slug <span className="text-red-600">*</span>{" "}
            <span className="text-xs text-slate-500">
              (URL: /ocasion/<em>slug</em>)
            </span>
          </label>
          <input
            id="slug"
            name="slug"
            required
            pattern="[a-z0-9-]+"
            placeholder="ej. cumpleanos"
            className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm focus:border-purple-500 focus:outline-none"
          />
          {state?.fieldErrors?.slug && (
            <p className="mt-1 text-xs text-red-600">{state.fieldErrors.slug[0]}</p>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="description" className="mb-1 block text-sm font-medium text-slate-700">
          Descripción semántica <span className="text-red-600">*</span>
        </label>
        <p className="mb-2 text-xs text-slate-500">
          Texto que el bot de WhatsApp futuro usará para entender qué es esta ocasión. Mínimo 20
          caracteres. Describe contexto colombiano: cuándo se celebra, qué busca el cliente, qué
          productos recomendarías.
        </p>
        <textarea
          id="description"
          name="description"
          required
          rows={5}
          minLength={20}
          maxLength={2000}
          placeholder="ej. Cumpleaños en Colombia es ocasión clave para regalos personalizados. Lo común es regalar imanes con foto del cumpleañero/a + nombre + edad..."
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none"
        />
        {state?.fieldErrors?.description && (
          <p className="mt-1 text-xs text-red-600">{state.fieldErrors.description[0]}</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="monthHint" className="mb-1 block text-sm font-medium text-slate-700">
            Mes destacado{" "}
            <span className="text-xs text-slate-500">(opcional — para auto-rotación menú)</span>
          </label>
          <select
            id="monthHint"
            name="monthHint"
            defaultValue=""
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-purple-500 focus:outline-none"
          >
            <option value="">Sin mes específico</option>
            <option value="1">Enero</option>
            <option value="2">Febrero</option>
            <option value="3">Marzo</option>
            <option value="4">Abril</option>
            <option value="5">Mayo (Día Madre)</option>
            <option value="6">Junio (Día Padre)</option>
            <option value="7">Julio</option>
            <option value="8">Agosto</option>
            <option value="9">Septiembre (Amor y Amistad)</option>
            <option value="10">Octubre (Halloween)</option>
            <option value="11">Noviembre (Grados)</option>
            <option value="12">Diciembre (Navidad)</option>
          </select>
        </div>

        <div>
          <label htmlFor="order" className="mb-1 block text-sm font-medium text-slate-700">
            Orden de aparición
          </label>
          <input
            id="order"
            name="order"
            type="number"
            min="0"
            defaultValue="0"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none"
          />
        </div>
      </div>

      <fieldset className="rounded-md border border-slate-200 p-3">
        <legend className="px-2 text-sm font-semibold text-slate-700">
          Cantidad sugerida (opcional)
        </legend>
        <p className="mb-2 text-xs text-slate-500">
          Rango típico de unidades para esta ocasión. El bot recomendará variants según.
        </p>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label htmlFor="rangeMin" className="mb-1 block text-xs text-slate-600">
              Mínimo
            </label>
            <input
              id="rangeMin"
              name="rangeMin"
              type="number"
              min="1"
              placeholder="ej. 10"
              className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label htmlFor="rangeIdeal" className="mb-1 block text-xs text-slate-600">
              Ideal
            </label>
            <input
              id="rangeIdeal"
              name="rangeIdeal"
              type="number"
              min="1"
              placeholder="ej. 20"
              className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label htmlFor="rangeMax" className="mb-1 block text-xs text-slate-600">
              Máximo
            </label>
            <input
              id="rangeMax"
              name="rangeMax"
              type="number"
              min="1"
              placeholder="ej. 40"
              className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </div>
        </div>
      </fieldset>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked
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
        {isPending ? "Creando..." : "Crear ocasión"}
      </button>
    </form>
  );
}
