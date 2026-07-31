"use client";

/*
 * F1 — Campo de cupón en el checkout (paso de pago).
 *
 * Tres estados (auditoría de flujo de cupones, 2026-07-18):
 *  1. Cupón aplicado y vigente  → caja verde con botón "quitar".
 *  2. Cupón aplicado pero INVÁLIDO (venció, se agotó, el carrito bajó del mínimo…)
 *     → caja ámbar que NOMBRA el cupón + la razón + botón "quitar". Antes esto caía
 *     al form vacío con un error rojo huérfano: callejón sin salida. Si el carrito
 *     vuelve a calificar, getAppliedCoupon deja de devolver error y reaparece la
 *     caja verde sola (recuperación automática).
 *  3. Sin cupón → input para escribir un código.
 *
 * El descuento real se refleja en el <OrderSummary> (server) tras revalidar; acá
 * solo damos feedback inmediato del intento (useActionState).
 */

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Ticket, X, Loader2, Check, AlertTriangle } from "lucide-react";
import { applyCouponAction, removeCouponAction, type CouponActionState } from "./actions";
import type { CheckoutTexts } from "../checkout-texts";

/**
 * Botón "quitar cupón" con estado de carga propio (useFormStatus lee el <form>
 * contenedor). Evita el doble clic y da feedback mientras el server procesa.
 */
function RemoveButton({ code }: { code: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={`Quitar cupón ${code}`}
      className="rounded-md p-1 transition-colors hover:bg-black/5 disabled:opacity-60"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
    </button>
  );
}

export function CouponField({
  appliedCode,
  appliedError,
  texts,
}: {
  appliedCode?: string;
  appliedError?: string;
  /** Textos CMS del bloque de pago/cupón (roadmap B8). */
  texts: CheckoutTexts["payment"];
}) {
  const [state, action, pending] = useActionState<CouponActionState, FormData>(
    applyCouponAction,
    null,
  );

  // Foco: cuando el cupón pasa de aplicado (verde/ámbar) → sin cupón (el cliente lo
  // quitó), el input reaparece y devolvemos el foco ahí para reintentar. Solo en la
  // transición real; nunca en el mount inicial (no robamos el foco al abrir la página
  // con un cupón ya aplicado). El hook corre ANTES de cualquier early return.
  const inputRef = useRef<HTMLInputElement>(null);
  const prevAppliedRef = useRef<string | undefined>(appliedCode);
  useEffect(() => {
    const wasApplied = Boolean(prevAppliedRef.current);
    const isApplied = Boolean(appliedCode);
    if (wasApplied && !isApplied) inputRef.current?.focus();
    prevAppliedRef.current = appliedCode;
  }, [appliedCode]);

  // Estado 1 — cupón aplicado y vigente → caja verde con "quitar".
  if (appliedCode && !appliedError) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-emerald-800">
        <Check className="h-4 w-4 flex-shrink-0 text-emerald-700" />
        <span className="text-sm">
          {texts.couponLabel} <span className="font-bold">{appliedCode}</span>{" "}
          {texts.couponAppliedSuffix}
        </span>
        <form action={removeCouponAction} className="ml-auto text-emerald-700">
          <RemoveButton code={appliedCode} />
        </form>
      </div>
    );
  }

  // Estado 2 — cupón aplicado pero ya no válido → caja ámbar que lo nombra + razón + "quitar".
  if (appliedCode && appliedError) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-amber-900">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
          <div className="flex-1 text-sm">
            <p role="alert">
              {texts.couponInvalidPre} <span className="font-bold">{appliedCode}</span>{" "}
              {texts.couponInvalidPost} {appliedError}
            </p>
            <p className="mt-0.5 text-xs text-amber-800">{texts.couponInvalidNote}</p>
          </div>
          <form action={removeCouponAction} className="text-amber-700">
            <RemoveButton code={appliedCode} />
          </form>
        </div>
      </div>
    );
  }

  // Estado 3 — sin cupón → input. `errorMsg` es el feedback del último intento de aplicar.
  const errorMsg = state && !state.ok ? state.message : undefined;

  return (
    <form action={action} className="space-y-1.5">
      <label htmlFor="coupon-code" className="text-brand-muted flex items-center gap-1.5 text-xs">
        <Ticket className="h-3.5 w-3.5" />
        {texts.couponAsk}
      </label>
      <div className="flex gap-2">
        <input
          ref={inputRef}
          id="coupon-code"
          name="code"
          type="text"
          required
          autoCapitalize="characters"
          placeholder={texts.couponPlaceholder}
          aria-invalid={!!errorMsg}
          aria-describedby={errorMsg ? "coupon-error" : undefined}
          className="border-brand-purple/20 focus:ring-brand-purple/30 min-w-0 flex-1 rounded-md border bg-white px-3 py-2 text-sm uppercase placeholder:normal-case focus:ring-2 focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="bg-brand-purple-dark hover:bg-brand-purple inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : texts.couponApply}
        </button>
      </div>
      {errorMsg && (
        <p id="coupon-error" role="alert" className="text-xs text-red-700">
          {errorMsg}
        </p>
      )}
    </form>
  );
}
