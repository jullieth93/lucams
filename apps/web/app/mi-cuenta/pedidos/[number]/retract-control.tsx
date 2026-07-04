"use client";

/*
 * F3 — control de retracto por item (cliente). Muestra:
 *  - botón "Solicitar retracto" si el item es elegible,
 *  - el estado si ya hay una solicitud,
 *  - una nota si está exceptuado por personalización.
 * Fuera de esos casos (fuera de ventana / no entregado) no renderiza nada.
 */

import { useActionState } from "react";
import { Undo2, Loader2 } from "lucide-react";
import { requestRetractAction } from "./actions";

type RetractItem = {
  orderItemId: string;
  eligible: boolean;
  reason: string | null;
  existingStatus: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "🕒 Retracto en revisión",
  APPROVED: "✅ Retracto aprobado — coordina la devolución",
  RECEIVED: "📦 Devolución recibida",
  REFUNDED: "💜 Reembolsado",
  REJECTED: "❌ Retracto rechazado",
};

export function RetractControl({ item }: { item: RetractItem }) {
  const [state, action, pending] = useActionState(requestRetractAction, null);

  if (item.existingStatus) {
    return (
      <p className="mt-1.5 inline-block rounded-md bg-brand-purple/5 px-2 py-1 text-[11px] font-medium text-brand-purple-dark">
        {STATUS_LABEL[item.existingStatus] ?? item.existingStatus}
      </p>
    );
  }

  if (state?.success) {
    return <p className="mt-1.5 text-[11px] font-medium text-emerald-700">{state.success}</p>;
  }

  if (!item.eligible) {
    if (item.reason === "PERSONALIZED") {
      return (
        <p className="text-brand-muted mt-1 text-[11px]">
          Personalizado — sin derecho de retracto (ley).
        </p>
      );
    }
    return null; // fuera de ventana / no entregado → sin ruido
  }

  return (
    <details className="mt-1.5">
      <summary className="text-brand-muted hover:text-brand-purple inline-flex cursor-pointer list-none items-center gap-1 text-[11px] font-medium">
        <Undo2 className="h-3 w-3" />
        Solicitar retracto
      </summary>
      <form action={action} className="mt-2 space-y-2">
        <input type="hidden" name="orderItemId" value={item.orderItemId} />
        <label htmlFor={`retract-reason-${item.orderItemId}`} className="text-brand-muted block text-[11px]">
          ¿Por qué lo devuelves? (opcional)
        </label>
        <textarea
          id={`retract-reason-${item.orderItemId}`}
          name="reason"
          rows={2}
          maxLength={300}
          placeholder="Ej. no era lo que esperaba"
          className="border-brand-purple/20 focus:ring-brand-purple/30 w-full rounded-md border px-2 py-1.5 text-xs focus:ring-2 focus:outline-none"
        />
        <p className="text-brand-muted text-[10px]">
          Tienes 5 días hábiles desde la entrega. Cubrimos el costo de la devolución.
        </p>
        {state?.error && <p className="text-[11px] text-red-700">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="bg-brand-purple-dark hover:bg-brand-purple inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-white transition-colors disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Enviar solicitud"}
        </button>
      </form>
    </details>
  );
}
