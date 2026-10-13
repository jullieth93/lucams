"use client";

/*
 * Puntos Lucams — redención en el paso de pago del checkout (2026-10-12).
 *
 * Mismo patrón de tres estados que CouponField:
 *  1. Redención aplicada y vigente → caja verde con botón "quitar".
 *  2. Redención guardada pero ya INVÁLIDA (saldo gastado en otra compra, el
 *     carrito bajó del tope, el programa se pausó…) → caja ámbar con la razón
 *     + "quitar". El resumen ya mostró el total SIN el descuento.
 *  3. Sin redención → input de puntos a usar + "Usar puntos".
 *
 * El descuento real lo calcula el server (getCheckoutLoyalty) y lo muestra el
 * <OrderSummary>; acá solo damos feedback inmediato del intento.
 */

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, Check, AlertTriangle, X, Sparkles } from "lucide-react";
import { applyLoyaltyAction, removeLoyaltyAction, type LoyaltyActionState } from "./actions";
import { formatCOP } from "@/lib/format";

function RemoveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label="Quitar puntos aplicados"
      className="rounded-md p-1 transition-colors hover:bg-black/5 disabled:opacity-60"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
    </button>
  );
}

export function LoyaltyField({
  balance,
  minPoints,
  maxPercent,
  pointValueCents,
  appliedPoints,
  appliedDiscountCents,
  appliedError,
}: {
  /** Saldo actual del cliente. */
  balance: number;
  /** Mínimo de puntos por redención (config admin). */
  minPoints: number;
  /** Tope % del subtotal tras cupón (config admin). */
  maxPercent: number;
  /** Centavos COP por punto (para la equivalencia visible). */
  pointValueCents: number;
  appliedPoints?: number;
  appliedDiscountCents?: number;
  appliedError?: string;
}) {
  const [state, action, pending] = useActionState<LoyaltyActionState, FormData>(
    applyLoyaltyAction,
    null,
  );

  // Estado 1 — puntos aplicados y vigentes → caja verde con "quitar".
  if (appliedPoints && !appliedError) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-emerald-800">
        <Check className="h-4 w-4 flex-shrink-0 text-emerald-700" />
        <span className="text-sm">
          <span className="font-bold">{appliedPoints.toLocaleString("es-CO")} puntos</span>{" "}
          aplicados
          {appliedDiscountCents ? ` (−${formatCOP(appliedDiscountCents)})` : ""}
        </span>
        <form action={removeLoyaltyAction} className="ml-auto text-emerald-700">
          <RemoveButton />
        </form>
      </div>
    );
  }

  // Estado 2 — la redención guardada ya no es válida → caja ámbar + "quitar".
  if (appliedPoints && appliedError) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-amber-900">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
          <div className="flex-1 text-sm">
            <p role="alert">
              Tus <span className="font-bold">{appliedPoints.toLocaleString("es-CO")} puntos</span>{" "}
              ya no aplican: {appliedError}
            </p>
            <p className="mt-0.5 text-xs text-amber-800">Quítalos para continuar con el pago.</p>
          </div>
          <form action={removeLoyaltyAction} className="text-amber-700">
            <RemoveButton />
          </form>
        </div>
      </div>
    );
  }

  // Estado 3 — sin redención → saldo + input. Sin saldo suficiente, solo info.
  const errorMsg = state && !state.ok ? state.message : undefined;

  return (
    <div className="space-y-1.5">
      <p className="text-brand-muted flex items-center gap-1.5 text-xs">
        <Sparkles className="h-3.5 w-3.5" />
        Tienes <strong className="text-brand-purple-dark">{balance.toLocaleString("es-CO")}</strong>
        &nbsp;Puntos Lucams
        {balance > 0 && ` (≈ ${formatCOP(balance * pointValueCents)})`}
      </p>
      {balance >= minPoints ? (
        <form action={action} className="space-y-1.5">
          <div className="flex gap-2">
            <input
              id="loyalty-points"
              name="points"
              type="number"
              required
              min={minPoints}
              max={balance}
              step={1}
              inputMode="numeric"
              placeholder={`Mínimo ${minPoints.toLocaleString("es-CO")}`}
              aria-label="Puntos a redimir"
              aria-invalid={!!errorMsg}
              aria-describedby={errorMsg ? "loyalty-error" : undefined}
              className="border-brand-purple/20 focus:ring-brand-purple/30 min-w-0 flex-1 rounded-md border bg-white px-3 py-2 text-sm focus:ring-2 focus:outline-none"
            />
            <button
              type="submit"
              disabled={pending}
              className="bg-brand-purple-dark hover:bg-brand-purple inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-60"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Usar puntos"}
            </button>
          </div>
          <p className="text-brand-muted text-[11px]">
            {minPoints.toLocaleString("es-CO")} puntos = {formatCOP(minPoints * pointValueCents)} de
            descuento · hasta el {maxPercent}% del subtotal de tus productos.
          </p>
          {errorMsg && (
            <p id="loyalty-error" role="alert" className="text-xs text-red-700">
              {errorMsg}
            </p>
          )}
          {state?.ok && state.message && (
            <p className="text-xs font-semibold text-emerald-700">{state.message}</p>
          )}
        </form>
      ) : (
        <p className="text-brand-muted text-[11px]">
          Acumula {minPoints.toLocaleString("es-CO")} puntos para redimirlos como descuento en tu
          próxima compra.
        </p>
      )}
    </div>
  );
}
