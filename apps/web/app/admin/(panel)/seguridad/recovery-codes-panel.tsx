"use client";

/*
 * <RecoveryCodesPanel> — generar/regenerar códigos de respaldo de MFA y
 * mostrarlos una sola vez (Lucy 2026-06-27).
 * El bloque de "una sola vista" (grilla + copiar/descargar) lo comparte con el
 * enrolamiento vía <RecoveryCodesReveal> (Fase 3B, feedback Lucy 2026-09-18).
 */

import { useActionState } from "react";
import { Loader2, KeyRound } from "lucide-react";
import { generateRecoveryCodesAction, type RecoveryCodesState } from "./actions";
import { RecoveryCodesReveal } from "./recovery-codes-reveal";

export function RecoveryCodesPanel({ unusedCount }: { unusedCount: number }) {
  const [state, formAction, pending] = useActionState<RecoveryCodesState | null, FormData>(
    async () => generateRecoveryCodesAction(),
    null,
  );
  const hasCodes = unusedCount > 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <KeyRound className="text-brand-muted h-5 w-5" />
        <h3 className="text-brand-purple-dark font-semibold">Códigos de respaldo</h3>
      </div>
      <p className="text-brand-purple-dark/70 text-sm">
        Son códigos de un solo uso para entrar si pierdes el teléfono. Guárdalos en un lugar seguro.{" "}
        {hasCodes ? (
          <span className="font-semibold">Te quedan {unusedCount} sin usar.</span>
        ) : (
          <span className="text-brand-coral font-semibold">
            Todavía no tienes códigos generados.
          </span>
        )}
      </p>

      {state?.codes && <RecoveryCodesReveal codes={state.codes} />}

      {state?.error && <p className="text-sm text-rose-600">{state.error}</p>}

      <form action={formAction}>
        <button
          type="submit"
          disabled={pending}
          className="border-brand-purple/25 text-brand-purple-dark hover:bg-brand-purple/5 inline-flex items-center gap-1.5 rounded-md border bg-white px-4 py-2 text-sm font-semibold disabled:opacity-60"
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {hasCodes ? "Regenerar códigos de respaldo" : "Generar códigos de respaldo"}
        </button>
      </form>
    </div>
  );
}
