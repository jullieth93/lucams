/*
 * Admin > Performance — Rendimiento técnico del storefront.
 *
 * Panel de solo lectura sobre dos fuentes append-only (Bloque D, sin Sentry):
 *   - ErrorLog: errores no manejados capturados por instrumentation.onRequestError.
 *   - WebVital: métricas RUM enviadas por el cliente a /api/vitals.
 *
 * Ventana fija de 7 días porque es la que usa features/observability para las
 * alertas: así Lucy ve acá los mismos números que gatillan los emails. No hay
 * acciones mutables (los errores se investigan, no se editan), por eso el
 * módulo no trae actions.ts.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Gauge } from "lucide-react";
import {
  AdminBadge,
  AdminCard,
  AdminEmpty,
  AdminNotice,
  AdminPage,
  AdminPageBody,
  AdminPageHeader,
  AdminTable,
  AdminTableBody,
  AdminTableHead,
  AdminTableRow,
  KpiCard,
} from "@/components/admin-page";
import { getCurrentAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const metadata: Metadata = {
  title: "Rendimiento técnico",
  robots: { index: false, follow: false },
};

const WINDOW_DAYS = 7;
const MAX_ERRORS = 20;

const dateTimeFmt = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

// Umbrales oficiales de Web Vitals (web.dev). CLS va sin unidad; el resto en ms.
const METRIC_INFO: Record<
  string,
  { label: string; good: number; poor: number; unit: "ms" | "score" }
> = {
  LCP: { label: "LCP — carga del contenido principal", good: 2500, poor: 4000, unit: "ms" },
  INP: { label: "INP — respuesta a interacciones", good: 200, poor: 500, unit: "ms" },
  CLS: { label: "CLS — estabilidad visual", good: 0.1, poor: 0.25, unit: "score" },
  FCP: { label: "FCP — primer pintado", good: 1800, poor: 3000, unit: "ms" },
  TTFB: { label: "TTFB — tiempo de respuesta del servidor", good: 800, poor: 1800, unit: "ms" },
  FID: { label: "FID — demora de la primera interacción", good: 100, poor: 300, unit: "ms" },
};

function ratingFor(name: string, avg: number): "good" | "needs-improvement" | "poor" {
  const info = METRIC_INFO[name];
  if (!info) return "good";
  if (avg <= info.good) return "good";
  if (avg > info.poor) return "poor";
  return "needs-improvement";
}

const RATING_TONE = {
  good: "emerald",
  "needs-improvement": "amber",
  poor: "rose",
} as const;
const RATING_LABEL = {
  good: "Bueno",
  "needs-improvement": "Mejorable",
  poor: "Lento",
} as const;

function formatMetric(name: string, value: number): string {
  const info = METRIC_INFO[name];
  if (info?.unit === "score") return value.toFixed(3);
  return `${Math.round(value).toLocaleString("es-CO")} ms`;
}

export default async function AdminPerformancePage() {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 3600 * 1000);

  const [errorCount7d, recentErrors, vitalsAvgRaw, vitalsSampleCount] = await Promise.all([
    prisma.errorLog.count({ where: { createdAt: { gte: since } } }),
    prisma.errorLog.findMany({
      orderBy: { createdAt: "desc" },
      take: MAX_ERRORS,
      select: {
        id: true,
        message: true,
        routePath: true,
        requestPath: true,
        method: true,
        routeType: true,
        createdAt: true,
      },
    }),
    prisma.webVital.groupBy({
      by: ["name"],
      where: { createdAt: { gte: since } },
      _avg: { value: true },
    }),
    prisma.webVital.count({ where: { createdAt: { gte: since } } }),
  ]);

  // Métricas en orden fijo de importancia percibida; luego cualquier otra presente.
  const ORDER = ["LCP", "INP", "CLS", "FCP", "TTFB", "FID"];
  const vitals = vitalsAvgRaw
    .filter((v) => v._avg.value !== null)
    .map((v) => ({ name: v.name, avg: v._avg.value as number }))
    .sort((a, b) => {
      const ia = ORDER.indexOf(a.name);
      const ib = ORDER.indexOf(b.name);
      return (ia === -1 ? ORDER.length : ia) - (ib === -1 ? ORDER.length : ib);
    });

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Gauge className="h-5 w-5" />}
        title="Rendimiento técnico"
        subtitle={`Errores del servidor y Web Vitals reales de los visitantes, últimos ${WINDOW_DAYS} días.`}
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Analítica" },
          { label: "Rendimiento técnico" },
        ]}
      />

      <AdminPageBody>
        <AdminNotice tone="info">
          <strong>¿Para qué sirve?</strong> Acá ves si la tienda está rápida y sin fallas, con datos
          reales de los visitantes. Si una métrica sale en amarillo o rojo, o suben los errores,
          avísanos para revisarlo.
        </AdminNotice>

        {/* ── Errores del servidor ── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KpiCard
            label={`Errores del servidor · ${WINDOW_DAYS} días`}
            value={errorCount7d.toLocaleString("es-CO")}
            trend={errorCount7d === 0 ? "up" : "down"}
            trendLabel={
              errorCount7d === 0 ? "Sin errores registrados" : "Revisar la tabla de abajo"
            }
          />
        </div>

        <section aria-labelledby="errors-heading">
          <h2
            id="errors-heading"
            className="text-brand-purple-dark font-display mb-3 text-base font-bold"
          >
            Últimos {MAX_ERRORS} errores
          </h2>
          {recentErrors.length === 0 ? (
            <AdminEmpty
              title="Sin errores registrados"
              description="No se ha capturado ningún error del servidor. Todo en orden. 🦝"
            />
          ) : (
            <AdminTable minWidth={800}>
              <AdminTableHead>
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Fecha</th>
                  <th className="px-4 py-3 text-left font-semibold">Ruta</th>
                  <th className="px-4 py-3 text-center font-semibold">Tipo</th>
                  <th className="px-4 py-3 text-left font-semibold">Mensaje</th>
                </tr>
              </AdminTableHead>
              <AdminTableBody>
                {recentErrors.map((e) => (
                  <AdminTableRow key={e.id}>
                    <td className="text-brand-muted px-4 py-3 align-top text-xs whitespace-nowrap">
                      {dateTimeFmt.format(e.createdAt)}
                    </td>
                    <td className="px-4 py-3 align-top">
                      {e.routePath || e.requestPath ? (
                        <code className="text-brand-purple-dark bg-brand-purple/5 rounded px-1.5 py-0.5 font-mono text-[11px] break-all">
                          {e.routePath ?? e.requestPath}
                        </code>
                      ) : (
                        <span className="text-brand-muted text-xs">—</span>
                      )}
                      {e.method && (
                        <span className="text-brand-muted ml-1.5 text-[10px]">{e.method}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center align-top">
                      {e.routeType ? (
                        <AdminBadge tone="slate">{e.routeType}</AdminBadge>
                      ) : (
                        <span className="text-brand-muted text-xs">—</span>
                      )}
                    </td>
                    <td className="text-brand-purple-dark/90 max-w-md px-4 py-3 align-top text-xs break-words">
                      {e.message}
                    </td>
                  </AdminTableRow>
                ))}
              </AdminTableBody>
            </AdminTable>
          )}
        </section>

        {/* ── Web Vitals ── */}
        <section aria-labelledby="vitals-heading">
          <h2
            id="vitals-heading"
            className="text-brand-purple-dark font-display mb-1 text-base font-bold"
          >
            Web Vitals — promedio últimos {WINDOW_DAYS} días
          </h2>
          <p className="text-brand-muted mb-3 text-xs">
            {vitalsSampleCount.toLocaleString("es-CO")}{" "}
            {vitalsSampleCount === 1 ? "medición recibida" : "mediciones recibidas"} de visitantes
            reales.
          </p>
          {vitals.length === 0 ? (
            <AdminEmpty
              title="Todavía no hay mediciones"
              description="Las métricas llegan solas cuando la gente navega la tienda. Vuelve a mirar en unos días."
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {vitals.map((v) => {
                const rating = ratingFor(v.name, v.avg);
                return (
                  <AdminCard key={v.name} className="p-5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-brand-muted text-xs font-semibold tracking-wider uppercase">
                        {METRIC_INFO[v.name]?.label ?? v.name}
                      </p>
                      <AdminBadge tone={RATING_TONE[rating]}>{RATING_LABEL[rating]}</AdminBadge>
                    </div>
                    <p className="text-brand-purple-dark font-display mt-2 text-3xl font-bold tabular-nums">
                      {formatMetric(v.name, v.avg)}
                    </p>
                  </AdminCard>
                );
              })}
            </div>
          )}
        </section>
      </AdminPageBody>
    </AdminPage>
  );
}
