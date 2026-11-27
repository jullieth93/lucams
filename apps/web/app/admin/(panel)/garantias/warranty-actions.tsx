"use client";

/*
 * P2 backoffice / Bloque 6 — acciones por reclamo de garantía (admin). Flujo Ley 1480:
 * PENDING → IN_REVIEW → APPROVED (elige remedio) → RESOLVED · o REJECTED (motivo),
 * más asignación de responsable (`assignedToAdminId`).
 * Las devoluciones de dinero (`REFUND`) exigen `warranty:refund` (`SUPERADMIN`) + MFA reciente.
 */

import { useActionState } from "react";
import { useMfaReauthAction } from "@/components/admin/mfa-reauth";
import { formatCOP } from "@/lib/format";
import {
  assignWarrantyAction,
  reviewWarrantyAction,
  approveWarrantyAction,
  resolveWarrantyAction,
  rejectWarrantyAction,
} from "./actions";

type St = { error?: string; success?: string; reauthRequired?: boolean } | null;

export function WarrantyActions({
  id,
  status,
  resolutionType = null,
  canRefund = false,
  maxRefundCents = 0,
  suggestedRefundCents = 0,
  assignedToAdminId = null,
  currentAdminId,
  assignableAdmins = [],
}: {
  id: string;
  status: string;
  resolutionType?: string | null;
  canRefund?: boolean;
  maxRefundCents?: number;
  suggestedRefundCents?: number;
  assignedToAdminId?: string | null;
  currentAdminId?: string;
  assignableAdmins?: Array<{ id: string; email: string }>;
}) {
  const [assignSt, assign, assignPending] = useActionState<St, FormData>(
    assignWarrantyAction,
    null,
  );
  const [reviewSt, review, reviewPending] = useActionState<St, FormData>(
    reviewWarrantyAction,
    null,
  );
  const [approveSt, approve, approvePending, approveReauthModal] =
    useMfaReauthAction(approveWarrantyAction);
  const [resolveSt, resolve, resolvePending, resolveReauthModal] =
    useMfaReauthAction(resolveWarrantyAction);
  const [rejectSt, reject, rejectPending] = useActionState<St, FormData>(
    rejectWarrantyAction,
    null,
  );
  const msg = assignSt ?? reviewSt ?? approveSt ?? resolveSt ?? rejectSt;
  const isActive = status === "PENDING" || status === "IN_REVIEW" || status === "APPROVED";

  return (
    <div className="space-y-2.5">
      {approveReauthModal}
      {resolveReauthModal}
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

      {isActive && assignableAdmins.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <form action={assign} className="flex min-w-0 flex-1 items-center gap-1.5">
            <input type="hidden" name="id" value={id} />
            <select
              key={assignedToAdminId ?? "unassigned"}
              name="assignedToAdminId"
              defaultValue={assignedToAdminId ?? ""}
              aria-label="Responsable del reclamo"
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
              className="border-brand-purple/20 text-brand-purple-dark focus:ring-brand-purple/30 min-w-0 flex-1 rounded-md border bg-white px-2 py-1.5 text-xs focus:ring-2 focus:outline-none"
            >
              <option value="REPAIR">Reparar</option>
              <option value="REPLACE">Cambiar unidad</option>
              <option value="REFUND" disabled={!canRefund}>
                {canRefund ? "Devolver dinero (MFA)" : "Devolver dinero (solo Superadmin)"}
              </option>
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

      {status === "APPROVED" &&
        (resolutionType === "REFUND" && !canRefund ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-800">
            Devolución aprobada — pendiente de cierre y reembolso por Superadmin (requiere MFA).
          </p>
        ) : (
          <details>
            <summary className="border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/5 cursor-pointer list-none rounded-md border bg-white px-3 py-1.5 text-xs font-semibold">
              {resolutionType === "REFUND" ? "Registrar devolución y cerrar…" : "Marcar resuelto…"}
            </summary>
            <form action={resolve} className="mt-2 flex flex-col gap-2">
              <input type="hidden" name="id" value={id} />
              {resolutionType === "REFUND" && (
                <>
                  {maxRefundCents <= 0 && (
                    <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] font-medium text-amber-800">
                      Sin saldo reembolsable disponible (el pedido ya fue reembolsado o el efectivo
                      de la línea ya se devolvió por completo).
                    </p>
                  )}
                  <label className="flex flex-col gap-1 text-[11px] font-medium text-slate-700">
                    <span>Monto devuelto (COP · máx. {formatCOP(maxRefundCents)})</span>
                    <input
                      type="number"
                      name="refundAmountPesos"
                      required
                      min={0.01}
                      max={
                        maxRefundCents > 0 ? Number((maxRefundCents / 100).toFixed(2)) : undefined
                      }
                      step="0.01"
                      defaultValue={
                        suggestedRefundCents > 0
                          ? suggestedRefundCents % 100 === 0
                            ? String(suggestedRefundCents / 100)
                            : (suggestedRefundCents / 100).toFixed(2)
                          : ""
                      }
                      className="border-brand-purple/20 focus:ring-brand-purple/30 rounded-md border bg-white px-2 py-1.5 text-xs tabular-nums focus:ring-2 focus:outline-none"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] font-medium text-slate-700">
                    <span>Método de reembolso</span>
                    <select
                      name="refundMethod"
                      required
                      defaultValue="WOMPI_VOID"
                      className="border-brand-purple/20 text-brand-purple-dark focus:ring-brand-purple/30 rounded-md border bg-white px-2 py-1.5 text-xs focus:ring-2 focus:outline-none"
                    >
                      <option value="WOMPI_VOID">Reversa Wompi</option>
                      <option value="BANK_TRANSFER">Transferencia bancaria</option>
                    </select>
                  </label>
                  <label className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50/70 p-2 text-[11px] text-rose-900">
                    <input
                      type="checkbox"
                      name="refundConfirmed"
                      value="true"
                      required
                      className="mt-0.5 h-3.5 w-3.5 rounded border-rose-300 text-rose-600"
                    />
                    <span>
                      Confirmo que ya devolví el dinero al cliente por el monto y método indicados.
                    </span>
                  </label>
                </>
              )}
              <input
                name="note"
                maxLength={500}
                placeholder={
                  resolutionType === "REFUND"
                    ? "Nota / comprobante (opcional): ref. transferencia o reversa"
                    : "Nota (opcional): cómo se ejecutó el remedio"
                }
                className="border-brand-purple/20 focus:ring-brand-purple/30 rounded-md border bg-white px-2 py-1.5 text-xs focus:ring-2 focus:outline-none"
              />
              <button
                type="submit"
                disabled={resolvePending || (resolutionType === "REFUND" && maxRefundCents <= 0)}
                className={`self-start rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60 ${
                  resolutionType === "REFUND"
                    ? "bg-rose-600 hover:bg-rose-700"
                    : "bg-emerald-600 hover:bg-emerald-700"
                }`}
              >
                {resolvePending
                  ? "…"
                  : resolutionType === "REFUND"
                    ? "Confirmar reembolso (MFA)"
                    : "Confirmar resolución"}
              </button>
            </form>
          </details>
        ))}

      {status === "RESOLVED" && (
        <p className="text-[11px] font-medium text-emerald-800">
          Garantía cerrada y notificada al cliente.
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
          maxLength={500}
          placeholder="Motivo del rechazo (ej. daño por uso, fuera de cobertura)"
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
