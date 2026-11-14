"use client";

/*
 * F3 / Bloque 6 — gestión operativa por solicitud de retracto (admin).
 * Muestra las acciones legales según el estado + asignación de responsable (`assignedToAdminId`).
 * El reembolso final (`REFUNDED`) es exclusivo de `SUPERADMIN` + verificación MFA reciente.
 */

import { useActionState } from "react";
import { useMfaReauthAction } from "@/components/admin/mfa-reauth";
import {
  approveRetractAction,
  assignRetractAction,
  rejectRetractAction,
  receiveRetractAction,
  refundRetractAction,
} from "./actions";

type St = { error?: string; success?: string; reauthRequired?: boolean } | null;

export function RetractActions({
  id,
  status,
  canRefund = false,
  assignedToAdminId = null,
  currentAdminId,
  assignableAdmins = [],
}: {
  id: string;
  status: string;
  canRefund?: boolean;
  assignedToAdminId?: string | null;
  currentAdminId?: string;
  assignableAdmins?: Array<{ id: string; email: string }>;
}) {
  const [assignSt, assign, assignPending] = useActionState<St, FormData>(assignRetractAction, null);
  const [approveSt, approve, approvePending] = useActionState<St, FormData>(
    approveRetractAction,
    null,
  );
  const [rejectSt, reject, rejectPending] = useActionState<St, FormData>(rejectRetractAction, null);
  const [receiveSt, receive, receivePending] = useActionState<St, FormData>(
    receiveRetractAction,
    null,
  );
  // F-10: el reembolso exige aal2 reciente; ante `reauthRequired` el hook abre
  // el modal TOTP y reintenta esta acción tras verificar.
  const [refundSt, refund, refundPending, reauthModal] = useMfaReauthAction(refundRetractAction);

  const msg = assignSt ?? approveSt ?? rejectSt ?? receiveSt ?? refundSt;
  const isOpen = status === "PENDING" || status === "APPROVED" || status === "RECEIVED";

  return (
    <div className="space-y-2.5">
      {reauthModal}
      {msg && (msg.success || msg.error) && (
        <p
          role="status"
          className={`rounded-md px-2.5 py-1.5 text-xs font-medium ${
            msg.success
              ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {msg.success ?? msg.error}
        </p>
      )}

      {isOpen && assignableAdmins.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <form action={assign} className="flex min-w-0 flex-1 items-center gap-1.5">
            <input type="hidden" name="id" value={id} />
            <select
              key={assignedToAdminId ?? "unassigned"}
              name="assignedToAdminId"
              defaultValue={assignedToAdminId ?? ""}
              aria-label="Responsable del caso"
              className="border-brand-purple/20 text-brand-purple-dark focus:ring-brand-purple/30 min-w-0 flex-1 truncate rounded-md border bg-white px-2 py-1 text-xs focus:ring-2 focus:outline-none"
            >
              <option value="">Sin asignar</option>
              {assignableAdmins.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.email}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={assignPending}
              className="border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/5 rounded-md border bg-white px-2 py-1 text-xs font-medium disabled:opacity-60"
            >
              {assignPending ? "…" : "Guardar"}
            </button>
          </form>
          {currentAdminId && assignedToAdminId !== currentAdminId && (
            <form action={assign}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="assignedToAdminId" value={currentAdminId} />
              <button
                type="submit"
                disabled={assignPending}
                className="text-brand-purple hover:text-brand-purple-dark text-[11px] font-semibold underline disabled:opacity-60"
              >
                Asignarme
              </button>
            </form>
          )}
        </div>
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
              {approvePending ? "…" : "Aprobar devolución"}
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

      {status === "RECEIVED" &&
        (canRefund ? (
          <form action={refund} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={id} />
            <select
              name="method"
              aria-label="Método de reembolso"
              className="border-brand-purple/20 text-brand-purple-dark focus:ring-brand-purple/30 rounded-md border bg-white px-2 py-1.5 text-xs focus:ring-2 focus:outline-none"
            >
              <option value="WOMPI_VOID">Reversa Wompi</option>
              <option value="BANK_TRANSFER">Transferencia bancaria</option>
            </select>
            <button
              type="submit"
              disabled={refundPending}
              className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
            >
              {refundPending ? "…" : "Registrar reembolso"}
            </button>
          </form>
        ) : (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-800">
            Producto recibido — pendiente de reembolso por Superadmin (requiere MFA).
          </p>
        ))}

      {status === "REFUNDED" && (
        <p className="text-[11px] font-medium text-emerald-800">
          Reembolso cerrado. Verifica el comprobante de reversa o transferencia.
        </p>
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
          maxLength={300}
          placeholder="Motivo del rechazo (se envía al cliente)"
          className="border-brand-purple/20 focus:ring-brand-purple/30 rounded-md border bg-white px-2 py-1.5 text-xs focus:ring-2 focus:outline-none"
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
