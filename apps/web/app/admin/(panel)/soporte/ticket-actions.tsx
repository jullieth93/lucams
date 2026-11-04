"use client";

/*
 * Acciones rápidas de estado por ticket de soporte (`S21`) con bloqueo optimista (`expectedUpdatedAt`).
 */

import { useActionState } from "react";
import Link from "next/link";
import { setTicketStatusAction } from "./actions";

type St = { error?: string; success?: string } | null;

function StatusButton({
  id,
  status,
  expectedUpdatedAt,
  action,
  pending,
  label,
  tone,
}: {
  id: string;
  status: "OPEN" | "IN_PROGRESS" | "CLOSED";
  expectedUpdatedAt?: string;
  action: (fd: FormData) => void;
  pending: boolean;
  label: string;
  tone: "purple" | "emerald" | "slate";
}) {
  const cls =
    tone === "emerald"
      ? "bg-emerald-600 hover:bg-emerald-700"
      : tone === "slate"
        ? "bg-slate-600 hover:bg-slate-700"
        : "bg-brand-purple hover:bg-brand-purple-dark";
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      {expectedUpdatedAt && (
        <input type="hidden" name="expectedUpdatedAt" value={expectedUpdatedAt} />
      )}
      <button
        type="submit"
        disabled={pending}
        className={`min-h-9 rounded-md px-3 py-1.5 text-xs font-semibold text-white transition-colors disabled:opacity-60 ${cls}`}
      >
        {pending ? "…" : label}
      </button>
    </form>
  );
}

export function TicketActions({
  id,
  status,
  updatedAtIso,
  hideThreadLink = false,
}: {
  id: string;
  status: string;
  updatedAtIso?: string;
  hideThreadLink?: boolean;
}) {
  const [st, run, pending] = useActionState<St, FormData>(setTicketStatusAction, null);

  return (
    <div className="space-y-2">
      {st && (st.success || st.error) && (
        <p className={`text-xs font-medium ${st.success ? "text-emerald-700" : "text-rose-700"}`}>
          {st.success ?? st.error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {!hideThreadLink && (
          <Link
            href={`/admin/soporte/${id}`}
            className="border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/5 inline-flex min-h-9 items-center rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors"
          >
            Ver hilo
          </Link>
        )}
        {status === "OPEN" && (
          <StatusButton
            id={id}
            status="IN_PROGRESS"
            expectedUpdatedAt={updatedAtIso}
            action={run}
            pending={pending}
            label="Tomar caso"
            tone="purple"
          />
        )}
        {(status === "OPEN" || status === "IN_PROGRESS") && (
          <StatusButton
            id={id}
            status="CLOSED"
            expectedUpdatedAt={updatedAtIso}
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
            expectedUpdatedAt={updatedAtIso}
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
