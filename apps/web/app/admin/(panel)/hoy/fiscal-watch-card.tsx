/*
 * Admin > Bandeja Hoy — tarjeta de vigilancia fiscal (ADR-196).
 *
 * Anti-ruido (misma filosofía del centro de notificaciones): SOLO se renderiza
 * cuando hay algo que reportar — una regla en 70 %+ o una proyección de cruce
 * del 100 % antes del cierre del año. En rango, la bandeja no muestra nada y
 * el seguimiento queda en /admin/metricas.
 */

import Link from "next/link";
import { Scale } from "lucide-react";
import { AdminCard } from "@/components/admin-page";
import { formatCOP } from "@/lib/format";
import { formatDateLongCO } from "@/lib/datetime";
import { evaluateFiscalRules, getFiscalYearSnapshot } from "@/features/fiscal-watch/service";
import { FISCAL_LEVEL_RANK } from "@/features/fiscal-watch/config";

export async function FiscalWatchCard() {
  const snapshot = await getFiscalYearSnapshot();
  const evaluations = evaluateFiscalRules(snapshot);
  const relevant = evaluations.filter(
    (ev) => ev.level !== "ok" || FISCAL_LEVEL_RANK[ev.projectedLevel] >= FISCAL_LEVEL_RANK.warning,
  );
  if (relevant.length === 0) return null;

  return (
    <AdminCard className="border-amber-200 bg-amber-50/60 p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-brand-purple-dark flex items-center gap-1.5 text-xs font-bold tracking-wide uppercase">
          <Scale className="h-4 w-4 text-amber-600" />
          Vigilancia fiscal {snapshot.year}
        </h2>
        <Link
          href="/admin/metricas"
          className="text-brand-purple text-xs font-semibold hover:underline"
        >
          Ver detalle en Métricas →
        </Link>
      </div>
      <ul className="space-y-1.5">
        {relevant.map((ev) => (
          <li key={ev.ruleId} className="text-brand-purple-dark text-sm">
            <strong>{ev.name}:</strong> {formatCOP(ev.currentCop)} de {formatCOP(ev.thresholdCop)} (
            {Math.floor(ev.currentRatio * 100)} %)
            {ev.estimatedCrossingAt && ev.level !== "critical" && (
              <span className="text-amber-800">
                {" "}
                · el ritmo actual proyecta cruzar el tope hacia el{" "}
                {formatDateLongCO(ev.estimatedCrossingAt)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </AdminCard>
  );
}
