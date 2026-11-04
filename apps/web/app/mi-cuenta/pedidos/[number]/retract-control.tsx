"use client";

/*
 * F3 — control de retracto por item (cliente). Muestra:
 *  - botón "Solicitar retracto" si el item es elegible,
 *  - el estado si ya hay una solicitud,
 *  - una nota si está exceptuado por personalización.
 * Fuera de esos casos (fuera de ventana / no entregado) no renderiza nada.
 */

import { useActionState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { Undo2, Loader2, Sparkles } from "lucide-react";
import { formatCOP } from "@/lib/format";
import { requestRetractAction } from "./actions";
import type { AccountTexts } from "../../account-texts";

type RetractItem = {
  orderItemId: string;
  eligible: boolean;
  reason: string | null;
  existingStatus: string | null;
  estimatedRefundCents?: number;
  estimatedPointsToRestore?: number;
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "🕒 Retracto en revisión",
  APPROVED: "✅ Retracto aprobado — coordina la devolución",
  RECEIVED: "📦 Devolución recibida",
  REFUNDED: "💜 Reembolsado",
  REJECTED: "❌ Retracto rechazado",
};

export function RetractControl({
  item,
  texts,
  guestToken,
  actionOverride,
}: {
  item: RetractItem;
  texts: AccountTexts["retract"];
  guestToken?: string;
  actionOverride?: (
    prev: { error?: string; success?: string } | null,
    formData: FormData,
  ) => Promise<{ error?: string; success?: string }>;
}) {
  const [state, action, pending] = useActionState(actionOverride ?? requestRetractAction, null);

  if (item.existingStatus) {
    return (
      <>
        {/* La action revalida la página en el mismo render que devuelve
            state.success: sin este guard el badge tapaba el mensaje y la rama
            de éxito era inalcanzable (R4/R6). El badge persistente no cambia. */}
        {state?.success && (
          <p className="mt-1.5 text-[11px] font-medium text-emerald-700">{state.success}</p>
        )}
        <p className="bg-brand-purple/5 text-brand-purple-dark mt-1.5 inline-block rounded-md px-2 py-1 text-[11px] font-medium">
          {STATUS_LABEL[item.existingStatus] ?? item.existingStatus}
        </p>
      </>
    );
  }

  if (state?.success) {
    return <p className="mt-1.5 text-[11px] font-medium text-emerald-700">{state.success}</p>;
  }

  if (!item.eligible) {
    if (item.reason === "PERSONALIZED") {
      return <p className="text-brand-muted mt-1 text-[11px]">{texts.personalized}</p>;
    }
    return null; // fuera de ventana / no entregado → sin ruido
  }

  return (
    <details className="mt-1.5">
      <summary className="text-brand-muted hover:text-brand-purple inline-flex cursor-pointer list-none items-center gap-1 text-[11px] font-medium">
        <Undo2 className="h-3 w-3" />
        {texts.cta}
      </summary>
      <form action={action} className="mt-2 space-y-2">
        <input type="hidden" name="orderItemId" value={item.orderItemId} />
        {guestToken && <input type="hidden" name="token" value={guestToken} />}
        {guestToken && (
          <div>
            <label
              htmlFor={`retract-email-${item.orderItemId}`}
              className="text-brand-muted block text-[11px]"
            >
              Confirma el correo con el que hiciste la compra
            </label>
            <input
              id={`retract-email-${item.orderItemId}`}
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder="tu@correo.com"
              className="border-brand-purple/20 focus:ring-brand-purple/30 mt-1 w-full rounded-md border px-2 py-1.5 text-xs focus:ring-2 focus:outline-none"
            />
          </div>
        )}
        {typeof item.estimatedRefundCents === "number" && (
          <div className="border-brand-purple/15 bg-brand-purple/5 rounded-lg border px-2.5 py-2 text-[11px]">
            <p className="text-brand-purple-dark font-medium">
              Reembolso estimado en dinero:{" "}
              <strong className="tabular-nums">{formatCOP(item.estimatedRefundCents)}</strong>
            </p>
            {(item.estimatedPointsToRestore ?? 0) > 0 && (
              <p className="text-brand-purple mt-0.5 flex items-center gap-1 font-medium">
                <Sparkles className="h-3 w-3 flex-shrink-0" aria-hidden />
                <span>
                  + {item.estimatedPointsToRestore!.toLocaleString("es-CO")} Puntos Lucams volverán
                  a tu saldo al aprobarse el reembolso.
                </span>
              </p>
            )}
          </div>
        )}
        <label
          htmlFor={`retract-reason-${item.orderItemId}`}
          className="text-brand-muted block text-[11px]"
        >
          {texts.reasonLabel}
        </label>
        <textarea
          id={`retract-reason-${item.orderItemId}`}
          name="reason"
          rows={2}
          maxLength={300}
          placeholder={texts.reasonPlaceholder}
          className="border-brand-purple/20 focus:ring-brand-purple/30 w-full rounded-md border px-2 py-1.5 text-xs focus:ring-2 focus:outline-none"
        />
        <div className="text-brand-muted text-[10px] [&_a]:underline">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
            {texts.policyNote}
          </ReactMarkdown>
        </div>
        {state?.error && <p className="text-[11px] text-red-700">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="bg-brand-purple-dark hover:bg-brand-purple inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-white transition-colors disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : texts.submit}
        </button>
      </form>
    </details>
  );
}
