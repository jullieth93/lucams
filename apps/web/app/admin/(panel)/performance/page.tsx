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
 *
 * Paquete C (2026-10-09):
 *   - Cards por métrica con p75 (no AVG — el estándar de web.dev).
 *   - Filtros por dispositivo (móvil/desktop, desde userAgent) y por tipo de
 *     navegación (navType) vía query string. El filtro de navType no aplica
 *     a las filas sin navType (LONGTASK/PAGEWEIGHT se emiten por pageview y
 *     no lo llevan — filtrarlas las vaciaría siempre).
 *   - Secciones nuevas: Long tasks por ruta, Peso de página por ruta y
 *     CLS/LCP por elemento (espejo de la de INP del Paquete J).
 */

import type { Metadata } from "next";
import Link from "next/link";
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
import { buildTargetTable, type InpTargetRow } from "@/features/observability/inp-targets";
import { buildRouteMetricTable } from "@/features/observability/route-metrics";
import { classifyDevice, type DeviceClass } from "@/features/observability/device";

export const metadata: Metadata = {
  title: "Rendimiento técnico",
  robots: { index: false, follow: false },
};

const WINDOW_DAYS = 7;
const MAX_ERRORS = 20;
/* Tope de seguridad del fetch de valores RUM para los percentiles por ruta:
   el cálculo es en JS (función pura testeada — ver percentiles.ts, ahí la
   justificación vs percentile_cont en SQL). 200k filas ≈ pocos MB; el volumen
   real de 7 días es de MILES, no cientos de miles — el backstop de /api/vitals
   (3000 filas/5 min global) acota el peor caso y este tope evita que una
   ventana inundada tumbe el panel admin. */
const MAX_VITAL_ROWS = 200_000;

const dateTimeFmt = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

// Umbrales oficiales de Web Vitals (web.dev). CLS va sin unidad; LCP/INP/FCP/
// TTFB/FID en ms. LONGTASK y PAGEWEIGHT usan umbrales propios (ADR-135 —
// web.dev no publica umbrales para ellas); PAGEWEIGHT va en bytes.
const METRIC_INFO: Record<
  string,
  { label: string; good: number; poor: number; unit: "ms" | "score" | "bytes" }
> = {
  LCP: { label: "LCP — carga del contenido principal", good: 2500, poor: 4000, unit: "ms" },
  INP: { label: "INP — respuesta a interacciones", good: 200, poor: 500, unit: "ms" },
  CLS: { label: "CLS — estabilidad visual", good: 0.1, poor: 0.25, unit: "score" },
  FCP: { label: "FCP — primer pintado", good: 1800, poor: 3000, unit: "ms" },
  TTFB: { label: "TTFB — tiempo de respuesta del servidor", good: 800, poor: 1800, unit: "ms" },
  FID: { label: "FID — demora de la primera interacción", good: 100, poor: 300, unit: "ms" },
  LONGTASK: {
    label: "Long tasks — bloqueo del hilo principal (total por visita)",
    good: 200,
    poor: 600,
    unit: "ms",
  },
  PAGEWEIGHT: {
    label: "Peso de página — bytes transferidos por visita",
    good: 2_000_000,
    poor: 5_000_000,
    unit: "bytes",
  },
};

function ratingFor(name: string, value: number): "good" | "needs-improvement" | "poor" {
  const info = METRIC_INFO[name];
  if (!info) return "good";
  if (value <= info.good) return "good";
  if (value > info.poor) return "poor";
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
  if (info?.unit === "bytes") {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)} MB`;
    if (value >= 1_000) return `${Math.round(value / 1_000).toLocaleString("es-CO")} KB`;
    return `${Math.round(value)} B`;
  }
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

// ── Filtros (Paquete C) ──────────────────────────────────────────────

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function pickString(sp: Record<string, string | string[] | undefined>, key: string) {
  const v = sp[key];
  return typeof v === "string" ? v : undefined;
}

const DEVICE_FILTERS = [
  { key: "all", label: "Todos" },
  { key: "mobile", label: "Móvil" },
  { key: "desktop", label: "Desktop" },
] as const;
type DeviceFilter = (typeof DEVICE_FILTERS)[number]["key"];

const NAV_FILTERS = [
  { key: "all", label: "Todas" },
  { key: "navigate", label: "Primera carga" },
  { key: "reload", label: "Recarga" },
  { key: "back-forward", label: "Atrás/adelante" },
] as const;
type NavFilter = (typeof NAV_FILTERS)[number]["key"];

function isDeviceFilter(v: string | undefined): v is DeviceFilter {
  return DEVICE_FILTERS.some((f) => f.key === v);
}
function isNavFilter(v: string | undefined): v is NavFilter {
  return NAV_FILTERS.some((f) => f.key === v);
}

/** ¿La fila pasa los filtros activos? navType null (métricas por pageview)
 *  no se filtra por tipo de navegación — el concepto no le aplica. */
function matchesVitalFilters(
  row: { userAgent: string | null; navType: string | null },
  device: DeviceFilter,
  nav: NavFilter,
): boolean {
  if (device !== "all") {
    const rowDevice: DeviceClass = classifyDevice(row.userAgent);
    if (rowDevice !== device) return false;
  }
  if (nav !== "all" && row.navType !== null) {
    const navMatch =
      nav === "back-forward"
        ? row.navType === "back-forward" || row.navType === "back-forward-cache"
        : row.navType === nav;
    if (!navMatch) return false;
  }
  return true;
}

function filterHref(device: DeviceFilter, nav: NavFilter): string {
  const params = new URLSearchParams();
  if (device !== "all") params.set("device", device);
  if (nav !== "all") params.set("nav", nav);
  const qs = params.toString();
  return qs ? `?${qs}` : "?";
}

function FilterTabs({
  label,
  options,
  active,
  hrefFor,
}: {
  label: string;
  options: ReadonlyArray<{ key: string; label: string }>;
  active: string;
  hrefFor: (key: string) => string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-brand-muted text-xs font-semibold tracking-wider uppercase">
        {label}
      </span>
      {options.map((opt) => (
        <Link
          key={opt.key}
          href={hrefFor(opt.key)}
          className={
            opt.key === active
              ? "bg-brand-purple rounded-full px-3 py-1 text-xs font-semibold text-white"
              : "border-brand-purple/30 text-brand-purple-dark hover:bg-brand-purple/10 rounded-full border px-3 py-1 text-xs font-semibold"
          }
        >
          {opt.label}
        </Link>
      ))}
    </div>
  );
}

// ── Sección "por elemento" (INP/CLS/LCP comparten el formato) ────────

function TargetSection({
  id,
  title,
  description,
  emptyTitle,
  emptyDescription,
  metric,
  rows,
}: {
  id: string;
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
  metric: string;
  rows: InpTargetRow[];
}) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="text-brand-purple-dark font-display mb-1 text-base font-bold">
        {title}
      </h2>
      <p className="text-brand-muted mb-3 text-xs">{description}</p>
      {rows.length === 0 ? (
        <AdminEmpty title={emptyTitle} description={emptyDescription} />
      ) : (
        <AdminTable minWidth={800}>
          <AdminTableHead>
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Página</th>
              <th className="px-4 py-3 text-left font-semibold">Elemento</th>
              <th className="px-4 py-3 text-center font-semibold">Mediciones</th>
              <th className="px-4 py-3 text-center font-semibold">p75</th>
              <th className="px-4 py-3 text-center font-semibold">p95</th>
              <th className="px-4 py-3 text-center font-semibold">Peor</th>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((row) => {
              const rating = ratingFor(metric, row.percentiles.p75);
              return (
                <AdminTableRow key={`${row.route}|${row.target}`}>
                  <td className="px-4 py-3 align-top">
                    <code className="text-brand-purple-dark bg-brand-purple/5 rounded px-1.5 py-0.5 font-mono text-[11px] break-all">
                      {row.route}
                    </code>
                  </td>
                  <td className="max-w-xs px-4 py-3 align-top">
                    <code className="text-brand-purple-dark bg-brand-purple/5 rounded px-1.5 py-0.5 font-mono text-[11px] break-all">
                      {row.target}
                    </code>
                  </td>
                  <td className="text-brand-muted px-4 py-3 text-center align-top text-xs tabular-nums">
                    {row.samples.toLocaleString("es-CO")}
                  </td>
                  <td className="px-4 py-3 text-center align-top">
                    <div className="text-brand-purple-dark text-xs font-semibold tabular-nums">
                      {formatMetric(metric, row.percentiles.p75)}
                    </div>
                    <div className="mt-1">
                      <AdminBadge tone={RATING_TONE[rating]}>{RATING_LABEL[rating]}</AdminBadge>
                    </div>
                  </td>
                  <td className="text-brand-purple-dark px-4 py-3 text-center align-top text-xs tabular-nums">
                    {formatMetric(metric, row.percentiles.p95)}
                  </td>
                  <td className="text-brand-purple-dark px-4 py-3 text-center align-top text-xs tabular-nums">
                    {formatMetric(metric, row.max)}
                  </td>
                </AdminTableRow>
              );
            })}
          </AdminTableBody>
        </AdminTable>
      )}
    </section>
  );
}

export default async function AdminPerformancePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const sp = await searchParams;
  const deviceParam = pickString(sp, "device");
  const navParam = pickString(sp, "nav");
  const device: DeviceFilter = isDeviceFilter(deviceParam) ? deviceParam : "all";
  const nav: NavFilter = isNavFilter(navParam) ? navParam : "all";

  const since = windowStart(WINDOW_DAYS);

  const [errorCount7d, recentErrors, vitalsSampleCount, vitalRows] = await Promise.all([
    prisma.errorLog.count({ where: { createdAt: { gte: since } } }),
    prisma.errorLog.findMany({
      orderBy: { createdAt: "desc" },
      take: MAX_ERRORS,
      select: {
        id: true,
        message: true,
        digest: true,
        stack: true,
        routePath: true,
        requestPath: true,
        method: true,
        routeType: true,
        createdAt: true,
      },
    }),
    prisma.webVital.count({ where: { createdAt: { gte: since } } }),
    // Valores crudos de la ventana: alimentan cards (p75), tabla por ruta,
    // tablas por elemento y las secciones LONGTASK/PAGEWEIGHT. Usa el índice
    // (name, route, createdAt); tope documentado arriba. `delta` lleva la
    // cantidad de long tasks / recursos en las métricas por pageview.
    prisma.webVital.findMany({
      where: { createdAt: { gte: since } },
      select: {
        route: true,
        name: true,
        value: true,
        delta: true,
        target: true,
        navType: true,
        userAgent: true,
      },
      take: MAX_VITAL_ROWS,
    }),
  ]);

  // Filtros por dispositivo / tipo de navegación (Paquete C) sobre las filas
  // crudas — todas las secciones de Web Vitals ven el mismo subconjunto.
  const filteredRows = vitalRows.filter((r) => matchesVitalFilters(r, device, nav));

  // Cards: p75 por métrica (el estándar de web.dev — antes AVG, corregido en
  // Paquete C). En orden fijo de importancia percibida; luego cualquier otra.
  const ORDER = ["LCP", "INP", "CLS", "FCP", "TTFB", "FID", "LONGTASK", "PAGEWEIGHT"];
  const valuesByName = new Map<string, number[]>();
  for (const r of filteredRows) {
    const arr = valuesByName.get(r.name);
    if (arr) arr.push(r.value);
    else valuesByName.set(r.name, [r.value]);
  }
  const vitals = [...valuesByName.entries()]
    .map(([name, values]) => ({ name, p75: computePercentiles(values)?.p75 ?? null }))
    .filter((v): v is { name: string; p75: number } => v.p75 !== null)
    .sort((a, b) => {
      const ia = ORDER.indexOf(a.name);
      const ib = ORDER.indexOf(b.name);
      return (ia === -1 ? ORDER.length : ia) - (ib === -1 ? ORDER.length : ib);
    });

  // Percentiles por ruta: la tabla de diagnóstico.
  const routeTable = buildRouteVitalTable(filteredRows);
  // Por ELEMENTO (target): qué botón/input/canvas duele dentro de cada página.
  // INP desde el Paquete J (2026-10-02); CLS/LCP desde el Paquete C.
  const inpTargetTable = buildTargetTable(filteredRows, "INP");
  const clsTargetTable = buildTargetTable(filteredRows, "CLS");
  const lcpTargetTable = buildTargetTable(filteredRows, "LCP");
  // Métricas por pageview (Paquete C): 1 fila por visita por métrica.
  const longTaskTable = buildRouteMetricTable(filteredRows, "LONGTASK");
  const pageWeightTable = buildRouteMetricTable(filteredRows, "PAGEWEIGHT");

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
                      {e.digest && (
                        <span
                          className="text-brand-muted mt-1 block font-mono text-[10px]"
                          title="Digest del error: sirve para cruzar con los logs de Vercel y agrupar ocurrencias del mismo fallo"
                        >
                          digest: {e.digest}
                        </span>
                      )}
                      {e.stack && (
                        <details className="mt-1">
                          <summary className="text-brand-purple cursor-pointer text-[11px] font-semibold">
                            Ver stack
                          </summary>
                          <pre className="text-brand-muted bg-brand-purple/5 mt-1 max-h-64 overflow-auto rounded p-2 font-mono text-[10px] whitespace-pre-wrap">
                            {e.stack}
                          </pre>
                        </details>
                      )}
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
            reales. p75 por métrica (el estándar de web.dev: lo que vive el 75% de las visitas); el
            detalle accionable por página está en las tablas de abajo.
          </p>

          <div className="mb-4 flex flex-col gap-2">
            <FilterTabs
              label="Dispositivo"
              options={DEVICE_FILTERS}
              active={device}
              hrefFor={(key) => filterHref(key as DeviceFilter, nav)}
            />
            <FilterTabs
              label="Navegación"
              options={NAV_FILTERS}
              active={nav}
              hrefFor={(key) => filterHref(device, key as NavFilter)}
            />
          </div>

          {vitals.length === 0 ? (
            <AdminEmpty
              title="Todavía no hay mediciones"
              description="Las métricas llegan solas cuando la gente navega la tienda. Vuelve a mirar en unos días."
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {vitals.map((v) => {
                const rating = ratingFor(v.name, v.p75);
                return (
                  <AdminCard key={v.name} className="p-5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-brand-muted text-xs font-semibold tracking-wider uppercase">
                        {METRIC_INFO[v.name]?.label ?? v.name}
                      </p>
                      <AdminBadge tone={RATING_TONE[rating]}>{RATING_LABEL[rating]}</AdminBadge>
                    </div>
                    <p className="text-brand-purple-dark font-display mt-2 text-3xl font-bold tabular-nums">
                      {formatMetric(v.name, v.p75)}
                    </p>
                    <p className="text-brand-muted mt-1 text-[11px]">p75</p>
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

        {/* ── Long tasks por ruta (Paquete C, 2026-10-09) ── */}
        <section aria-labelledby="longtasks-heading">
          <h2
            id="longtasks-heading"
            className="text-brand-purple-dark font-display mb-1 text-base font-bold"
          >
            Long tasks por página — últimos {WINDOW_DAYS} días
          </h2>
          <p className="text-brand-muted mb-3 text-xs">
            Tiempo total que el hilo principal quedó bloqueado por tareas largas (&gt;50 ms) en cada
            visita. Una fila por página: p75 del total bloqueado y promedio de tareas largas por
            visita. Umbrales propios (bueno ≤200 ms, pobre &gt;600 ms).
          </p>
          {longTaskTable.length === 0 ? (
            <AdminEmpty
              title="Sin mediciones de long tasks todavía"
              description="Esta métrica es nueva: llega una medición por visita cuando la gente navega la tienda."
            />
          ) : (
            <AdminTable minWidth={800}>
              <AdminTableHead>
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Página</th>
                  <th className="px-4 py-3 text-center font-semibold">Visitas</th>
                  <th className="px-4 py-3 text-center font-semibold">p75 tiempo bloqueado</th>
                  <th className="px-4 py-3 text-center font-semibold">p95</th>
                  <th className="px-4 py-3 text-center font-semibold">Tareas largas / visita</th>
                </tr>
              </AdminTableHead>
              <AdminTableBody>
                {longTaskTable.map((row) => {
                  const rating = ratingFor("LONGTASK", row.percentiles.p75);
                  return (
                    <AdminTableRow key={row.route}>
                      <td className="px-4 py-3 align-top">
                        <code className="text-brand-purple-dark bg-brand-purple/5 rounded px-1.5 py-0.5 font-mono text-[11px] break-all">
                          {row.route}
                        </code>
                      </td>
                      <td className="text-brand-muted px-4 py-3 text-center align-top text-xs tabular-nums">
                        {row.samples.toLocaleString("es-CO")}
                      </td>
                      <td className="px-4 py-3 text-center align-top">
                        <div className="text-brand-purple-dark text-xs font-semibold tabular-nums">
                          {formatMetric("LONGTASK", row.percentiles.p75)}
                        </div>
                        <div className="mt-1">
                          <AdminBadge tone={RATING_TONE[rating]}>{RATING_LABEL[rating]}</AdminBadge>
                        </div>
                      </td>
                      <td className="text-brand-purple-dark px-4 py-3 text-center align-top text-xs tabular-nums">
                        {formatMetric("LONGTASK", row.percentiles.p95)}
                      </td>
                      <td className="text-brand-purple-dark px-4 py-3 text-center align-top text-xs tabular-nums">
                        {row.avgCount.toFixed(1)}
                      </td>
                    </AdminTableRow>
                  );
                })}
              </AdminTableBody>
            </AdminTable>
          )}
        </section>

        {/* ── Peso de página por ruta (Paquete C, 2026-10-09) ── */}
        <section aria-labelledby="pageweight-heading">
          <h2
            id="pageweight-heading"
            className="text-brand-purple-dark font-display mb-1 text-base font-bold"
          >
            Peso de página por ruta — últimos {WINDOW_DAYS} días
          </h2>
          <p className="text-brand-muted mb-3 text-xs">
            Bytes transferidos por visita (documento + recursos; lo servido desde caché del
            navegador no cuenta). Una fila por página: p75 del peso y promedio de recursos por
            visita. Umbrales propios (bueno ≤2 MB, pobre &gt;5 MB).
          </p>
          {pageWeightTable.length === 0 ? (
            <AdminEmpty
              title="Sin mediciones de peso de página todavía"
              description="Esta métrica es nueva: llega una medición por visita cuando la gente navega la tienda."
            />
          ) : (
            <AdminTable minWidth={800}>
              <AdminTableHead>
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Página</th>
                  <th className="px-4 py-3 text-center font-semibold">Visitas</th>
                  <th className="px-4 py-3 text-center font-semibold">p75 peso</th>
                  <th className="px-4 py-3 text-center font-semibold">p95</th>
                  <th className="px-4 py-3 text-center font-semibold">Recursos / visita</th>
                </tr>
              </AdminTableHead>
              <AdminTableBody>
                {pageWeightTable.map((row) => {
                  const rating = ratingFor("PAGEWEIGHT", row.percentiles.p75);
                  return (
                    <AdminTableRow key={row.route}>
                      <td className="px-4 py-3 align-top">
                        <code className="text-brand-purple-dark bg-brand-purple/5 rounded px-1.5 py-0.5 font-mono text-[11px] break-all">
                          {row.route}
                        </code>
                      </td>
                      <td className="text-brand-muted px-4 py-3 text-center align-top text-xs tabular-nums">
                        {row.samples.toLocaleString("es-CO")}
                      </td>
                      <td className="px-4 py-3 text-center align-top">
                        <div className="text-brand-purple-dark text-xs font-semibold tabular-nums">
                          {formatMetric("PAGEWEIGHT", row.percentiles.p75)}
                        </div>
                        <div className="mt-1">
                          <AdminBadge tone={RATING_TONE[rating]}>{RATING_LABEL[rating]}</AdminBadge>
                        </div>
                      </td>
                      <td className="text-brand-purple-dark px-4 py-3 text-center align-top text-xs tabular-nums">
                        {formatMetric("PAGEWEIGHT", row.percentiles.p95)}
                      </td>
                      <td className="text-brand-purple-dark px-4 py-3 text-center align-top text-xs tabular-nums">
                        {row.avgCount.toFixed(1)}
                      </td>
                    </AdminTableRow>
                  );
                })}
              </AdminTableBody>
            </AdminTable>
          )}
        </section>

        {/* ── Por elemento: INP (Paquete J) + CLS/LCP (Paquete C) ── */}
        <TargetSection
          id="inp-targets-heading"
          title={`INP por elemento (p75) — últimos ${WINDOW_DAYS} días`}
          description="Qué elemento concreto (botón, campo, canvas) produce las interacciones lentas en cada página. Solo grupos con 3+ mediciones; ordenado de peor a mejor."
          emptyTitle="Sin interacciones lentas identificadas todavía"
          emptyDescription="Cuando haya suficientes mediciones de INP con elemento identificado, verás acá qué control conviene optimizar."
          metric="INP"
          rows={inpTargetTable}
        />

        <TargetSection
          id="cls-targets-heading"
          title={`CLS por elemento (p75) — últimos ${WINDOW_DAYS} días`}
          description="Qué elemento se movió en los saltos de layout más grandes de cada página. Solo grupos con 3+ mediciones; ordenado de peor a mejor."
          emptyTitle="Sin saltos de layout identificados todavía"
          emptyDescription="Cuando haya suficientes mediciones de CLS con elemento identificado, verás acá qué elemento conviene estabilizar."
          metric="CLS"
          rows={clsTargetTable}
        />

        <TargetSection
          id="lcp-targets-heading"
          title={`LCP por elemento (p75) — últimos ${WINDOW_DAYS} días`}
          description="Qué elemento es el contenido principal (LCP) de cada página y qué tan lento pinta. Solo grupos con 3+ mediciones; ordenado de peor a mejor."
          emptyTitle="Sin elementos LCP identificados todavía"
          emptyDescription="Cuando haya suficientes mediciones de LCP con elemento identificado, verás acá qué imagen o bloque conviene optimizar."
          metric="LCP"
          rows={lcpTargetTable}
        />
      </AdminPageBody>
    </AdminPage>
  );
}
