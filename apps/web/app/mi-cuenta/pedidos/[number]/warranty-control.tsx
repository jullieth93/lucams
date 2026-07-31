"use client";

/*
 * Garantía (Ley 1480) — control por item (cliente). Muestra:
 *  - el estado si ya hay un reclamo activo,
 *  - un botón "Reportar garantía" si el item está dentro del periodo de garantía,
 *  - una nota si ya está fuera de garantía.
 */

import { useActionState } from "react";
import { ShieldCheck, Loader2 } from "lucide-react";
import { requestWarrantyAction } from "./actions";
import type { AccountTexts } from "../../account-texts";

type WarrantyItem = {
  orderItemId: string;
  eligible: boolean;
  reason: "NOT_DELIVERED" | "OUT_OF_WARRANTY" | "ACTIVE_CLAIM" | null;
  warrantyEndsAt: string | Date | null;
  activeClaimStatus: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "🛡️ Garantía en revisión",
  IN_REVIEW: "🔍 Garantía en diagnóstico",
  APPROVED: "✅ Garantía aprobada — en proceso",
  RESOLVED: "💜 Garantía resuelta",
  REJECTED: "❌ Garantía rechazada",
};

const dateFmt = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export function WarrantyControl({
  item,
  texts,
}: {
  item: WarrantyItem;
  texts: AccountTexts["warranty"];
}) {
  const [state, action, pending] = useActionState(requestWarrantyAction, null);

  if (item.activeClaimStatus) {
    return (
      <p className="bg-brand-purple/5 text-brand-purple-dark mt-1.5 inline-block rounded-md px-2 py-1 text-[11px] font-medium">
        {STATUS_LABEL[item.activeClaimStatus] ?? item.activeClaimStatus}
      </p>
    );
  }

  if (state?.success) {
    return <p className="mt-1.5 text-[11px] font-medium text-emerald-700">{state.success}</p>;
  }

  if (!item.eligible) {
    if (item.reason === "OUT_OF_WARRANTY") {
      return <p className="text-brand-muted mt-1 text-[11px]">{texts.out}</p>;
    }
    return null;
  }

  const endsAt = item.warrantyEndsAt ? new Date(item.warrantyEndsAt) : null;

  return (
    <details className="mt-1.5">
      <summary className="text-brand-muted hover:text-brand-purple inline-flex cursor-pointer list-none items-center gap-1 text-[11px] font-medium">
        <ShieldCheck className="h-3 w-3" />
        {texts.cta}
      </summary>
      <form action={action} className="mt-2 space-y-2">
        <input type="hidden" name="orderItemId" value={item.orderItemId} />
        <label
          htmlFor={`warranty-desc-${item.orderItemId}`}
          className="text-brand-muted block text-[11px]"
        >
          {texts.descLabel}
        </label>
        <textarea
          id={`warranty-desc-${item.orderItemId}`}
          name="description"
          rows={3}
          required
          minLength={10}
          maxLength={2000}
          placeholder={texts.descPlaceholder}
          className="border-brand-purple/20 focus:ring-brand-purple/30 w-full rounded-md border px-2 py-1.5 text-xs focus:ring-2 focus:outline-none"
        />
        {endsAt && (
          <p className="text-brand-muted text-[10px]">
            {texts.covered.replace("{fecha}", dateFmt.format(endsAt))}
          </p>
        )}
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
