"use client";

/*
 * Formulario de cierre del reclamo (detalle /admin/reclamos/[id]).
 *
 * Dos caminos en una sola tarjeta:
 *  - Resolver: remedio (reparación/cambio/devolución) + nota opcional.
 *  - Rechazar: motivo obligatorio (queda en un <details> para que el camino
 *    feliz sea lo primero que se ve y el rechazo pida un clic extra).
 * AdminSubmitButton da feedback "en vuelo" y bloquea el doble envío.
 */

import { useActionState } from "react";
import { AdminSubmitButton } from "@/components/admin-submit-button";
import {
  rejectClaimAction,
  resolveClaimAction,
  type ClaimActionState,
} from "./actions";

const inputCls =
  "border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 w-full rounded-md border bg-white px-2 py-1.5 text-sm focus:ring-2 focus:outline-none";

export function ResolveClaimForm({ id }: { id: string }) {
  const [resolveSt, resolve, resolvePending] = useActionState<ClaimActionState, FormData>(
    resolveClaimAction,
    null,
  );
  const [rejectSt, reject, rejectPending] = useActionState<ClaimActionState, FormData>(
    rejectClaimAction,
    null,
  );
  const msg = resolveSt ?? rejectSt;

  return (
    <div className="space-y-4">
      {msg && (msg.success || msg.error) && (
        <p
          className={`rounded-md border px-3 py-2 text-xs ${
            msg.success
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {msg.success ?? msg.error}
        </p>
      )}

      <form action={resolve} className="flex flex-col gap-3">
        <input type="hidden" name="id" value={id} />
        <div>
          <label
            htmlFor="resolutionType"
            className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold"
          >
            Tipo de solución
          </label>
          <select id="resolutionType" name="resolutionType" defaultValue="REPAIR" className={inputCls}>
            <option value="REPAIR">Reparación</option>
            <option value="REPLACE">Cambio del producto</option>
            <option value="REFUND">Devolución del dinero</option>
          </select>
        </div>
        <div>
          <label htmlFor="note" className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold">
            Nota para el cliente <span className="text-brand-muted font-normal">(opcional)</span>
          </label>
          <textarea
            id="note"
            name="note"
            rows={3}
            maxLength={500}
            placeholder="Ej. Se envió unidad nueva el 28/07, guía Coordinadora 123."
            className={inputCls}
          />
        </div>
        <AdminSubmitButton
          className="bg-gradient-brand inline-flex items-center justify-center gap-1.5 self-start rounded-md px-3.5 py-2 text-sm font-semibold text-white shadow-md transition-all hover:shadow-lg hover:brightness-110 disabled:opacity-60"
          disabled={resolvePending}
          pendingLabel="Guardando…"
        >
          Marcar como resuelto
        </AdminSubmitButton>
      </form>

      <details className="border-brand-purple/10 border-t pt-3">
        <summary className="cursor-pointer list-none text-xs font-semibold text-rose-700 hover:text-rose-900">
          El reclamo no procede — rechazar
        </summary>
        <form action={reject} className="mt-3 flex flex-col gap-3">
          <input type="hidden" name="id" value={id} />
          <div>
            <label
              htmlFor="reject-note"
              className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold"
            >
              Motivo del rechazo
            </label>
            <textarea
              id="reject-note"
              name="note"
              rows={3}
              required
              maxLength={500}
              placeholder="Ej. El daño es por mal uso, no por defecto de fabricación."
              className={inputCls}
            />
          </div>
          <AdminSubmitButton
            className="inline-flex items-center justify-center gap-1.5 self-start rounded-md bg-rose-600 px-3.5 py-2 text-sm font-semibold text-white transition-all hover:bg-rose-700 disabled:opacity-60"
            disabled={rejectPending}
            pendingLabel="Rechazando…"
          >
            Confirmar rechazo
          </AdminSubmitButton>
        </form>
      </details>
    </div>
  );
}
