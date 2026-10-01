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
import { computePercentiles, type VitalPercentiles } from "@/features/observability/percentiles";

export const metadata: Metadata = {
  title: "Rendimiento técnico",
  robots: { index: false, follow: false },
};

const WINDOW_DAYS = 7;
const MAX_ERRORS = 20;
/* Tope de seguridad del fetch de valores RUM para los percentiles por ruta:
   el cálculo es en JS (función pura testeada — ver percentiles.ts, ahí la
   justificación vs percentile_cont en SQL). 200k filas de (name, route, value)
   ≈ pocos MB; el volumen real de 7 días es de MILES, no cientos de miles —
   el backstop de /api/vitals (3000 filas/5 min global) acota el peor caso y
   este tope evita que una ventana inundada tumbe el panel admin. */
const MAX_VITAL_ROWS = 200_000;

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

// Helper (no-componente) para el inicio de la ventana — el react-hooks/purity no
// permite Date.now() directo en el cuerpo del componente RSC (mismo patrón que
// probeHealth en /admin/integraciones).
function windowStart(days: number): Date {
  return new Date(Date.now() - days * 24 * 3600 * 1000);
}

/* Tabla por ruta: las 4 métricas que responden "¿qué página duele y por qué?"
   (FID quedó legacy — lo reemplaza INP — y FCP es secundario frente a LCP). */
const ROUTE_TABLE_METRICS = ["LCP", "INP", "CLS", "TTFB"] as const;

type RouteVitalRow = {
  route: string;
  samples: number;
  byMetric: Partial<Record<(typeof ROUTE_TABLE_METRICS)[number], VitalPercentiles>>;
  /** Peor ratio p75/umbral-pobre entre las métricas presentes — ordena la tabla. */
  severity: number;
};

/**
 * Agrupa los valores crudos por (route, name) y calcula p50/p75/p95 con la
 * función pura testeada (features/observability/percentiles.ts). Solo se
 * queda con las métricas de la tabla; una ruta sin ninguna no aparece.
 */
function buildRouteVitalTable(
  rows: Array<{ route: string; name: string; value: number }>,
): RouteVitalRow[] {
  const byRoute = new Map<string, { samples: number; values: Map<string, number[]> }>();
  for (const r of rows) {
    let entry = byRoute.get(r.route);
    if (!entry) {
      entry = { samples: 0, values: new Map() };
      byRoute.set(r.route, entry);
    }
    entry.samples += 1;
    if (!(ROUTE_TABLE_METRICS as readonly string[]).includes(r.name)) continue;
    const arr = entry.values.get(r.name);
    if (arr) arr.push(r.value);
    else entry.values.set(r.name, [r.value]);
  }

  const table: RouteVitalRow[] = [];
  for (const [route, entry] of byRoute) {
    const byMetric: RouteVitalRow["byMetric"] = {};
    let severity = 0;
    for (const name of ROUTE_TABLE_METRICS) {
      const percentiles = computePercentiles(entry.values.get(name) ?? []);
      if (!percentiles) continue;
      byMetric[name] = percentiles;
      const poor = METRIC_INFO[name].poor;
      // CLS va en score (0.x) y el resto en ms — el ratio sobre el umbral pobre
      // normaliza ambas escalas para comparar "qué tan mal" está cada métrica.
      severity = Math.max(severity, percentiles.p75 / poor);
    }
    if (Object.keys(byMetric).length === 0) continue;
    table.push({ route, samples: entry.samples, byMetric, severity });
  }
  // Peor p75 primero (ratio sobre el umbral pobre de web.dev); desempate por ruta.
  return table.sort((a, b) => b.severity - a.severity || a.route.localeCompare(b.route));
}

export default async function AdminPerformancePage() {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const since = windowStart(WINDOW_DAYS);

  const [errorCount7d, recentErrors, vitalsAvgRaw, vitalsSampleCount, vitalRows] =
    await Promise.all([
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
      // Valores crudos de la ventana para los percentiles por (ruta, métrica).
      // Usa el índice (name, route, createdAt); tope documentado arriba.
      prisma.webVital.findMany({
        where: { createdAt: { gte: since } },
        select: { route: true, name: true, value: true },
        take: MAX_VITAL_ROWS,
      }),
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

  // Percentiles por ruta (lo que promete el header de /api/vitals): la tabla de diagnóstico.
  const routeTable = buildRouteVitalTable(vitalRows);

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
            Web Vitals — resumen últimos {WINDOW_DAYS} días
          </h2>
          <p className="text-brand-muted mb-3 text-xs">
            {vitalsSampleCount.toLocaleString("es-CO")}{" "}
            {vitalsSampleCount === 1 ? "medición recibida" : "mediciones recibidas"} de visitantes
            reales. Promedio por métrica; el detalle accionable (p75 por página) está en la tabla de
            abajo.
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

        {/* ── Percentiles por ruta ── */}
        <section aria-labelledby="routes-heading">
          <h2
            id="routes-heading"
            className="text-brand-purple-dark font-display mb-1 text-base font-bold"
          >
            Percentiles por página (p75) — últimos {WINDOW_DAYS} días
          </h2>
          <p className="text-brand-muted mb-3 text-xs">
            El p75 es el estándar de web.dev: lo que vive el 75% de las visitas. Ordenado de peor a
            mejor; los colores usan los umbrales oficiales (bueno / a mejorar / pobre).
          </p>
          {routeTable.length === 0 ? (
            <AdminEmpty
              title="Sin datos por página todavía"
              description="Apenas lleguen mediciones de LCP, INP, CLS o TTFB verás acá qué páginas van más lentas."
            />
          ) : (
            <AdminTable minWidth={800}>
              <AdminTableHead>
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Página</th>
                  <th className="px-4 py-3 text-center font-semibold">Mediciones</th>
                  {ROUTE_TABLE_METRICS.map((m) => (
                    <th key={m} className="px-4 py-3 text-center font-semibold">
                      {m} p75
                    </th>
                  ))}
                </tr>
              </AdminTableHead>
              <AdminTableBody>
                {routeTable.map((row) => (
                  <AdminTableRow key={row.route}>
                    <td className="px-4 py-3 align-top">
                      <code className="text-brand-purple-dark bg-brand-purple/5 rounded px-1.5 py-0.5 font-mono text-[11px] break-all">
                        {row.route}
                      </code>
                    </td>
                    <td className="text-brand-muted px-4 py-3 text-center align-top text-xs tabular-nums">
                      {row.samples.toLocaleString("es-CO")}
                    </td>
                    {ROUTE_TABLE_METRICS.map((m) => {
                      const percentiles = row.byMetric[m];
                      if (!percentiles) {
                        return (
                          <td
                            key={m}
                            className="text-brand-muted px-4 py-3 text-center align-top text-xs"
                          >
                            —
                          </td>
                        );
                      }
                      const rating = ratingFor(m, percentiles.p75);
                      return (
                        <td key={m} className="px-4 py-3 text-center align-top">
                          <div className="text-brand-purple-dark text-xs font-semibold tabular-nums">
                            {formatMetric(m, percentiles.p75)}
                          </div>
                          <div className="mt-1">
                            <AdminBadge tone={RATING_TONE[rating]}>
                              {RATING_LABEL[rating]}
                            </AdminBadge>
                          </div>
                        </td>
                      );
                    })}
                  </AdminTableRow>
                ))}
              </AdminTableBody>
            </AdminTable>
          )}
        </section>
      </AdminPageBody>
    </AdminPage>
  );
}
