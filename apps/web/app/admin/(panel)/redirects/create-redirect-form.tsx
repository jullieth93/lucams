"use client";

import { useActionState } from "react";
import { createRedirectAction, type RedirectActionState } from "./actions";

export function CreateRedirectForm() {
  const [state, formAction, isPending] = useActionState<RedirectActionState | null, FormData>(
    createRedirectAction,
    null,
  );

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label
            htmlFor="r-from"
            className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold"
          >
            Ruta de origen <span className="text-rose-600">*</span>
          </label>
          <input
            id="r-from"
            name="fromPath"
            required
            placeholder="/garantia"
            className="border-brand-purple/25 focus:border-brand-purple focus:ring-brand-purple/20 w-full rounded-md border bg-white px-3 py-2 font-mono text-xs focus:ring-2 focus:outline-none"
          />
          {state?.fieldErrors?.fromPath && (
            <p className="mt-1 text-xs text-rose-600">{state.fieldErrors.fromPath[0]}</p>
          )}
          <p className="text-brand-muted mt-1 text-xs">
            La ruta vieja que quieres redirigir. Ej: <code>/garantia</code>,{" "}
            <code>/promo-mama-2024</code>.
          </p>
        </div>
        <div>
          <label
            htmlFor="r-to"
            className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold"
          >
            Destino <span className="text-rose-600">*</span>
          </label>
          <input
            id="r-to"
            name="toPath"
            required
            placeholder="/legal/garantias"
            className="border-brand-purple/25 focus:border-brand-purple focus:ring-brand-purple/20 w-full rounded-md border bg-white px-3 py-2 font-mono text-xs focus:ring-2 focus:outline-none"
          />
          {state?.fieldErrors?.toPath && (
            <p className="mt-1 text-xs text-rose-600">{state.fieldErrors.toPath[0]}</p>
          )}
          <p className="text-brand-muted mt-1 text-xs">
            Adónde mandar al visitante. Ruta interna (<code>/legal/garantias</code>) o URL externa
            completa.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label
            htmlFor="r-status"
            className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold"
          >
            Tipo
          </label>
          <select
            id="r-status"
            name="statusCode"
            defaultValue="301"
            className="border-brand-purple/25 focus:border-brand-purple focus:ring-brand-purple/20 w-full rounded-md border bg-white px-3 py-2 text-sm focus:ring-2 focus:outline-none"
          >
            <option value="301">301 — Permanente (recomendado, transfiere SEO)</option>
            <option value="302">302 — Temporal (no transfiere SEO)</option>
          </select>
          {state?.fieldErrors?.statusCode && (
            <p className="mt-1 text-xs text-rose-600">{state.fieldErrors.statusCode[0]}</p>
          )}
        </div>
        <div>
          <label
            htmlFor="r-desc"
            className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold"
          >
            Descripción interna (opcional)
          </label>
          <input
            id="r-desc"
            name="description"
            placeholder="Ej: link viejo de Instagram bio"
            className="border-brand-purple/25 focus:border-brand-purple focus:ring-brand-purple/20 w-full rounded-md border bg-white px-3 py-2 text-sm focus:ring-2 focus:outline-none"
          />
        </div>
      </div>
      <label className="text-brand-purple-dark inline-flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" name="isActive" defaultChecked className="accent-brand-purple" />
        Activar inmediatamente
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
        {isPending ? "Creando…" : "Crear redirect"}
      </button>
    </form>
  );
}
