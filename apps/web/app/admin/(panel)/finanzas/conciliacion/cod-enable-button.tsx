"use client";

/*
 * Botón "Activar contraentrega" del banner de estado COD (Fase 3D). Vive en el
 * banner ámbar cuando COD_ENABLED ≠ "true"; escribe el ajuste vía
 * setCodEnabledAction (SUPERADMIN + MFA aal2, ver actions.ts).
 */

import { useActionState } from "react";
import { Loader2, Power } from "lucide-react";
import { setCodEnabledAction } from "./actions";

export function CodEnableButton() {
  const [state, dispatch, pending] = useActionState(setCodEnabledAction, null);

  return (
    <span className="mt-1.5 block">
      <form action={dispatch} className="inline">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-60"
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Power className="h-3.5 w-3.5" aria-hidden />
          )}
          {pending ? "Activando…" : "Activar contraentrega"}
        </button>
      </form>
      {state?.error && (
        <span className="mt-1 block rounded-md bg-rose-50 p-1.5 text-[11px] text-rose-800">
          {state.error}
        </span>
      )}
      {state?.success && (
        <span className="mt-1 block rounded-md bg-emerald-50 p-1.5 text-[11px] text-emerald-800">
          {state.success}
        </span>
      )}
    </span>
  );
}
