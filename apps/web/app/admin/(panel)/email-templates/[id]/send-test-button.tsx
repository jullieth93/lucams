"use client";

/*
 * Botón "Enviarme una prueba" (Fase 4): dispara la Server Action que renderiza
 * la plantilla con su sample data (overrides incluidos) y la envía al email
 * del admin logueado vía Resend. Muestra el resultado inline.
 */

import { useActionState } from "react";
import { Send } from "lucide-react";
import { sendTestEmailAction, type EmailTemplateActionState } from "../actions";

export function SendTestButton({ templateId }: { templateId: string }) {
  const [state, formAction, isPending] = useActionState<EmailTemplateActionState | null, FormData>(
    sendTestEmailAction,
    null,
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="templateId" value={templateId} />
      <button
        type="submit"
        disabled={isPending}
        className="bg-brand-purple hover:bg-brand-purple-dark inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold text-white transition-colors disabled:opacity-50"
      >
        <Send className="h-3.5 w-3.5" />
        {isPending ? "Enviando…" : "Enviarme una prueba"}
      </button>
      {state?.error && <p className="mt-2 text-xs text-rose-600">{state.error}</p>}
      {state?.ok && <p className="mt-2 text-xs text-emerald-700">{state.message}</p>}
    </form>
  );
}
