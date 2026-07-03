"use client";

import { useActionState } from "react";
import { RefreshCw, ArrowRight, X, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { refundOrderAction, retryShipmentAction, transitionOrderAction } from "./actions";

/**
 * Panel de acciones admin sobre una Order. Visibilidad de botones depende
 * del estado actual + presencia de tracking.
 */
export function OrderActions({
  orderId,
  orderStatus,
  hasTracking,
}: {
  orderId: string;
  orderStatus: string;
  hasTracking: boolean;
}) {
  const [retryState, retryAction, retryPending] = useActionState(retryShipmentAction, null);
  const [transState, transAction, transPending] = useActionState(transitionOrderAction, null);
  const [refundState, refundAction, refundPending] = useActionState(refundOrderAction, null);

  const showRetry = orderStatus === "PAID" || (orderStatus === "FULFILLING" && !hasTracking);
  const showMarkShipped = orderStatus === "FULFILLING";
  const showMarkDelivered = orderStatus === "SHIPPED";
  const canCancel = ["PENDING_PAYMENT", "PAID", "FULFILLING", "SHIPPED"].includes(orderStatus);
  // F2 — solo PAID o DELIVERED pueden ir a REFUNDED (máquina de estados).
  const canRefund = ["PAID", "DELIVERED"].includes(orderStatus);

  if (!showRetry && !showMarkShipped && !showMarkDelivered && !canCancel && !canRefund) {
    return (
      <section className="border-brand-purple/10 rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="text-brand-purple-dark mb-2 text-sm font-bold">Acciones</h2>
        <p className="text-brand-muted text-xs">
          Sin acciones disponibles para este estado.
        </p>
      </section>
    );
  }

  return (
    <section className="border-brand-purple/10 space-y-2 rounded-xl border bg-white p-5 shadow-sm">
      <h2 className="text-brand-purple-dark mb-2 text-sm font-bold">Acciones</h2>

      {(retryState?.success || retryState?.error) && (
        <div
          className={`rounded-md p-2 text-xs ${
            retryState.success ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"
          }`}
        >
          {retryState.success ?? retryState.error}
        </div>
      )}
      {(transState?.success || transState?.error) && (
        <div
          className={`rounded-md p-2 text-xs ${
            transState.success ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"
          }`}
        >
          {transState.success ?? transState.error}
        </div>
      )}
      {(refundState?.success || refundState?.error) && (
        <div
          className={`rounded-md p-2 text-xs ${
            refundState.success ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"
          }`}
        >
          {refundState.success ?? refundState.error}
        </div>
      )}

      {showRetry && (
        <form action={retryAction}>
          <input type="hidden" name="orderId" value={orderId} />
          <Button
            type="submit"
            size="sm"
            disabled={retryPending}
            className="bg-brand-purple w-full text-white hover:brightness-110"
          >
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${retryPending ? "animate-spin" : ""}`} />
            {hasTracking ? "Regenerar guía" : "Generar guía Aveonline"}
          </Button>
        </form>
      )}

      {showMarkShipped && (
        <form action={transAction}>
          <input type="hidden" name="orderId" value={orderId} />
          <input type="hidden" name="to" value="SHIPPED" />
          <Button
            type="submit"
            size="sm"
            disabled={transPending}
            variant="outline"
            className="w-full"
          >
            <ArrowRight className="mr-2 h-3.5 w-3.5" />
            Marcar como ENVIADO
          </Button>
        </form>
      )}

      {showMarkDelivered && (
        <form action={transAction}>
          <input type="hidden" name="orderId" value={orderId} />
          <input type="hidden" name="to" value="DELIVERED" />
          <Button
            type="submit"
            size="sm"
            disabled={transPending}
            variant="outline"
            className="w-full"
          >
            <ArrowRight className="mr-2 h-3.5 w-3.5" />
            Marcar como ENTREGADO
          </Button>
        </form>
      )}

      {canCancel && (
        <form action={transAction}>
          <input type="hidden" name="orderId" value={orderId} />
          <input type="hidden" name="to" value="CANCELLED" />
          <Button
            type="submit"
            size="sm"
            disabled={transPending}
            variant="outline"
            className="w-full text-rose-700 hover:bg-rose-50"
          >
            <X className="mr-2 h-3.5 w-3.5" />
            Cancelar pedido
          </Button>
        </form>
      )}

      {canRefund && (
        <details className="rounded-md border border-rose-200">
          <summary className="cursor-pointer list-none rounded-md px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50">
            <Undo2 className="mr-1.5 inline h-3.5 w-3.5" />
            Reembolsar pedido…
          </summary>
          <form action={refundAction} className="space-y-2 border-t border-rose-100 p-3">
            <input type="hidden" name="orderId" value={orderId} />
            <label htmlFor="refund-reason" className="text-brand-muted block text-[11px]">
              Motivo (opcional — se incluye en el email al cliente)
            </label>
            <textarea
              id="refund-reason"
              name="reason"
              rows={2}
              maxLength={300}
              placeholder="Ej. producto defectuoso, retracto…"
              className="border-brand-purple/20 focus:ring-brand-purple/30 w-full rounded-md border px-2 py-1.5 text-xs focus:ring-2 focus:outline-none"
            />
            <p className="text-[11px] text-rose-800">
              ⚠️ Marca la orden como <strong>REFUNDED</strong> y revierte el stock.{" "}
              <strong>El dinero se emite manualmente en Wompi.</strong>
            </p>
            <Button
              type="submit"
              size="sm"
              disabled={refundPending}
              className="w-full bg-rose-600 text-white hover:bg-rose-700"
            >
              {refundPending ? "Reembolsando…" : "Confirmar reembolso"}
            </Button>
          </form>
        </details>
      )}
    </section>
  );
}
