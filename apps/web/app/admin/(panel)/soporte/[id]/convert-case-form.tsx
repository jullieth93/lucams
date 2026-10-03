"use client";

/*
 * Conversión de ticket GARANTIA_DEVOLUCION a caso especializado (garantía o
 * retracto). El admin elige el tipo y el item del pedido; la elegibilidad fina
 * la valida el módulo destino (acá solo se deshabilitan los casos imposibles
 * para ahorrar el roundtrip: item con reclamo activo, con retracto previo o
 * personalizado para retracto).
 */

import { useActionState, useState } from "react";
import { convertTicketToCaseAction } from "../actions";
import type { CaseConversionOrder, LinkedCaseKind } from "@/features/support/thread-service";

type St = { error?: string; success?: string } | null;

function itemDisabled(item: CaseConversionOrder["items"][number], kind: LinkedCaseKind): boolean {
  if (kind === "warranty") return item.hasActiveWarrantyClaim;
  return item.personalized || item.hasRetractRequest;
}

function itemHint(item: CaseConversionOrder["items"][number], kind: LinkedCaseKind): string {
  if (kind === "warranty" && item.hasActiveWarrantyClaim) return " (ya tiene reclamo activo)";
  if (kind === "retract" && item.hasRetractRequest) return " (ya tiene retracto)";
  if (kind === "retract" && item.personalized) return " (personalizado: sin retracto)";
  return "";
}

export function ConvertCaseForm({
  ticketId,
  order,
  disabled,
}: {
  ticketId: string;
  order: CaseConversionOrder;
  disabled: boolean;
}) {
  const [st, run, pending] = useActionState<St, FormData>(convertTicketToCaseAction, null);
  const [kind, setKind] = useState<LinkedCaseKind>("warranty");
  const hasEligible = order.items.some((it) => !itemDisabled(it, kind));

  if (disabled) {
    return <p className="text-brand-muted mt-2 text-sm">El ticket está cerrado.</p>;
  }

  return (
    <form action={run} className="mt-2 space-y-2">
      <input type="hidden" name="id" value={ticketId} />
      <input type="hidden" name="kind" value={kind} />

      {order.orderStatus !== "DELIVERED" && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
          El pedido {order.orderNumber} no está entregado: garantía y retracto aplican después de la
          entrega.
        </p>
      )}

      <div className="flex gap-3 text-xs">
        <label className="text-brand-purple-dark/80 flex items-center gap-1">
          <input
            type="radio"
            name="kind-radio"
            checked={kind === "warranty"}
            onChange={() => setKind("warranty")}
            className="accent-brand-purple"
          />
          Garantía
        </label>
        <label className="text-brand-purple-dark/80 flex items-center gap-1">
          <input
            type="radio"
            name="kind-radio"
            checked={kind === "retract"}
            onChange={() => setKind("retract")}
            className="accent-brand-purple"
          />
          Retracto
        </label>
      </div>

      <select
        name="orderItemId"
        required
        defaultValue=""
        className="border-brand-purple/20 focus:ring-brand-purple/30 w-full rounded-md border bg-white px-2 py-1.5 text-xs focus:ring-2 focus:outline-none"
      >
        <option value="" disabled>
          Elige el item del pedido…
        </option>
        {order.items.map((it) => (
          <option key={it.orderItemId} value={it.orderItemId} disabled={itemDisabled(it, kind)}>
            {it.productName} ×{it.qty}
            {itemHint(it, kind)}
          </option>
        ))}
      </select>

      {st && (st.success || st.error) && (
        <p className={`text-xs ${st.success ? "text-emerald-700" : "text-rose-700"}`}>
          {st.success ?? st.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || !hasEligible}
        className="bg-brand-purple hover:bg-brand-purple-dark rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Convirtiendo…" : "Convertir a caso"}
      </button>
    </form>
  );
}
