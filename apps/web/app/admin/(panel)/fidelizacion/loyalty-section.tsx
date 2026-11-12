"use client";

/*
 * Subsección "Puntos Lucams" de /admin/fidelizacion: tasas de acumulación y
 * redención, mínimo, tope %, toggle del programa, simulador económico en vivo y
 * expiración preparada. Protegida con Step-up MFA (useMfaReauthAction) para
 * SUPERADMIN y modo solo lectura para FINANCE_ANALYST.
 */

import { useState } from "react";
import { AlertTriangle, Calculator, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMfaReauthAction } from "@/components/admin/mfa-reauth";
import { formatCOP } from "@/lib/format";
import { saveLoyaltySettingsAction, type LoyaltyActionState } from "./actions";
import type { LoyaltySettings } from "@/features/loyalty/settings";

const MIN_EARN_TIMES_REDEEM_PRODUCT = 4_000; // Retorno máximo permitido: 25%

export function LoyaltySection({
  initial,
  readOnly = false,
}: {
  initial: LoyaltySettings;
  readOnly?: boolean;
}) {
  const [state, formAction, pending, reauthModal] =
    useMfaReauthAction<LoyaltyActionState>(saveLoyaltySettingsAction);

  const [enabled, setEnabled] = useState(initial.enabled);
  const [earnCopPerPoint, setEarnCopPerPoint] = useState(String(initial.earnCopPerPoint));
  const [redeemPointsPer1000, setRedeemPointsPer1000] = useState(
    String(initial.redeemPointsPer1000),
  );
  const [redeemMinPoints, setRedeemMinPoints] = useState(String(initial.redeemMinPoints));
  const [redeemMaxPercent, setRedeemMaxPercent] = useState(String(initial.redeemMaxPercent));
  const [expirationEnabled, setExpirationEnabled] = useState(initial.expirationEnabled);
  const [expirationDays, setExpirationDays] = useState(String(initial.expirationDays));

  // Re-sincroniza cuando el server re-renderiza con las settings ya guardadas
  // (patrón oficial "adjust state during render"; si el guardado falla, initial
  // no cambia y se conservan las ediciones del admin).
  const initialKey = JSON.stringify(initial);
  const [prevInitialKey, setPrevInitialKey] = useState(initialKey);
  if (prevInitialKey !== initialKey) {
    setPrevInitialKey(initialKey);
    setEnabled(initial.enabled);
    setEarnCopPerPoint(String(initial.earnCopPerPoint));
    setRedeemPointsPer1000(String(initial.redeemPointsPer1000));
    setRedeemMinPoints(String(initial.redeemMinPoints));
    setRedeemMaxPercent(String(initial.redeemMaxPercent));
    setExpirationEnabled(initial.expirationEnabled);
    setExpirationDays(String(initial.expirationDays));
  }

  const dirty =
    enabled !== initial.enabled ||
    earnCopPerPoint !== String(initial.earnCopPerPoint) ||
    redeemPointsPer1000 !== String(initial.redeemPointsPer1000) ||
    redeemMinPoints !== String(initial.redeemMinPoints) ||
    redeemMaxPercent !== String(initial.redeemMaxPercent) ||
    expirationEnabled !== initial.expirationEnabled ||
    expirationDays !== String(initial.expirationDays);

  // Simulador económico en vivo (enteros exactos en centavos COP)
  const earnNum = Number.parseInt(earnCopPerPoint, 10);
  const redeemNum = Number.parseInt(redeemPointsPer1000, 10);
  const minPtsNum = Number.parseInt(redeemMinPoints, 10);
  const maxPctNum = Number.parseInt(redeemMaxPercent, 10);

  const hasValidSim =
    Number.isFinite(earnNum) && earnNum >= 100 && Number.isFinite(redeemNum) && redeemNum >= 1;

  const rateProduct = hasValidSim ? earnNum * redeemNum : MIN_EARN_TIMES_REDEEM_PRODUCT;
  const blockedByCap = hasValidSim && rateProduct < MIN_EARN_TIMES_REDEEM_PRODUCT;
  const cashbackPct = hasValidSim ? 100_000 / rateProduct : 0;
  const pointValueCents = hasValidSim ? Math.floor(100_000 / redeemNum) : 0;
  const sampleOrderPesos = 100_000; // $100.000 COP de ejemplo
  const samplePointsEarned = hasValidSim ? Math.floor(sampleOrderPesos / earnNum) : 0;
  const sampleFutureDiscountCents = samplePointsEarned * pointValueCents;
  const minRedeemDiscountCents =
    hasValidSim && Number.isFinite(minPtsNum) && minPtsNum > 0 ? minPtsNum * pointValueCents : 0;

  const simHealth = (() => {
    if (!hasValidSim) {
      return {
        label: "Valores incompletos",
        pillClass: "bg-slate-100 text-slate-700",
        barColor: "#94A3B8",
      };
    }
    if (blockedByCap) {
      return {
        label: "Bloqueado (> 25% tope)",
        pillClass: "bg-rose-100 text-rose-800",
        barColor: "#E11D48",
      };
    }
    if (cashbackPct > 15) {
      return {
        label: "Agresivo (15–25%)",
        pillClass: "bg-amber-100 text-amber-800",
        barColor: "#D97706",
      };
    }
    if (cashbackPct > 5) {
      return {
        label: "Promocional (5–15%)",
        pillClass: "bg-blue-100 text-blue-800",
        barColor: "#2563EB",
      };
    }
    return {
      label: "Saludable (≤ 5%)",
      pillClass: "bg-emerald-100 text-emerald-800",
      barColor: "#059669",
    };
  })();

  const capBarPct = hasValidSim ? Math.min(100, Math.max(3, (cashbackPct / 25) * 100)) : 0;

  const inputClass =
    "border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 mt-1 block h-10 w-full rounded-lg border bg-white px-3 text-sm tabular-nums transition focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-600";

  return (
    <>
      <form action={formAction} className="space-y-4">
        <fieldset disabled={readOnly} className="space-y-4">
          {/* Los checkboxes no envían nada cuando están apagados → hidden espejo. */}
          <input type="hidden" name="enabled" value={enabled ? "1" : "0"} />
          <input type="hidden" name="expirationEnabled" value={expirationEnabled ? "1" : "0"} />

          <label className="border-brand-purple/12 bg-brand-purple/[0.02] text-brand-purple-dark flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm font-semibold">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="accent-brand-purple h-4 w-4 rounded"
            />
            <span>
              Programa activo (los clientes acumulan puntos al pagar y pueden redimirlos en el
              checkout)
            </span>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-brand-purple-dark block text-sm font-semibold">
              Pesos pagados por punto
              <input
                type="number"
                name="earnCopPerPoint"
                min={100}
                max={1000000}
                step={100}
                required
                value={earnCopPerPoint}
                onChange={(e) => setEarnCopPerPoint(e.target.value)}
                className={inputClass}
              />
              <span className="text-brand-muted mt-1 block text-xs font-normal">
                1.000 = 1 punto por cada $1.000 del total pagado (se redondea hacia abajo).
              </span>
            </label>
            <label className="text-brand-purple-dark block text-sm font-semibold">
              Puntos por $1.000 de descuento
              <input
                type="number"
                name="redeemPointsPer1000"
                min={1}
                max={100000}
                step={1}
                required
                value={redeemPointsPer1000}
                onChange={(e) => setRedeemPointsPer1000(e.target.value)}
                className={inputClass}
              />
              <span className="text-brand-muted mt-1 block text-xs font-normal">
                100 = cada 100 puntos valen $1.000 COP de descuento al redimir.
              </span>
            </label>
            <label className="text-brand-purple-dark block text-sm font-semibold">
              Mínimo de puntos por redención
              <input
                type="number"
                name="redeemMinPoints"
                min={1}
                max={1000000}
                step={1}
                required
                value={redeemMinPoints}
                onChange={(e) => setRedeemMinPoints(e.target.value)}
                className={inputClass}
              />
              <span className="text-brand-muted mt-1 block text-xs font-normal">
                Saldo mínimo exigible en el checkout para habilitar el uso de puntos.
              </span>
            </label>
            <label className="text-brand-purple-dark block text-sm font-semibold">
              Tope de redención (% del subtotal)
              <input
                type="number"
                name="redeemMaxPercent"
                min={0}
                max={100}
                step={5}
                required
                value={redeemMaxPercent}
                onChange={(e) => setRedeemMaxPercent(e.target.value)}
                className={inputClass}
              />
              <span className="text-brand-muted mt-1 block text-xs font-normal">
                % máximo del subtotal de productos (después del cupón) pagadero con puntos. El envío
                nunca se cubre con puntos.
              </span>
            </label>
          </div>

          {/* Simulador económico en vivo */}
          <div
            className={`rounded-xl border p-4 transition-colors ${
              blockedByCap
                ? "border-rose-200 bg-rose-50/70"
                : "border-brand-purple/12 bg-slate-50/70"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Calculator
                  className={`h-4 w-4 ${blockedByCap ? "text-rose-600" : "text-brand-purple"}`}
                />
                <span className="text-brand-purple-dark text-xs font-bold tracking-wide uppercase">
                  Simulador económico en vivo
                </span>
              </div>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${simHealth.pillClass}`}
              >
                {simHealth.label}
              </span>
            </div>

            {hasValidSim ? (
              <>
                <div className="mt-3 grid gap-3 sm:grid-cols-4">
                  <div className="rounded-lg bg-white/90 p-2.5 shadow-2xs">
                    <p className="text-brand-muted text-[11px]">Retorno efectivo (cashback)</p>
                    <p
                      className={`mt-0.5 text-base font-bold tabular-nums ${
                        blockedByCap ? "text-rose-700" : "text-brand-purple-dark"
                      }`}
                    >
                      {cashbackPct.toFixed(2).replace(".", ",")}%
                    </p>
                    <p className="text-brand-muted text-[10px]">Tope permitido: 25,00%</p>
                  </div>
                  <div className="rounded-lg bg-white/90 p-2.5 shadow-2xs">
                    <p className="text-brand-muted text-[11px]">Valor contable de 1 punto</p>
                    <p className="text-brand-purple-dark mt-0.5 text-base font-bold tabular-nums">
                      {formatCOP(pointValueCents)}
                    </p>
                    <p className="text-brand-muted text-[10px]">
                      {redeemNum.toLocaleString("es-CO")} pts = $1.000 COP
                    </p>
                  </div>
                  <div className="rounded-lg bg-white/90 p-2.5 shadow-2xs">
                    <p className="text-brand-muted text-[11px]">En compra de $100.000</p>
                    <p className="text-brand-purple-dark mt-0.5 text-base font-bold tabular-nums">
                      +{samplePointsEarned.toLocaleString("es-CO")} pts
                    </p>
                    <p className="text-brand-muted text-[10px]">
                      Equivalen a {formatCOP(sampleFutureDiscountCents)} futuros
                    </p>
                  </div>
                  <div className="rounded-lg bg-white/90 p-2.5 shadow-2xs">
                    <p className="text-brand-muted text-[11px]">Umbral mínimo redimible</p>
                    <p className="text-brand-purple-dark mt-0.5 text-base font-bold tabular-nums">
                      {formatCOP(minRedeemDiscountCents)}
                    </p>
                    <p className="text-brand-muted text-[10px]">
                      Tope por orden: {Number.isFinite(maxPctNum) ? `${maxPctNum}%` : "—"} del
                      subtotal
                    </p>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between text-[11px]">
                    <span className="text-brand-muted">
                      Uso del margen promocional frente al límite de seguridad (25%)
                    </span>
                    <span className="text-brand-purple-dark font-semibold tabular-nums">
                      {cashbackPct.toFixed(1).replace(".", ",")}% / 25%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-200/80">
                    <div
                      className="admin-bar-grow-x h-full rounded-full transition-all"
                      style={{ width: `${capBarPct}%`, backgroundColor: simHealth.barColor }}
                    />
                  </div>
                </div>

                {blockedByCap && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs text-rose-800">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                    <span>
                      <strong>Combinación bloqueada por protección de margen:</strong> el retorno
                      efectivo supera el <strong>25%</strong>. Sube los pesos pagados por punto o
                      los puntos requeridos por cada $1.000 COP.
                    </span>
                  </div>
                )}
              </>
            ) : (
              <p className="text-brand-muted mt-2 text-xs">
                Ingresa valores numéricos válidos para simular el costo financiero del programa.
              </p>
            )}
          </div>

          <div className="border-brand-purple/10 rounded-xl border p-4">
            <p className="text-brand-purple-dark text-sm font-semibold">
              Expiración de puntos (preparada — sin efecto todavía)
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-4">
              <label className="text-brand-purple-dark flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={expirationEnabled}
                  onChange={(e) => setExpirationEnabled(e.target.checked)}
                  className="accent-brand-purple h-4 w-4 rounded"
                />
                Expiración activa
              </label>
              <label className="text-brand-purple-dark flex items-center gap-2 text-sm">
                Días de vigencia
                <input
                  type="number"
                  name="expirationDays"
                  min={1}
                  max={3650}
                  step={1}
                  required
                  value={expirationDays}
                  onChange={(e) => setExpirationDays(e.target.value)}
                  className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 h-9 w-24 rounded-lg border bg-white px-3 text-sm tabular-nums focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-50"
                />
              </label>
            </div>
            <p className="text-brand-muted mt-2 text-xs">
              No hay proceso automático que venza puntos todavía: activarla hoy no descuenta saldos.
              Cuando se active el job programado, estos parámetros quedarán operativos sin cambios
              adicionales.
            </p>
          </div>
        </fieldset>

        {!readOnly && dirty && !pending && !blockedByCap && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
            <span>
              Tienes cambios sin guardar — no aplican en la tienda hasta que pulses «Guardar
              configuración».
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
              disabled={pending || !dirty || blockedByCap}
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
