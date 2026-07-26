"use client";

/*
 * Acciones por mensaje en /admin/mensajes. Botones según el estado actual
 * (marcar en proceso / cerrar / reabrir) + enlace "Responder" (mailto) que abre
 * el correo de Lucy con destinatario y asunto ya armados — no hay sistema de
 * respuesta in-app, el cliente recibe la contestación por email.
 *
 * "Cerrar" no pide confirmación: no es destructivo (se puede reabrir) y pedir
 * confirmación en cada cierre volvería lento el triaje diario.
 */

import { useActionState } from "react";
import { setMessageStatusAction } from "./actions";

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
        className={`rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-white disabled:opacity-60 ${cls}`}
      >
        {pending ? "…" : label}
      </button>
    </form>
  );
}

export function MessageActions({
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
  const [st, run, pending] = useActionState<St, FormData>(setMessageStatusAction, null);
  const mailto = `mailto:${email}?subject=${encodeURIComponent(`Re: ${subjectLabel} — Lucams_shop`)}`;

  return (
    <div className="space-y-2">
      {st && (st.success || st.error) && (
        <p className={`text-xs ${st.success ? "text-emerald-700" : "text-rose-700"}`}>
          {st.success ?? st.error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <a
          href={mailto}
          className="border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/5 rounded-md border px-3 py-1.5 text-xs font-semibold whitespace-nowrap"
        >
          ✉️ Responder
        </a>
        {status === "OPEN" && (
          <StatusButton
            id={id}
            status="IN_PROGRESS"
            action={run}
            pending={pending}
            label="Marcar en proceso"
            tone="purple"
          />
        )}
        {(status === "OPEN" || status === "IN_PROGRESS") && (
          <StatusButton
            id={id}
            status="CLOSED"
            action={run}
            pending={pending}
            label="Cerrar"
            tone="emerald"
          />
        )}
        {status === "CLOSED" && (
          <StatusButton
            id={id}
            status="OPEN"
            action={run}
            pending={pending}
            label="Reabrir"
            tone="slate"
          />
        )}
      </div>
    </div>
  );
}
