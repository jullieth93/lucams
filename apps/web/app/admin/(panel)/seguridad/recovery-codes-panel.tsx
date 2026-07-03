"use client";

/*
 * <RecoveryCodesPanel> — generar/regenerar códigos de respaldo de MFA y
 * mostrarlos una sola vez (Lucy 2026-06-27).
 */

import { useActionState, useState } from "react";
import { Loader2, KeyRound, Copy, Check, AlertTriangle } from "lucide-react";
import { generateRecoveryCodesAction, type RecoveryCodesState } from "./actions";

export function RecoveryCodesPanel({ unusedCount }: { unusedCount: number }) {
  const [state, formAction, pending] = useActionState<RecoveryCodesState | null, FormData>(
    async () => generateRecoveryCodesAction(),
    null,
  );
  const [copied, setCopied] = useState(false);
  const hasCodes = unusedCount > 0;

  function copyAll(codes: string[]) {
    navigator.clipboard?.writeText(codes.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <KeyRound className="text-brand-muted h-5 w-5" />
        <h3 className="text-brand-purple-dark font-semibold">Códigos de respaldo</h3>
      </div>
      <p className="text-brand-purple-dark/70 text-sm">
        Son códigos de un solo uso para entrar si pierdes el teléfono. Guárdalos en un lugar
        seguro.{" "}
        {hasCodes ? (
          <span className="font-semibold">Te quedan {unusedCount} sin usar.</span>
        ) : (
          <span className="text-brand-coral font-semibold">
            Todavía no tienes códigos generados.
          </span>
        )}
      </p>

      {state?.codes && (
        <div className="border-brand-purple/15 bg-brand-cream/40 rounded-lg border p-4">
          <div className="mb-2 flex items-center gap-2 text-amber-700">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-xs font-semibold">
              Cópialos AHORA — no los volverás a ver. Si los regeneras, los anteriores dejan de
              servir.
            </span>
          </div>
          <ul className="grid grid-cols-2 gap-1.5 font-mono text-sm">
            {state.codes.map((c) => (
              <li
                key={c}
                className="text-brand-purple-dark rounded bg-white px-2 py-1 text-center tracking-wider"
              >
                {c}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => copyAll(state.codes!)}
            className="border-brand-purple/25 text-brand-purple-dark hover:bg-brand-purple/10 mt-3 inline-flex items-center gap-1.5 rounded-md border bg-white px-3 py-1.5 text-xs font-semibold"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "¡Copiados!" : "Copiar todos"}
          </button>
        </div>
      )}

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
