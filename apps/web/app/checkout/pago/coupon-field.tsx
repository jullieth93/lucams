"use client";

/*
 * F1 — Campo de cupón en el checkout (paso de pago).
 *
 * Si hay un cupón aplicado y vigente, muestra la caja "aplicado" con opción de
 * quitarlo. Si no, muestra el input para escribir un código. El descuento real se
 * refleja en el <OrderSummary> (server) tras revalidar; acá solo damos feedback
 * inmediato del intento (useActionState).
 */

import { useActionState } from "react";
import { Ticket, X, Loader2, Check } from "lucide-react";
import { applyCouponAction, removeCouponAction, type CouponActionState } from "./actions";

export function CouponField({
  appliedCode,
  appliedError,
}: {
  appliedCode?: string;
  appliedError?: string;
}) {
  const [state, action, pending] = useActionState<CouponActionState, FormData>(
    applyCouponAction,
    null,
  );

  // Cupón aplicado y vigente → caja con opción de quitar.
  if (appliedCode && !appliedError) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
        <Check className="h-4 w-4 flex-shrink-0 text-emerald-700" />
        <span className="text-sm text-emerald-800">
          Cupón <span className="font-bold">{appliedCode}</span> aplicado
        </span>
        <form action={removeCouponAction} className="ml-auto">
          <button
            type="submit"
            aria-label={`Quitar cupón ${appliedCode}`}
            className="rounded-md p-1 text-emerald-700 transition-colors hover:bg-emerald-100"
          >
            <X className="h-4 w-4" />
          </button>
        </form>
      </div>
    );
  }

  const errorMsg = appliedError ?? (state && !state.ok ? state.message : undefined);

  return (
    <form action={action} className="space-y-1.5">
      <label htmlFor="coupon-code" className="text-brand-muted flex items-center gap-1.5 text-xs">
        <Ticket className="h-3.5 w-3.5" />
        ¿Tienes un cupón?
      </label>
      <div className="flex gap-2">
        <input
          id="coupon-code"
          name="code"
          type="text"
          autoCapitalize="characters"
          placeholder="Escribe tu código"
          className="border-brand-purple/20 focus:ring-brand-purple/30 min-w-0 flex-1 rounded-md border bg-white px-3 py-2 text-sm uppercase focus:ring-2 focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="bg-brand-purple-dark hover:bg-brand-purple inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Aplicar"}
        </button>
      </div>
      {errorMsg && <p className="text-xs text-red-700">{errorMsg}</p>}
    </form>
  );
}
