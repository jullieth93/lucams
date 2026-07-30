"use client";

import { useActionState } from "react";
import { Loader2, Search } from "lucide-react";
import { rastrearAction, type RastrearState } from "./actions";

// Textos visibles del formulario: los resuelve el padre server (page.tsx)
// desde el CMS y los baja por props — un client component no puede leer el CMS.
export type RastrearTexts = {
  numberLabel: string;
  numberHelp: string;
  emailLabel: string;
  submit: string;
};

export function RastrearForm({ texts }: { texts: RastrearTexts }) {
  const [state, formAction, pending] = useActionState<RastrearState, FormData>(
    rastrearAction,
    null,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="number" className="text-brand-purple-dark mb-1 block text-sm font-semibold">
          {texts.numberLabel}
        </label>
        <input
          id="number"
          name="number"
          required
          autoComplete="off"
          placeholder="LCM-2026-0001"
          className="border-brand-purple/25 focus:border-brand-purple focus:ring-brand-purple/20 w-full rounded-md border bg-white px-3 py-2 text-sm focus:ring-2 focus:outline-none"
        />
        <p className="text-brand-muted mt-1 text-xs">{texts.numberHelp}</p>
      </div>

      <div>
        <label htmlFor="email" className="text-brand-purple-dark mb-1 block text-sm font-semibold">
          {texts.emailLabel}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="tucorreo@ejemplo.com"
          className="border-brand-purple/25 focus:border-brand-purple focus:ring-brand-purple/20 w-full rounded-md border bg-white px-3 py-2 text-sm focus:ring-2 focus:outline-none"
        />
      </div>

      {state?.error && (
        <p
          role="alert"
          className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
        >
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="bg-gradient-brand inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-md text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        {texts.submit}
      </button>
    </form>
  );
}
