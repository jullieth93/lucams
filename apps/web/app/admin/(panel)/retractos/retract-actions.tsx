"use client";

/*
 * F3 — botones de gestión por solicitud de retracto (admin). Muestra las acciones
 * legales según el estado. El dinero se emite manualmente; "Reembolsar" solo lo
 * registra + avisa al cliente.
 */

import { useActionState } from "react";
import {
  approveRetractAction,
  rejectRetractAction,
  receiveRetractAction,
  refundRetractAction,
} from "./actions";

type St = { error?: string; success?: string } | null;

export function RetractActions({ id, status }: { id: string; status: string }) {
  const [approveSt, approve, approvePending] = useActionState<St, FormData>(approveRetractAction, null);
  const [rejectSt, reject, rejectPending] = useActionState<St, FormData>(rejectRetractAction, null);
  const [receiveSt, receive, receivePending] = useActionState<St, FormData>(receiveRetractAction, null);
  const [refundSt, refund, refundPending] = useActionState<St, FormData>(refundRetractAction, null);

  const msg = approveSt ?? rejectSt ?? receiveSt ?? refundSt;

  return (
    <div className="space-y-2">
      {msg && (msg.success || msg.error) && (
        <p className={`text-xs ${msg.success ? "text-emerald-700" : "text-rose-700"}`}>
          {msg.success ?? msg.error}
        </p>
      )}

      {status === "PENDING" && (
        <div className="flex flex-wrap items-start gap-2">
          <form action={approve}>
            <input type="hidden" name="id" value={id} />
            <button
              type="submit"
              disabled={approvePending}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {approvePending ? "…" : "Aprobar"}
            </button>
          </form>
          <RejectForm id={id} action={reject} pending={rejectPending} />
        </div>
      )}

      {status === "APPROVED" && (
        <div className="flex flex-wrap items-start gap-2">
          <form action={receive}>
            <input type="hidden" name="id" value={id} />
            <button
              type="submit"
              disabled={receivePending}
              className="bg-brand-purple hover:bg-brand-purple-dark rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
            >
              {receivePending ? "…" : "Marcar recibido"}
            </button>
          </form>
          <RejectForm id={id} action={reject} pending={rejectPending} />
        </div>
      )}

      {status === "RECEIVED" && (
        <form action={refund} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={id} />
          <select
            name="method"
            aria-label="Método de reembolso"
            className="border-brand-purple/20 focus:ring-brand-purple/30 rounded-md border px-2 py-1.5 text-xs focus:ring-2 focus:outline-none"
          >
            <option value="WOMPI_VOID">Reversa Wompi</option>
            <option value="BANK_TRANSFER">Transferencia</option>
          </select>
          <button
            type="submit"
            disabled={refundPending}
            className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
          >
            {refundPending ? "…" : "Registrar reembolso"}
          </button>
        </form>
      )}

      {status === "REFUNDED" && (
        <p className="text-[11px] text-amber-700">💡 Emite el dinero en Wompi/transferencia.</p>
      )}
    </div>
  );
}

function RejectForm({
  id,
  action,
  pending,
}: {
  id: string;
  action: (formData: FormData) => void;
  pending: boolean;
}) {
  return (
    <details>
      <summary className="cursor-pointer list-none rounded-md border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50">
        Rechazar
      </summary>
      <form action={action} className="mt-2 flex flex-col gap-2">
        <input type="hidden" name="id" value={id} />
        <input
          name="note"
          required
          maxLength={200}
          placeholder="Motivo del rechazo"
          className="border-brand-purple/20 focus:ring-brand-purple/30 rounded-md border px-2 py-1.5 text-xs focus:ring-2 focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="self-start rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
        >
          {pending ? "…" : "Confirmar rechazo"}
        </button>
      </form>
    </details>
  );
}
