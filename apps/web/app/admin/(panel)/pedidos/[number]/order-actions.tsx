"use client";

import { useActionState } from "react";
import { RefreshCw, ArrowRight, X, Undo2, Ban, PackageX } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  blockOrderAddressAction,
  markOrderNoShowAction,
  refundOrderAction,
  retryShipmentAction,
  transitionOrderAction,
} from "./actions";

/**
 * Panel de acciones admin sobre una Order. Visibilidad de botones depende
 * del estado actual + presencia de tracking.
 */
export function OrderActions({
  orderId,
  orderStatus,
  hasTracking,
  paymentMethod,
  isNoShow = false,
  hasAddressKey = false,
}: {
  orderId: string;
  orderStatus: string;
  hasTracking: boolean;
  paymentMethod?: string;
  /** Anti-abuso COD (ADR-065): ya marcado como no recibido. */
  isNoShow?: boolean;
  /** Anti-abuso COD (ADR-065): el pedido tiene dirección normalizada bloqueable. */
  hasAddressKey?: boolean;
}) {
  const [retryState, retryAction, retryPending] = useActionState(retryShipmentAction, null);
  const [transState, transAction, transPending] = useActionState(transitionOrderAction, null);
  const [refundState, refundAction, refundPending] = useActionState(refundOrderAction, null);
  const [noShowState, noShowAction, noShowPending] = useActionState(markOrderNoShowAction, null);
  const [blockState, blockAction, blockPending] = useActionState(blockOrderAddressAction, null);
  const isCod = paymentMethod === "COD";
  // Anti-abuso COD: no-show para pedidos COD no entregados; bloquear dirección si hay clave.
  const showNoShow = isCod && !isNoShow && orderStatus !== "DELIVERED";
  const showBlockAddr = isCod && hasAddressKey;
  const showAntiAbuse = isCod && (showNoShow || showBlockAddr || isNoShow);

  const showRetry = orderStatus === "PAID" || (orderStatus === "FULFILLING" && !hasTracking);
  const showMarkShipped = orderStatus === "FULFILLING";
  const showMarkDelivered = orderStatus === "SHIPPED";
  // Cancelar (revierte stock, SIN reembolso). Para Wompi excluimos PAID: ahí el dinero
  // SÍ se capturó, así que la vía correcta es "Reembolsar" (REFUNDED). Para COD, PAID es
  // cancelable (efectivo nunca cobrado). (revisión adversarial COD)
  const cancelStates = isCod
    ? ["PENDING_PAYMENT", "PAID", "FULFILLING", "SHIPPED"]
    : ["PENDING_PAYMENT", "FULFILLING", "SHIPPED"];
  const canCancel = cancelStates.includes(orderStatus);
  // Reembolso = devolver dinero. Solo tiene sentido con dinero capturado: Wompi PAID/
  // DELIVERED, o COD DELIVERED (efectivo ya cobrado al entregar). COD no-entregado NO
  // se "reembolsa" (nunca se cobró) → se cancela.
  const canRefund = isCod
    ? orderStatus === "DELIVERED"
    : ["PAID", "DELIVERED"].includes(orderStatus);

  if (
    !showRetry &&
    !showMarkShipped &&
    !showMarkDelivered &&
    !canCancel &&
    !canRefund &&
    !showAntiAbuse
  ) {
    return (
      <section className="border-brand-purple/10 rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="text-brand-purple-dark mb-2 text-sm font-bold">Acciones</h2>
        <p className="text-brand-muted text-xs">Sin acciones disponibles para este estado.</p>
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

      {/* #25 — ENVIADO/ENTREGADO avisan al cliente por correo y no se deshacen: se piden con
        confirmación (mismo patrón <details> que Cancelar/Reembolsar), en acento morado (avance,
        no peligro), para no marcarlos de un clic por accidente. */}
      {showMarkShipped && (
        <details className="border-brand-purple/20 rounded-md border">
          <summary className="text-brand-purple-dark hover:bg-brand-purple/5 cursor-pointer list-none rounded-md px-3 py-2 text-xs font-semibold">
            <ArrowRight className="mr-1.5 inline h-3.5 w-3.5" />
            Marcar como ENVIADO…
          </summary>
          <form action={transAction} className="border-brand-purple/10 space-y-2 border-t p-3">
            <input type="hidden" name="orderId" value={orderId} />
            <input type="hidden" name="to" value="SHIPPED" />
            <p className="text-brand-muted text-[11px]">
              Se le avisará al cliente por correo que su pedido va en camino. No se puede deshacer.
            </p>
            <Button
              type="submit"
              size="sm"
              disabled={transPending}
              variant="outline"
              className="w-full"
            >
              {transPending ? "Marcando…" : "Confirmar envío"}
            </Button>
          </form>
        </details>
      )}

      {showMarkDelivered && (
        <details className="border-brand-purple/20 rounded-md border">
          <summary className="text-brand-purple-dark hover:bg-brand-purple/5 cursor-pointer list-none rounded-md px-3 py-2 text-xs font-semibold">
            <ArrowRight className="mr-1.5 inline h-3.5 w-3.5" />
            Marcar como ENTREGADO…
          </summary>
          <form action={transAction} className="border-brand-purple/10 space-y-2 border-t p-3">
            <input type="hidden" name="orderId" value={orderId} />
            <input type="hidden" name="to" value="DELIVERED" />
            <p className="text-brand-muted text-[11px]">
              Confirma que el cliente ya recibió su pedido. Se le enviará el correo de entrega y no
              se puede deshacer.
            </p>
            <Button
              type="submit"
              size="sm"
              disabled={transPending}
              variant="outline"
              className="w-full"
            >
              {transPending ? "Marcando…" : "Confirmar entrega"}
            </Button>
          </form>
        </details>
      )}

      {canCancel && (
        <details className="rounded-md border border-rose-200">
          <summary className="cursor-pointer list-none rounded-md px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50">
            <X className="mr-1.5 inline h-3.5 w-3.5" />
            Cancelar pedido…
          </summary>
          <form action={transAction} className="space-y-2 border-t border-rose-100 p-3">
            <input type="hidden" name="orderId" value={orderId} />
            <input type="hidden" name="to" value="CANCELLED" />
            <label htmlFor="cancel-reason" className="text-brand-muted block text-[11px]">
              Motivo (opcional — queda en la auditoría)
            </label>
            <textarea
              id="cancel-reason"
              name="reason"
              rows={2}
              maxLength={300}
              placeholder="Ej. cliente canceló, dirección errada, sin stock…"
              className="border-brand-purple/20 focus:ring-brand-purple/30 w-full rounded-md border px-2 py-1.5 text-xs focus:ring-2 focus:outline-none"
            />
            <p className="text-[11px] text-rose-800">
              Revierte el stock y marca la orden como <strong>CANCELADA</strong> (sin reembolso de
              dinero).
            </p>
            <Button
              type="submit"
              size="sm"
              disabled={transPending}
              className="w-full bg-rose-600 text-white hover:bg-rose-700"
            >
              {transPending ? "Cancelando…" : "Confirmar cancelación"}
            </Button>
          </form>
        </details>
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
              {/* #24 — en contraentrega no hay transacción Wompi; el reembolso es por transferencia. */}
              {isCod ? (
                <strong>
                  Devuélvele el dinero al cliente por transferencia bancaria (pagó en efectivo al
                  mensajero — no hay transacción en Wompi).
                </strong>
              ) : (
                <strong>El dinero se emite manualmente en Wompi.</strong>
              )}
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

      {/* Anti-abuso contra entrega (ADR-065) */}
      {(noShowState?.success || noShowState?.error) && (
        <div
          className={`rounded-md p-2 text-xs ${
            noShowState.success ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"
          }`}
        >
          {noShowState.success ?? noShowState.error}
        </div>
      )}
      {(blockState?.success || blockState?.error) && (
        <div
          className={`rounded-md p-2 text-xs ${
            blockState.success ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"
          }`}
        >
          {blockState.success ?? blockState.error}
        </div>
      )}

      {showAntiAbuse && (
        <div className="border-brand-purple/10 mt-1 space-y-2 border-t pt-3">
          <p className="text-brand-muted text-[11px] font-semibold tracking-wide uppercase">
            Anti-abuso contra entrega
          </p>
          {isNoShow && (
            <p className="rounded-md bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
              Marcado como <strong>no recibido</strong>. El contra entrega de esta identidad queda
              bloqueado.
            </p>
          )}
          {showNoShow && (
            <details className="rounded-md border border-amber-200">
              <summary className="cursor-pointer list-none rounded-md px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-50">
                <PackageX className="mr-1.5 inline h-3.5 w-3.5" />
                Marcar como NO recibido…
              </summary>
              <form action={noShowAction} className="space-y-2 border-t border-amber-100 p-3">
                <input type="hidden" name="orderId" value={orderId} />
                <p className="text-[11px] text-amber-800">
                  Úsalo si el cliente no recibió el paquete (contra entrega devuelto / plantón).
                  Cuenta como señal de abuso: sus próximos pedidos tendrán que pagarse en línea.
                </p>
                <Button
                  type="submit"
                  size="sm"
                  disabled={noShowPending}
                  variant="outline"
                  className="w-full"
                >
                  {noShowPending ? "Marcando…" : "Confirmar no recibido"}
                </Button>
              </form>
            </details>
          )}
          {showBlockAddr && (
            <details className="rounded-md border border-rose-200">
              <summary className="cursor-pointer list-none rounded-md px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50">
                <Ban className="mr-1.5 inline h-3.5 w-3.5" />
                Bloquear esta dirección…
              </summary>
              <form
                action={blockAction}
                className="space-y-2 border-t border-rose-100 p-3"
                onSubmit={(e) => {
                  if (
                    !confirm(
                      "¿Bloquear la dirección de este pedido para contra entrega? Cualquier pedido a esta dirección tendrá que pagarse en línea.",
                    )
                  ) {
                    e.preventDefault();
                  }
                }}
              >
                <input type="hidden" name="orderId" value={orderId} />
                <p className="text-[11px] text-rose-800">
                  Ningún pedido futuro a esta dirección podrá pagar contra entrega (sí en línea). Se
                  gestiona en Finanzas → Bloqueos.
                </p>
                <Button
                  type="submit"
                  size="sm"
                  disabled={blockPending}
                  className="w-full bg-rose-600 text-white hover:bg-rose-700"
                >
                  {blockPending ? "Bloqueando…" : "Confirmar bloqueo de dirección"}
                </Button>
              </form>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
