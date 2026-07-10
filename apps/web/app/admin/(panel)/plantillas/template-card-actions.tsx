"use client";

import { useActionState } from "react";
import { Check, EyeOff } from "lucide-react";
import { setTemplateApprovalAction } from "./actions";

type St = { error?: string; success?: string } | null;

/** Botones Aprobar / Ocultar por plantilla. `status` decide qué CTA resaltar. */
export function TemplateCardActions({
  id,
  status,
}: {
  id: string;
  status: "aprobada" | "oculta" | "descartada";
}) {
  const [state, action, pending] = useActionState<St, FormData>(setTemplateApprovalAction, null);
  const isApproved = status === "aprobada";

  return (
    <div className="space-y-1">
      <div className="flex gap-1.5">
        <form action={action} className="flex-1">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="approved" value="1" />
          <button
            type="submit"
            disabled={pending || isApproved}
            className={`inline-flex w-full items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
              isApproved
                ? "cursor-default bg-emerald-100 text-emerald-800"
                : "bg-emerald-600 text-white hover:bg-emerald-700"
            }`}
          >
            <Check className="h-3.5 w-3.5" />
            {isApproved ? "Aprobada" : "Aprobar"}
          </button>
        </form>
        {!isApproved ? null : (
          <form action={action}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="approved" value="0" />
            <button
              type="submit"
              disabled={pending}
              aria-label="Ocultar plantilla"
              className="border-brand-purple/20 text-brand-muted hover:bg-brand-purple/5 inline-flex items-center justify-center rounded-md border px-2 py-1.5 text-xs font-semibold disabled:opacity-60"
            >
              <EyeOff className="h-3.5 w-3.5" />
            </button>
          </form>
        )}
      </div>
      {state?.error && <p className="text-[11px] text-rose-700">{state.error}</p>}
    </div>
  );
}
