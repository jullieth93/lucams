"use client";

/*
 * P2 backoffice — acciones por ticket de soporte (admin). Botones de estado según el estado
 * actual + un enlace "Responder" (mailto) para que Lucy conteste desde su correo con el asunto
 * y destinatario ya armados.
 */

import { useActionState } from "react";
import { setTicketStatusAction } from "./actions";

type St = { error?: string; success?: string } | null;

function StatusButton({
  id,
  status,
  action,
  pending,
  label,
  tone,
}: {
  id: string;
  status: "OPEN" | "IN_PROGRESS" | "CLOSED";
  action: (fd: FormData) => void;
  pending: boolean;
  label: string;
  tone: "purple" | "emerald" | "slate";
}) {
  const cls =
    tone === "emerald"
      ? "bg-emerald-600 hover:bg-emerald-700"
      : tone === "slate"
        ? "bg-slate-500 hover:bg-slate-600"
        : "bg-brand-purple hover:bg-brand-purple-dark";
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <button
        type="submit"
        disabled={pending}
        className={`rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60 ${cls}`}
      >
        {pending ? "…" : label}
      </button>
    </form>
  );
}

export function TicketActions({
  id,
  status,
  email,
  subjectLabel,
}: {
  id: string;
  status: string;
  email: string;
  subjectLabel: string;
}) {
  const [st, run, pending] = useActionState<St, FormData>(setTicketStatusAction, null);
  const mailto = `mailto:${email}?subject=${encodeURIComponent(`Re: ${subjectLabel} — Lucams_shop`)}`;

  return (
    <div className="space-y-2">
      {st && (st.success || st.error) && (
        <p className={`text-xs ${st.success ? "text-emerald-700" : "text-rose-700"}`}>
          {st.success ?? st.error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={mailto}
          className="border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/5 rounded-md border px-3 py-1.5 text-xs font-semibold"
        >
          ✉️ Responder
        </a>
        {status === "OPEN" && (
          <StatusButton id={id} status="IN_PROGRESS" action={run} pending={pending} label="Tomar" tone="purple" />
        )}
        {(status === "OPEN" || status === "IN_PROGRESS") && (
          <StatusButton id={id} status="CLOSED" action={run} pending={pending} label="Cerrar" tone="emerald" />
        )}
        {status === "CLOSED" && (
          <StatusButton id={id} status="OPEN" action={run} pending={pending} label="Reabrir" tone="slate" />
        )}
      </div>
    </div>
  );
}
