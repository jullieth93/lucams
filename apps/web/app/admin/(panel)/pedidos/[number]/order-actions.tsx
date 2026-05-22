"use client";

import { useActionState } from "react";
import { RefreshCw, ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { retryShipmentAction, transitionOrderAction } from "./actions";

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

  const showRetry = orderStatus === "PAID" || (orderStatus === "FULFILLING" && !hasTracking);
  const showMarkShipped = orderStatus === "FULFILLING";
  const showMarkDelivered = orderStatus === "SHIPPED";
  const canCancel = ["PENDING_PAYMENT", "PAID", "FULFILLING", "SHIPPED"].includes(orderStatus);

  if (!showRetry && !showMarkShipped && !showMarkDelivered && !canCancel) {
    return (
      <section className="border-brand-purple/10 rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="text-brand-purple-dark mb-2 text-sm font-bold">Acciones</h2>
        <p className="text-brand-purple-dark/55 text-xs">
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
    </section>
  );
}
