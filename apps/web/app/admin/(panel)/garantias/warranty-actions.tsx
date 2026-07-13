"use client";

/*
 * P2 backoffice — acciones por reclamo de garantía (admin). Flujo Ley 1480:
 * PENDING → IN_REVIEW → APPROVED (elige remedio) → RESOLVED · o REJECTED (motivo).
 */

import { useActionState } from "react";
import {
  reviewWarrantyAction,
  approveWarrantyAction,
  resolveWarrantyAction,
  rejectWarrantyAction,
} from "./actions";

type St = { error?: string; success?: string } | null;

export function WarrantyActions({ id, status }: { id: string; status: string }) {
  const [reviewSt, review, reviewPending] = useActionState<St, FormData>(reviewWarrantyAction, null);
  const [approveSt, approve, approvePending] = useActionState<St, FormData>(approveWarrantyAction, null);
  const [resolveSt, resolve, resolvePending] = useActionState<St, FormData>(resolveWarrantyAction, null);
  const [rejectSt, reject, rejectPending] = useActionState<St, FormData>(rejectWarrantyAction, null);
  const msg = reviewSt ?? approveSt ?? resolveSt ?? rejectSt;

  return (
    <div className="space-y-2">
      {msg && (msg.success || msg.error) && (
        <p className={`text-xs ${msg.success ? "text-emerald-700" : "text-rose-700"}`}>
          {msg.success ?? msg.error}
        </p>
      )}

      {status === "PENDING" && (
        <form action={review}>
          <input type="hidden" name="id" value={id} />
          <button
            type="submit"
            disabled={reviewPending}
            className="bg-brand-purple hover:bg-brand-purple-dark w-full rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
          >
            {reviewPending ? "…" : "Poner en diagnóstico"}
          </button>
        </form>
      )}

      {(status === "PENDING" || status === "IN_REVIEW") && (
        <>
          <form action={approve} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={id} />
            <select
              name="resolution"
              aria-label="Remedio de garantía"
              defaultValue="REPAIR"
              className="border-brand-purple/20 focus:ring-brand-purple/30 rounded-md border px-2 py-1.5 text-xs focus:ring-2 focus:outline-none"
            >
              <option value="REPAIR">Reparar</option>
              <option value="REPLACE">Cambiar</option>
              <option value="REFUND">Devolver dinero</option>
            </select>
            <button
              type="submit"
              disabled={approvePending}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {approvePending ? "…" : "Aprobar"}
            </button>
          </form>
          <RejectForm id={id} action={reject} pending={rejectPending} />
        </>
      )}

      {status === "APPROVED" && (
        <details>
          <summary className="border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/5 cursor-pointer list-none rounded-md border px-3 py-1.5 text-xs font-semibold">
            Marcar resuelto…
          </summary>
          <form action={resolve} className="mt-2 flex flex-col gap-2">
            <input type="hidden" name="id" value={id} />
            <input
              name="note"
              maxLength={500}
              placeholder="Nota (opcional): cómo se resolvió"
              className="border-brand-purple/20 focus:ring-brand-purple/30 rounded-md border px-2 py-1.5 text-xs focus:ring-2 focus:outline-none"
            />
            <button
              type="submit"
              disabled={resolvePending}
              className="self-start rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {resolvePending ? "…" : "Confirmar resolución"}
            </button>
          </form>
        </details>
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
          maxLength={500}
          placeholder="Motivo (ej. mal uso, fuera de garantía)"
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
