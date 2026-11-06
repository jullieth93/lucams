/*
 * Admin > Métricas — panel «Vigilancia fiscal» (ADR-196).
 *
 * Lee en vivo el snapshot del año fiscal (getFiscalYearSnapshot) y evalúa las
 * reglas DIAN (tope de facturación electrónica y condición de IVA por tarjeta).
 * Es la superficie de SEGUIMIENTO permanente; la alerta proactiva la emite el
 * cron diario /api/cron/fiscal-watch (notificación in-app + email 90 %/100 %).
 */

import { Scale } from "lucide-react";
import { AdminBadge, AdminCard } from "@/components/admin-page";
import { formatCOP } from "@/lib/format";
import { formatDateLongCO } from "@/lib/datetime";
import { evaluateFiscalRules, getFiscalYearSnapshot } from "@/features/fiscal-watch/service";
import type { FiscalLevel } from "@/features/fiscal-watch/config";

const LEVEL_BADGE: Record<FiscalLevel, { tone: "emerald" | "amber" | "rose"; label: string }> = {
  ok: { tone: "emerald", label: "En rango" },
  watch: { tone: "amber", label: "Seguimiento (70 %)" },
  warning: { tone: "amber", label: "Preparar habilitación (90 %)" },
  critical: { tone: "rose", label: "Umbral superado (100 %)" },
};

const LEVEL_BAR: Record<FiscalLevel, string> = {
  ok: "bg-emerald-500",
  watch: "bg-amber-500",
  warning: "bg-amber-600",
  critical: "bg-rose-600",
};

function pct(ratio: number): string {
  return `${Math.floor(ratio * 100)} %`;
}

export async function FiscalWatchPanel() {
  const snapshot = await getFiscalYearSnapshot();
  const evaluations = evaluateFiscalRules(snapshot);

  return (
    <AdminCard className="p-5">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-brand-purple-dark font-display flex items-center gap-1.5 text-base font-bold">
            <Scale className="h-4 w-4 text-amber-600" />
            Vigilancia fiscal {snapshot.year}
          </h2>
          <p className="text-brand-muted text-xs">
            Umbrales DIAN medidos en vivo · UVT {snapshot.year} = $
            {snapshot.uvtCop.toLocaleString("es-CO")} · alertas automáticas al 70 % (in-app), 90 % y
            100 % (in-app + correo)
          </p>
        </div>
        <AdminBadge tone="slate">Base bruta: incluye reembolsadas</AdminBadge>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {evaluations.map((ev) => {
          const badge = LEVEL_BADGE[ev.level];
          const barWidth = Math.min(100, Math.round(ev.currentRatio * 100));
          return (
            <div key={ev.ruleId} className="rounded-xl border border-slate-200 p-4">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-brand-purple-dark text-sm font-semibold">{ev.name}</h3>
                <AdminBadge tone={badge.tone}>{badge.label}</AdminBadge>
              </div>
              <p className="text-brand-muted mb-3 text-xs">{ev.legalBasis}</p>

              <div
                className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100"
                role="progressbar"
                aria-label={`${ev.name}: ${pct(ev.currentRatio)} del umbral`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={barWidth}
              >
                <div
                  className={`h-full rounded-full ${LEVEL_BAR[ev.level]}`}
                  style={{ width: `${Math.max(barWidth, ev.currentCop > 0 ? 1 : 0)}%` }}
                />
              </div>

              <dl className="text-brand-purple-dark mt-3 space-y-1 text-sm tabular-nums">
                <div className="flex justify-between gap-2">
                  <dt className="text-brand-muted">Acumulado {snapshot.year}</dt>
                  <dd className="font-semibold">
                    {formatCOP(ev.currentCop)}{" "}
                    <span className="text-brand-muted">({pct(ev.currentRatio)})</span>
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-brand-muted">Umbral</dt>
                  <dd>{formatCOP(ev.thresholdCop)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-brand-muted">Proyección de cierre (ritmo 30 d)</dt>
                  <dd
                    className={
                      ev.projectedRatio >= 1 ? "font-semibold text-rose-700" : "font-semibold"
                    }
                  >
                    {formatCOP(ev.projectedYearEndCop)}{" "}
                    <span className="text-brand-muted">({pct(ev.projectedRatio)})</span>
                  </dd>
                </div>
                {ev.estimatedCrossingAt && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-brand-muted">Cruce estimado del 100 %</dt>
                    <dd className="font-semibold text-amber-700">
                      {formatDateLongCO(ev.estimatedCrossingAt)}
                    </dd>
                  </div>
                )}
              </dl>

              {ev.level !== "ok" && (
                <p className="mt-3 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">
                  <strong>Qué hacer:</strong> {ev.action}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-brand-muted mt-4 text-xs">
        Pagos electrónicos del año (tarjeta + PSE + Nequi + Bancolombia):{" "}
        <strong className="text-brand-purple-dark">
          {formatCOP(snapshot.electronicIncomeYtdCop)}
        </strong>{" "}
        — línea informativa para el contador: la regla de IVA cuenta solo tarjeta (PSE es débito a
        cuenta y Nequi es billetera). Las ventas B2B por cotización se cobran por fuera de la tienda
        en línea y no se auto-suman aquí.
      </p>
    </AdminCard>
  );
}
