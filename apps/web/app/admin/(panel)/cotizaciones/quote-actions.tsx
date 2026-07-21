"use client";

/*
 * Acciones del detalle de cotización (admin, Etapa 1).
 *
 *   - Cambio de estado: un botón por cada estado DISTINTO al actual, con
 *     confirm() antes de enviar (mismo patrón que finanzas/bloqueos).
 *   - Nota interna: textarea controlado + useActionState; el service hace
 *     APPEND (las entradas se acumulan separadas por "---" y el rastro de
 *     quién/cuándo queda en AdminActionLog).
 */

import { useActionState, useEffect, useState } from "react";
import type { QuoteStatus } from "@lucams/db";
import { setQuoteStatusAction, addQuoteNoteAction } from "./actions";

type St = { error?: string; success?: string } | null;

const NEXT_STATUS_LABEL: Record<QuoteStatus, string> = {
  PENDING: "Volver a pendiente",
  CONTACTED: "Marcar contactada",
  CLOSED: "Marcar cerrada (vendida)",
  DISCARDED: "Descartar",
};

const STATUS_TONE_CLASS: Record<QuoteStatus, string> = {
  PENDING: "bg-amber-500 hover:bg-amber-600",
  CONTACTED: "bg-brand-purple hover:bg-brand-purple-dark",
  CLOSED: "bg-emerald-600 hover:bg-emerald-700",
  DISCARDED: "bg-slate-500 hover:bg-slate-600",
};

const ALL_STATUSES: QuoteStatus[] = ["PENDING", "CONTACTED", "CLOSED", "DISCARDED"];

function StatusButton({
  id,
  number,
  status,
  action,
  pending,
}: {
  id: string;
  number: string;
  status: QuoteStatus;
  action: (fd: FormData) => void;
  pending: boolean;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`¿${NEXT_STATUS_LABEL[status]} la cotización ${number}?`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <button
        type="submit"
        disabled={pending}
        className={`rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60 ${STATUS_TONE_CLASS[status]}`}
      >
        {pending ? "…" : NEXT_STATUS_LABEL[status]}
      </button>
    </form>
  );
}

export function QuoteActions({
  id,
  status,
  number,
}: {
  id: string;
  status: QuoteStatus;
  number: string;
}) {
  const [statusSt, runStatus, statusPending] = useActionState<St, FormData>(
    setQuoteStatusAction,
    null,
  );
  const [noteSt, runNote, notePending] = useActionState<St, FormData>(addQuoteNoteAction, null);
  const [note, setNote] = useState("");

  // Limpiar el textarea solo cuando la nota se guardó OK (no ante error —
  // el texto del admin no se pierde). setState via microtask para satisfacer
  // react-hooks/set-state-in-effect (mismo patrón que admin-shell.tsx).
  useEffect(() => {
    if (noteSt?.success) queueMicrotask(() => setNote(""));
  }, [noteSt]);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-brand-purple-dark/70 mb-2 text-xs font-semibold">Cambiar estado</p>
        {statusSt && (statusSt.success || statusSt.error) && (
          <p className={`mb-2 text-xs ${statusSt.success ? "text-emerald-700" : "text-rose-700"}`}>
            {statusSt.success ?? statusSt.error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {ALL_STATUSES.filter((s) => s !== status).map((s) => (
            <StatusButton
              key={s}
              id={id}
              number={number}
              status={s}
              action={runStatus}
              pending={statusPending}
            />
          ))}
        </div>
      </div>

      <div className="border-brand-purple/10 border-t pt-3">
        <label
          htmlFor="quote-internal-note"
          className="text-brand-purple-dark/70 mb-1.5 block text-xs font-semibold"
        >
          Agregar nota interna
        </label>
        <form action={runNote} className="space-y-2">
          <input type="hidden" name="id" value={id} />
          <textarea
            id="quote-internal-note"
            name="note"
            rows={3}
            maxLength={2000}
            required
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ej. cliente pide factura, precio acordado $…, llamar después de las 5pm…"
            className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 w-full rounded-md border bg-white px-3 py-2 text-sm focus:ring-2 focus:outline-none"
          />
          {noteSt && (noteSt.success || noteSt.error) && (
            <p className={`text-xs ${noteSt.success ? "text-emerald-700" : "text-rose-700"}`}>
              {noteSt.success ?? noteSt.error}
            </p>
          )}
          <button
            type="submit"
            disabled={notePending || !note.trim()}
            className="bg-brand-purple hover:bg-brand-purple-dark rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
          >
            {notePending ? "Guardando…" : "Guardar nota"}
          </button>
        </form>
        <p className="text-brand-muted mt-1.5 text-[10px]">
          Las notas se acumulan (no se reemplazan) y solo las ve el equipo.
        </p>
      </div>
    </div>
  );
}
