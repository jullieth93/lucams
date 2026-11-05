"use client";

/*
 * Formulario interactivo para que clientes con cuenta (`/mi-cuenta/soporte`) o
 * compradores con enlace autenticado (`/soporte/[token]`) respondan en el hilo (`S21`).
 */

import { useActionState, useEffect, useRef, useState } from "react";
import { Loader2, MessageSquarePlus, Send } from "lucide-react";
import {
  replyToCustomerSupportTicketAction,
  replyToGuestSupportTicketAction,
  type CustomerReplyFormState,
} from "@/features/support/customer-reply-actions";

export function CustomerTicketReplyForm(
  props:
    | { mode: "account"; ticketId: string; ticketStatus: string }
    | { mode: "guest"; token: string; ticketStatus: string },
) {
  const action =
    props.mode === "account" ? replyToCustomerSupportTicketAction : replyToGuestSupportTicketAction;
  const [state, dispatch, pending] = useActionState<CustomerReplyFormState, FormData>(action, null);
  const [expanded, setExpanded] = useState(props.mode === "guest");
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
    }
  }, [state]);

  const isClosed = props.ticketStatus === "CLOSED";

  if (!expanded) {
    return (
      <div className="mt-3">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="border-brand-purple/25 text-brand-purple-dark hover:bg-brand-purple/5 inline-flex min-h-10 items-center gap-2 rounded-full border bg-white px-4 py-2 text-xs font-semibold transition-colors"
        >
          <MessageSquarePlus className="h-3.5 w-3.5" />
          {isClosed ? "Escribir de nuevo (reabre la solicitud)" : "Agregar comentario o respuesta"}
        </button>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      action={dispatch}
      className="border-brand-purple/15 mt-4 space-y-2.5 border-t pt-3"
    >
      {props.mode === "account" ? (
        <input type="hidden" name="ticketId" value={props.ticketId} />
      ) : (
        <input type="hidden" name="token" value={props.token} />
      )}

      <label className="text-brand-purple-dark block text-xs font-semibold">
        {isClosed
          ? "¿Necesitas contarnos algo más? Al enviar se reabrirá tu solicitud"
          : "Tu mensaje para el equipo de Lucams"}
        <textarea
          name="body"
          required
          minLength={2}
          maxLength={2000}
          rows={3}
          placeholder="Escribe aquí cualquier detalle adicional sobre tu solicitud…"
          className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 mt-1.5 block w-full rounded-xl border bg-white px-3 py-2 text-sm font-normal focus:ring-2 focus:outline-none"
        />
      </label>

      {state?.error && (
        <p role="alert" className="text-xs font-medium text-rose-700">
          {state.error}
        </p>
      )}
      {state?.ok && state.successMessage && (
        <p role="status" className="text-xs font-medium text-emerald-700">
          {state.successMessage}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="bg-brand-purple hover:bg-brand-purple-dark inline-flex min-h-11 items-center gap-2 rounded-full px-5 py-2 text-xs font-semibold text-white shadow-xs transition-colors disabled:opacity-60"
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          {pending ? "Enviando…" : "Enviar mensaje"}
        </button>

        {props.mode === "account" && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="text-brand-muted hover:text-brand-purple-dark min-h-11 px-3 text-xs font-medium"
          >
            Ocultar
          </button>
        )}
      </div>
    </form>
  );
}
