"use client";

import { useActionState } from "react";
import { updateRedirectAction, type RedirectActionState } from "./actions";

type Props = {
  id: string;
  toPath: string;
  statusCode: number;
  description: string | null;
  isActive: boolean;
};

/*
 * Edición inline de un redirect (destino, tipo, descripción, activo). Reusa el
 * patrón de CreateRedirectForm (useActionState + redirect con ?updated=1).
 * El fromPath es INMUTABLE por diseño (features/redirects/service.updateRedirect):
 * cambiar el origen = archivar este y crear uno nuevo.
 */
export function EditRedirectForm(props: Props) {
  const [state, formAction, isPending] = useActionState<RedirectActionState | null, FormData>(
    updateRedirectAction,
    null,
  );

  return (
    <form
      action={formAction}
      className="border-brand-purple/15 mt-2 space-y-2 rounded-md border bg-white p-3 text-left"
    >
      <input type="hidden" name="id" value={props.id} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <label
            htmlFor={`e-to-${props.id}`}
            className="text-brand-purple-dark/70 mb-1 block text-[11px] font-semibold"
          >
            Destino <span className="text-rose-600">*</span>
          </label>
          <input
            id={`e-to-${props.id}`}
            name="toPath"
            required
            defaultValue={props.toPath}
            className="border-brand-purple/25 focus:border-brand-purple focus:ring-brand-purple/20 w-full rounded-md border bg-white px-2 py-1.5 font-mono text-xs focus:ring-2 focus:outline-none"
          />
          {state?.fieldErrors?.toPath && (
            <p className="mt-1 text-xs text-rose-600">{state.fieldErrors.toPath[0]}</p>
          )}
        </div>
        <div>
          <label
            htmlFor={`e-status-${props.id}`}
            className="text-brand-purple-dark/70 mb-1 block text-[11px] font-semibold"
          >
            Tipo
          </label>
          <select
            id={`e-status-${props.id}`}
            name="statusCode"
            defaultValue={String(props.statusCode)}
            className="border-brand-purple/25 focus:border-brand-purple focus:ring-brand-purple/20 w-full rounded-md border bg-white px-2 py-1.5 text-xs focus:ring-2 focus:outline-none"
          >
            <option value="301">301 — Permanente</option>
            <option value="302">302 — Temporal</option>
          </select>
          {state?.fieldErrors?.statusCode && (
            <p className="mt-1 text-xs text-rose-600">{state.fieldErrors.statusCode[0]}</p>
          )}
        </div>
      </div>
      <div>
        <label
          htmlFor={`e-desc-${props.id}`}
          className="text-brand-purple-dark/70 mb-1 block text-[11px] font-semibold"
        >
          Descripción interna (opcional)
        </label>
        <input
          id={`e-desc-${props.id}`}
          name="description"
          defaultValue={props.description ?? ""}
          className="border-brand-purple/25 focus:border-brand-purple focus:ring-brand-purple/20 w-full rounded-md border bg-white px-2 py-1.5 text-xs focus:ring-2 focus:outline-none"
        />
      </div>
      <label className="text-brand-purple-dark inline-flex items-center gap-2 text-xs font-medium">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={props.isActive}
          className="accent-brand-purple"
        />
        Activo
      </label>
      {state?.error && (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs text-rose-700">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="bg-gradient-brand inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Guardando…" : "Guardar cambios"}
      </button>
    </form>
  );
}
