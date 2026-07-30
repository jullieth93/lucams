"use client";

import { useActionState } from "react";
import { promoteAdminAction, type PromoteAdminState } from "./actions";

export function PromoteForm() {
  const [state, formAction, isPending] = useActionState<PromoteAdminState | null, FormData>(
    promoteAdminAction,
    null,
  );

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="md:col-span-2">
          <label
            htmlFor="promote-email"
            className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold"
          >
            Email del nuevo admin <span className="text-rose-600">*</span>
          </label>
          <input
            id="promote-email"
            name="email"
            type="email"
            required
            placeholder="ej. operaciones@lucamsshop.com"
            className="border-brand-purple/25 focus:border-brand-purple focus:ring-brand-purple/20 w-full rounded-md border bg-white px-3 py-2 text-sm focus:ring-2 focus:outline-none"
          />
          {state?.fieldErrors?.email && (
            <p className="mt-1 text-xs text-rose-600">{state.fieldErrors.email[0]}</p>
          )}
          <p className="text-brand-muted mt-1 text-xs">
            La persona debe estar registrada como cliente primero (signup público).
          </p>
        </div>
        <div>
          <label
            htmlFor="promote-role"
            className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold"
          >
            Rol <span className="text-rose-600">*</span>
          </label>
          <select
            id="promote-role"
            name="role"
            defaultValue="MANAGER"
            className="border-brand-purple/25 focus:border-brand-purple focus:ring-brand-purple/20 w-full rounded-md border bg-white px-3 py-2 text-sm focus:ring-2 focus:outline-none"
          >
            <option value="SUPERADMIN">SUPERADMIN — control total</option>
            <option value="MANAGER">MANAGER — operación + contenido</option>
            <option value="FULFILLMENT">FULFILLMENT — solo pedidos + envíos</option>
            <option value="CMS_EDITOR">CMS_EDITOR — solo contenido del sitio</option>
          </select>
          {state?.fieldErrors?.role && (
            <p className="mt-1 text-xs text-rose-600">{state.fieldErrors.role[0]}</p>
          )}
        </div>
      </div>
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
        {isPending ? "Promoviendo…" : "Promover a admin"}
      </button>
    </form>
  );
}
