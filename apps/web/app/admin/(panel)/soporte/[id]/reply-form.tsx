"use client";

/*
 * Form de respuesta del hilo del ticket (admin). Un solo form con checkbox
 * "nota interna": respuesta pública (email al cliente) o nota solo para el equipo.
 */

import { useActionState, useRef, useEffect } from "react";
import { replyTicketAction } from "../actions";

type St = { error?: string; success?: string } | null;

export function ReplyForm({ ticketId, disabled }: { ticketId: string; disabled: boolean }) {
  const [st, run, pending] = useActionState<St, FormData>(replyTicketAction, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (st?.success) formRef.current?.reset();
  }, [st]);

  if (disabled) {
    return (
      <p className="text-brand-muted mt-2 text-sm">
        El ticket está cerrado — reábrelo si necesitas responder algo más.
      </p>
    );
  }

  return (
    <form ref={formRef} action={run} className="mt-3 space-y-2">
      <input type="hidden" name="id" value={ticketId} />
      <textarea
        name="body"
        required
        minLength={2}
        maxLength={2000}
        rows={4}
        placeholder="Escribe la respuesta para el cliente…"
        className="border-brand-purple/20 focus:ring-brand-purple/30 w-full rounded-md border bg-white px-3 py-2 text-sm focus:ring-2 focus:outline-none"
      />
      <label className="text-brand-purple-dark/80 flex items-center gap-2 text-xs">
        <input type="checkbox" name="internal" className="accent-brand-purple" />
        Nota interna (no se envía al cliente ni se muestra en su cuenta)
      </label>
      {st && (st.success || st.error) && (
        <p className={`text-xs ${st.success ? "text-emerald-700" : "text-rose-700"}`}>
          {st.success ?? st.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="bg-brand-purple hover:bg-brand-purple-dark rounded-md px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Enviando…" : "Guardar en el hilo"}
      </button>
    </form>
  );
}
