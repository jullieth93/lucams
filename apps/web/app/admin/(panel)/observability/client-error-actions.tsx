"use client";

import { useTransition } from "react";
import { Check, EyeOff } from "lucide-react";
import { resolveClientErrorAction, ignoreClientErrorAction } from "./actions";

/**
 * Botones de triage para un ErrorReport (Bloque D). "Resolver" = arreglado;
 * "Ignorar" = ruido conocido (extensiones del navegador, etc.). Ambos lo sacan
 * de la lista de abiertos (revalidatePath en el server action).
 */
export function ClientErrorActions({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-shrink-0 items-center gap-1.5">
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => resolveClientErrorAction(id))}
        className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-200 disabled:opacity-50"
        title="Marcar como resuelto"
      >
        <Check className="h-3 w-3" /> Resolver
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => ignoreClientErrorAction(id))}
        className="text-brand-muted inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold transition-colors hover:bg-slate-200 disabled:opacity-50"
        title="Ignorar (ruido conocido)"
      >
        <EyeOff className="h-3 w-3" /> Ignorar
      </button>
    </div>
  );
}
