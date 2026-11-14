"use client";

/*
 * Subsección "Invita y gana" de /admin/fidelizacion: % OFF de los cupones
 * personales (bienvenida del referido + premio del referente), días de
 * vigencia, simulador de impacto por referido convertido y toggle del programa.
 * Protegida con Step-up MFA (useMfaReauthAction) para SUPERADMIN y modo solo
 * lectura para FINANCE_ANALYST.
 */

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Gift, Loader2, Lock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMfaReauthAction } from "@/components/admin/mfa-reauth";
import { formatCOP } from "@/lib/format";
import { saveReferralSettingsAction, type LoyaltyActionState } from "./actions";
import type { ReferralSettings } from "@/features/loyalty/settings";

export function ReferralsSection({
  initial,
  readOnly = false,
}: {
  initial: ReferralSettings;
  readOnly?: boolean;
}) {
  const [state, formAction, pending, reauthModal] = useMfaReauthAction<LoyaltyActionState>(
    saveReferralSettingsAction,
  );

  const [enabled, setEnabled] = useState(initial.enabled);
  const [rewardPercent, setRewardPercent] = useState(String(initial.rewardPercent));
  const [rewardDays, setRewardDays] = useState(String(initial.rewardDays));

  // Re-sincroniza tras un guardado OK (patrón "adjust state during render").
  const initialKey = JSON.stringify(initial);
  const [prevInitialKey, setPrevInitialKey] = useState(initialKey);
  if (prevInitialKey !== initialKey) {
    setPrevInitialKey(initialKey);
    setEnabled(initial.enabled);
    setRewardPercent(String(initial.rewardPercent));
    setRewardDays(String(initial.rewardDays));
  }

  const dirty =
    enabled !== initial.enabled ||
    rewardPercent !== String(initial.rewardPercent) ||
    rewardDays !== String(initial.rewardDays);

  const pctNum = Number.parseInt(rewardPercent, 10);
  const daysNum = Number.parseInt(rewardDays, 10);
  const hasValidPreview =
    Number.isFinite(pctNum) &&
    pctNum >= 1 &&
    pctNum <= 100 &&
    Number.isFinite(daysNum) &&
    daysNum >= 1;

  // Ejemplo en centavos sobre dos pedidos de $100.000 COP (bienvenida + premio)
  const sampleOrderCents = 10_000_000;
  const perCouponDiscountCents = hasValidPreview
    ? Math.round((sampleOrderCents * pctNum) / 100)
    : 0;
  const totalAcquisitionCostCents = perCouponDiscountCents * 2;
  const highRewardWarning = hasValidPreview && pctNum > 30;

  const inputClass =
    "border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 mt-1 block h-10 w-full rounded-lg border bg-white px-3 text-sm tabular-nums transition focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-600";

  return (
    <>
      <form action={formAction} className="space-y-4">
        <fieldset disabled={readOnly} className="space-y-4">
          {/* Checkbox apagado no viaja en el FormData → hidden espejo. */}
          <input type="hidden" name="enabled" value={enabled ? "1" : "0"} />

          <label className="border-brand-purple/12 bg-brand-purple/[0.02] text-brand-purple-dark flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm font-semibold">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="accent-brand-purple h-4 w-4 rounded"
            />
            <span>Programa activo (se emiten cupones personales de bienvenida y de premio)</span>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-brand-purple-dark block text-sm font-semibold">
              % OFF de la recompensa
              <input
                type="number"
                name="rewardPercent"
                min={1}
                max={100}
                step={1}
                required
                value={rewardPercent}
                onChange={(e) => setRewardPercent(e.target.value)}
                className={inputClass}
              />
              <span className="text-brand-muted mt-1 block text-xs font-normal">
                Para campañas puntuales (ej. 25%): sube el % acá y vuelve a 10% al cerrar la
                campaña. Los cupones ya emitidos conservan su porcentaje original.
              </span>
            </label>
            <label className="text-brand-purple-dark block text-sm font-semibold">
              Días de vigencia del cupón
              <input
                type="number"
                name="rewardDays"
                min={1}
                max={3650}
                step={1}
                required
                value={rewardDays}
                onChange={(e) => setRewardDays(e.target.value)}
                className={inputClass}
              />
              <span className="text-brand-muted mt-1 block text-xs font-normal">
                Vigencia para cupones emitidos desde ahora. Los cupones anteriores conservan su
                fecha de vencimiento.
              </span>
            </label>
          </div>

          {/* Vista previa de impacto comercial por referido convertido */}
          {hasValidPreview && (
            <div className="border-brand-purple/12 rounded-xl border bg-slate-50/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Gift className="text-brand-purple h-4 w-4" />
                  <span className="text-brand-purple-dark text-xs font-bold tracking-wide uppercase">
                    Impacto por referido convertido (ejemplo base $100.000 COP)
                  </span>
                </div>
                <span className="text-brand-purple-dark bg-brand-purple/10 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold">
                  <Lock className="h-3 w-3" />
                  No transferibles (atados al titular)
                </span>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-white/90 p-2.5 shadow-2xs">
                  <p className="text-brand-muted text-[11px]">1. Cupón bienvenida (referido)</p>
                  <p className="text-brand-purple-dark mt-0.5 text-base font-bold tabular-nums">
                    {pctNum}% OFF ({formatCOP(perCouponDiscountCents)})
                  </p>
                  <p className="text-brand-muted text-[10px]">
                    Al registrarse · vence en {daysNum} días
                  </p>
                </div>
                <div className="rounded-lg bg-white/90 p-2.5 shadow-2xs">
                  <p className="text-brand-muted text-[11px]">2. Cupón premio (referente)</p>
                  <p className="text-brand-purple-dark mt-0.5 text-base font-bold tabular-nums">
                    {pctNum}% OFF ({formatCOP(perCouponDiscountCents)})
                  </p>
                  <p className="text-brand-muted text-[10px]">
                    Tras 1ª compra pagada · vence en {daysNum} días
                  </p>
                </div>
                <div className="rounded-lg bg-white/90 p-2.5 shadow-2xs">
                  <p className="text-brand-muted text-[11px]">Inversión comercial máxima</p>
                  <p className="text-brand-purple-dark mt-0.5 text-base font-bold tabular-nums">
                    {formatCOP(totalAcquisitionCostCents)}
                  </p>
                  <p className="text-brand-muted text-[10px]">
                    En 2 órdenes de $100.000 ($200.000 GMV)
                  </p>
                </div>
              </div>

              {highRewardWarning && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <span>
                    <strong>Recompensa alta ({pctNum}% OFF):</strong> verifica el margen bruto de
                    las categorías elegibles antes de activar porcentajes superiores al 30%.
                  </span>
                </div>
              )}
            </div>
          )}
        </fieldset>

        {!readOnly && dirty && !pending && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
            <span>
              Tienes cambios sin guardar — no aplican hasta que pulses «Guardar configuración».
            </span>
          </div>
        )}
        {state?.error && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
            <span>{state.error}</span>
          </div>
        )}
        {state?.ok && (
          <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <span>{state.ok}</span>
          </div>
        )}

        {!readOnly && (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              disabled={pending || !dirty}
              className="bg-brand-purple-dark text-white hover:brightness-110"
            >
              {pending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando…
                </>
              ) : dirty ? (
                <>
                  <ShieldCheck className="mr-1.5 h-4 w-4" />
                  Guardar configuración
                </>
              ) : (
                "Sin cambios por guardar"
              )}
            </Button>
            <span className="text-brand-muted text-xs">
              Requiere confirmación MFA reciente (≤ 10 min).
            </span>
          </div>
        )}
      </form>
      {reauthModal}
    </>
  );
}
