import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Filter,
  HelpCircle,
  Laptop,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Tablet,
  Upload,
} from "lucide-react";
import {
  AdminBadge,
  AdminCard,
  AdminEmpty,
  AdminTable,
  AdminTableBody,
  AdminTableHead,
  AdminTableRow,
} from "@/components/admin-page";
import { Hint } from "@/components/ui/tooltip";
import type {
  FunnelDashboardReport,
  FunnelOperationHealth,
  FunnelReportFilters,
} from "@/features/analytics/funnel-service";
import { FunnelProductSelect } from "./funnel-product-select";

type ActiveFunnelFilters = Required<FunnelReportFilters>;

function buildMetricasHref(
  current: ActiveFunnelFilters,
  patch: Partial<ActiveFunnelFilters>,
): string {
  const merged = { ...current, ...patch };
  const params = new URLSearchParams();
  if (merged.days !== 30) params.set("ventana", String(merged.days));
  if (merged.deviceCategory !== "all") params.set("dispositivo", merged.deviceCategory);
  if (merged.editorKind !== "all") params.set("editor", merged.editorKind);
  if (merged.productSlug !== "all") params.set("producto", merged.productSlug);
  const qs = params.toString();
  return qs ? `/admin/metricas?${qs}` : "/admin/metricas";
}

function FilterPill({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "true" : undefined}
      className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all ${
        active
          ? "border-brand-purple bg-brand-purple text-white shadow-sm"
          : "border-brand-purple/15 text-brand-purple-dark/80 hover:border-brand-purple/35 hover:bg-brand-purple/5 bg-white"
      }`}
    >
      {children}
    </Link>
  );
}

function healthTone(rate: number | null): "emerald" | "amber" | "rose" | "slate" {
  if (rate === null) return "slate";
  if (rate >= 92) return "emerald";
  if (rate >= 78) return "amber";
  return "rose";
}

function OperationHealthCard({
  title,
  subtitle,
  icon,
  health,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  health: FunnelOperationHealth;
}) {
  const tone = healthTone(health.successRatePct);
  return (
    <AdminCard className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className="bg-brand-purple/10 text-brand-purple mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl">
            {icon}
          </div>
          <div>
            <h3 className="text-brand-purple-dark font-display text-sm font-bold sm:text-base">
              {title}
            </h3>
            <p className="text-brand-muted text-xs">{subtitle}</p>
          </div>
        </div>
        <AdminBadge tone={tone}>
          {health.successRatePct !== null ? `${health.successRatePct}% éxito` : "Sin intentos"}
        </AdminBadge>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50/80 p-3">
        <div>
          <p className="text-brand-muted text-[11px] font-medium">Exitosos</p>
          <p className="text-brand-purple-dark text-lg font-bold tabular-nums">
            {health.succeeded.toLocaleString("es-CO")}
          </p>
        </div>
        <div>
          <p className="text-brand-muted text-[11px] font-medium">Con inconveniente</p>
          <p
            className={`text-lg font-bold tabular-nums ${
              health.failed > 0 ? "text-rose-700" : "text-brand-purple-dark"
            }`}
          >
            {health.failed.toLocaleString("es-CO")}
          </p>
        </div>
      </div>

      {health.errors.length > 0 ? (
        <div className="mt-4 space-y-2.5">
          <p className="text-brand-purple-dark text-xs font-semibold">
            Motivos detectados cuando falla:
          </p>
          <ul className="space-y-2">
            {health.errors.map((err) => (
              <li key={err.errorCode || "generic"}>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-brand-purple-dark/85 truncate">{err.label}</span>
                  <span className="text-brand-purple-dark flex-shrink-0 font-semibold tabular-nums">
                    {err.count.toLocaleString("es-CO")}{" "}
                    <span className="text-brand-muted font-normal">({err.pct}%)</span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-rose-100">
                  <div
                    className="admin-bar-grow-x h-full rounded-full bg-rose-500"
                    style={{ width: `${Math.max(4, err.pct)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-brand-muted mt-4 flex items-center gap-1.5 text-xs">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
          {health.totalAttempts > 0
            ? "Ningún fallo registrado en esta ventana."
            : "Aquí verás si alguna foto o diseño falla y el motivo exacto."}
        </p>
      )}
    </AdminCard>
  );
}

export function FunnelPanel({
  report,
  filters,
}: {
  report: FunnelDashboardReport;
  filters: ActiveFunnelFilters;
}) {
  const hasActiveFilter =
    filters.days !== 30 ||
    filters.deviceCategory !== "all" ||
    filters.editorKind !== "all" ||
    filters.productSlug !== "all";

  const baseParams = new URLSearchParams();
  if (filters.days !== 30) baseParams.set("ventana", String(filters.days));
  if (filters.deviceCategory !== "all") baseParams.set("dispositivo", filters.deviceCategory);
  if (filters.editorKind !== "all") baseParams.set("editor", filters.editorKind);

  const maxStageCount = Math.max(1, ...report.stages.map((s) => s.count));

  return (
    <section aria-labelledby="funnel-heading" className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2
            id="funnel-heading"
            className="text-brand-purple-dark font-display flex items-center gap-2 text-lg font-bold sm:text-xl"
          >
            <Sparkles className="text-brand-purple h-5 w-5" aria-hidden />
            Embudo en vivo: Tienda y Estudio de personalización
            <Hint content="Contadores diarios 100 % anónimos (sin cookies, sin datos personales ni sesiones rastreadas). Mide tanto visitantes con cookies rechazadas como aceptadas.">
              <button
                type="button"
                aria-label="Cómo medimos este embudo de forma privada"
                className="text-brand-muted hover:text-brand-purple inline-flex h-6 w-6 items-center justify-center rounded-full"
              >
                <HelpCircle className="h-4 w-4" />
              </button>
            </Hint>
          </h2>
          <p className="text-brand-muted mt-0.5 text-xs sm:text-sm">
            Descubre exactamente en qué paso avanzan o se detienen las personas, en qué dispositivo
            ocurre y qué producto necesita atención.
          </p>
        </div>
        <span className="text-brand-purple-dark/75 bg-brand-purple/5 border-brand-purple/15 inline-flex items-center gap-1.5 self-start rounded-full border px-3 py-1 text-[11px] font-semibold sm:self-auto">
          <ShieldCheck className="text-brand-purple h-3.5 w-3.5" aria-hidden />
          Privacidad Ley 1581 · Cero PII
        </span>
      </div>

      {/* Barra interactiva de filtros */}
      <AdminCard className="p-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-brand-purple-dark inline-flex items-center gap-1.5 text-xs font-bold">
              <Filter className="text-brand-purple h-3.5 w-3.5" aria-hidden />
              Explorar embudo por:
            </span>
            {hasActiveFilter && (
              <Link
                href="/admin/metricas"
                scroll={false}
                className="text-brand-purple hover:text-brand-purple-dark inline-flex min-h-9 items-center gap-1 text-xs font-semibold underline"
              >
                <RotateCcw className="h-3 w-3" aria-hidden />
                Restablecer vista general (30 días)
              </Link>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
            {/* Período */}
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Período">
              <span className="text-brand-muted mr-1 text-[11px] font-semibold uppercase">
                Período
              </span>
              <FilterPill
                href={buildMetricasHref(filters, { days: 7 })}
                active={filters.days === 7}
              >
                7 días
              </FilterPill>
              <FilterPill
                href={buildMetricasHref(filters, { days: 30 })}
                active={filters.days === 30}
              >
                30 días
              </FilterPill>
            </div>

            {/* Dispositivo */}
            <div
              className="flex flex-wrap items-center gap-1.5"
              role="group"
              aria-label="Dispositivo"
            >
              <span className="text-brand-muted mr-1 text-[11px] font-semibold uppercase">
                Equipo
              </span>
              <FilterPill
                href={buildMetricasHref(filters, { deviceCategory: "all" })}
                active={filters.deviceCategory === "all"}
              >
                Todos
              </FilterPill>
              <FilterPill
                href={buildMetricasHref(filters, { deviceCategory: "mobile" })}
                active={filters.deviceCategory === "mobile"}
              >
                <Smartphone className="h-3.5 w-3.5" aria-hidden />
                Celular
              </FilterPill>
              <FilterPill
                href={buildMetricasHref(filters, { deviceCategory: "desktop" })}
                active={filters.deviceCategory === "desktop"}
              >
                <Laptop className="h-3.5 w-3.5" aria-hidden />
                Computador
              </FilterPill>
              <FilterPill
                href={buildMetricasHref(filters, { deviceCategory: "tablet" })}
                active={filters.deviceCategory === "tablet"}
              >
                <Tablet className="h-3.5 w-3.5" aria-hidden />
                Tablet
              </FilterPill>
            </div>

            {/* Tipo de experiencia */}
            <div
              className="flex flex-wrap items-center gap-1.5"
              role="group"
              aria-label="Tipo de personalización"
            >
              <span className="text-brand-muted mr-1 text-[11px] font-semibold uppercase">
                Superficie
              </span>
              <FilterPill
                href={buildMetricasHref(filters, { editorKind: "all" })}
                active={filters.editorKind === "all"}
              >
                Todas
              </FilterPill>
              <FilterPill
                href={buildMetricasHref(filters, { editorKind: "photo" })}
                active={filters.editorKind === "photo"}
              >
                Fotos
              </FilterPill>
              <FilterPill
                href={buildMetricasHref(filters, { editorKind: "name" })}
                active={filters.editorKind === "name"}
              >
                Nombre
              </FilterPill>
              <FilterPill
                href={buildMetricasHref(filters, { editorKind: "letterset" })}
                active={filters.editorKind === "letterset"}
              >
                Abecedario
              </FilterPill>
              <FilterPill
                href={buildMetricasHref(filters, { editorKind: "catalog" })}
                active={filters.editorKind === "catalog"}
              >
                Catálogo
              </FilterPill>
            </div>

            {/* Producto específico */}
            {report.availableProducts.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-brand-muted text-[11px] font-semibold uppercase">
                  Producto
                </span>
                <FunnelProductSelect
                  selectedProductSlug={filters.productSlug}
                  products={report.availableProducts}
                  baseParamsString={baseParams.toString()}
                />
              </div>
            )}
          </div>
        </div>
      </AdminCard>

      {!report.hasData ? (
        <AdminEmpty
          icon={<Activity className="h-5 w-5" />}
          title={
            hasActiveFilter
              ? "Sin actividad para este filtro en la ventana elegida"
              : "La medición del embudo ya está activa"
          }
          description={
            hasActiveFilter
              ? "Prueba cambiar a 30 días o restablecer los filtros para ver el recorrido completo de la tienda."
              : "A medida que las personas visiten fichas de producto, personalicen en el Estudio y compren, aquí verás paso a paso dónde avanzan y dónde abandonan."
          }
        />
      ) : (
        <>
          {/* Principal fuga detectada */}
          {report.bottleneck && (
            <div className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 via-amber-50/80 to-orange-50/60 p-4 shadow-xs sm:p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                    <AlertTriangle className="h-5 w-5" aria-hidden />
                  </div>
                  <div>
                    <p className="text-xs font-bold tracking-wide text-amber-900 uppercase">
                      Principal fuga detectada en esta vista
                    </p>
                    <p className="text-brand-purple-dark mt-0.5 text-sm font-semibold sm:text-base">
                      Entre <strong>«{report.bottleneck.fromLabel}»</strong> (
                      {report.bottleneck.fromCount.toLocaleString("es-CO")}) y{" "}
                      <strong>«{report.bottleneck.toLabel}»</strong> (
                      {report.bottleneck.toCount.toLocaleString("es-CO")}) se detiene el{" "}
                      <span className="font-bold text-rose-700">
                        {report.bottleneck.dropOffPct}%
                      </span>
                      .
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-amber-950/85">
                      <strong>Qué revisar:</strong> {report.bottleneck.recommendation}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Cascada visual del embudo */}
          <AdminCard className="p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-brand-purple-dark font-display text-base font-bold">
                  Recorrido paso a paso ({report.windowDays} días)
                </h3>
                <p className="text-brand-muted text-xs">
                  Cada barra compara el avance frente al inicio y frente al paso inmediatamente
                  anterior.
                </p>
              </div>
            </div>

            <ol className="space-y-3.5">
              {report.stages.map((stage) => {
                const barWidthPct =
                  stage.count > 0 ? Math.max(2.5, (stage.count / maxStageCount) * 100) : 0;
                const highDrop = stage.dropOffPct !== null && stage.dropOffPct >= 40;
                return (
                  <li
                    key={stage.eventName}
                    className="border-brand-purple/8 rounded-xl border bg-slate-50/50 p-3.5 transition-colors hover:bg-white"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-brand-purple-dark text-sm font-bold">{stage.label}</p>
                        <p className="text-brand-muted text-xs">{stage.helper}</p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                        {stage.stepConversionPct !== null && (
                          <Hint content="Porcentaje que avanzó desde el paso inmediatamente anterior">
                            <span className="border-brand-purple/15 text-brand-purple-dark rounded-full border bg-white px-2.5 py-0.5 text-[11px] font-semibold tabular-nums">
                              Avanza {stage.stepConversionPct}%
                            </span>
                          </Hint>
                        )}
                        {stage.dropOffPct !== null && stage.dropOffPct > 0 && (
                          <Hint content="Porcentaje que no continuó al llegar a este paso">
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                                highDrop
                                  ? "bg-rose-100 text-rose-800"
                                  : "bg-amber-100/80 text-amber-900"
                              }`}
                            >
                              −{stage.dropOffPct}%
                            </span>
                          </Hint>
                        )}
                        <span className="text-brand-purple-dark min-w-16 text-right text-base font-bold tabular-nums">
                          {stage.count.toLocaleString("es-CO")}
                          {stage.overallConversionPct !== null &&
                            stage.eventName !== "product_view" && (
                              <span className="text-brand-muted block text-[10px] font-normal">
                                {stage.overallConversionPct}% del inicio
                              </span>
                            )}
                        </span>
                      </div>
                    </div>

                    <div className="bg-brand-purple/10 mt-2.5 h-3 overflow-hidden rounded-full sm:flex sm:justify-center">
                      <div
                        className={`admin-bar-grow-x h-full rounded-full ${
                          highDrop
                            ? "from-brand-purple via-brand-pink bg-gradient-to-r to-rose-500"
                            : "from-brand-purple via-brand-purple to-brand-turquoise bg-gradient-to-r"
                        }`}
                        style={{ width: `${barWidthPct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ol>
          </AdminCard>

          {/* Salud técnica del Estudio */}
          {filters.editorKind !== "catalog" && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <OperationHealthCard
                title="Salud de subida de fotos"
                subtitle="Archivos cargados por clientes en el Estudio de fotos"
                icon={<Upload className="h-4 w-4" aria-hidden />}
                health={report.uploadHealth}
              />
              <OperationHealthCard
                title="Salud al finalizar diseños"
                subtitle="Confirmación en «Así se verá tu pedido» y paso al carrito"
                icon={<Sparkles className="h-4 w-4" aria-hidden />}
                health={report.finalizeHealth}
              />
            </div>
          )}

          {/* Comparativa por dispositivo */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {report.byDevice.map((dev) => {
              const DevIcon =
                dev.deviceCategory === "mobile"
                  ? Smartphone
                  : dev.deviceCategory === "tablet"
                    ? Tablet
                    : Laptop;
              return (
                <AdminCard key={dev.deviceCategory} className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="bg-brand-purple/10 text-brand-purple flex h-8 w-8 items-center justify-center rounded-lg">
                        <DevIcon className="h-4 w-4" aria-hidden />
                      </div>
                      <h3 className="text-brand-purple-dark font-display text-sm font-bold">
                        {dev.label}
                      </h3>
                    </div>
                    <AdminBadge
                      tone={
                        dev.studioCompletionPct === null
                          ? "slate"
                          : dev.studioCompletionPct >= 45
                            ? "emerald"
                            : dev.studioCompletionPct >= 25
                              ? "amber"
                              : "rose"
                      }
                    >
                      {dev.studioCompletionPct !== null
                        ? `${dev.studioCompletionPct}% terminan Estudio`
                        : "Sin aperturas"}
                    </AdminBadge>
                  </div>
                  {(() => {
                    const devMax = Math.max(
                      1,
                      dev.productViews,
                      dev.studioOpens,
                      dev.cartAdds,
                      dev.purchases,
                    );
                    const rows = [
                      { label: "Ven ficha", val: dev.productViews, color: "#7C6AAD" },
                      { label: "Abren Estudio", val: dev.studioOpens, color: "#E85B9F" },
                      { label: "Al carrito", val: dev.cartAdds, color: "#2BB8AF" },
                      {
                        label: "Compras",
                        val: dev.purchases,
                        color: "#10B981",
                        suffix:
                          dev.overallPurchasePct !== null
                            ? `(${dev.overallPurchasePct}%)`
                            : undefined,
                      },
                    ];
                    return (
                      <div className="mt-3 space-y-2 text-xs">
                        {rows.map((r) => {
                          const w = r.val > 0 ? Math.max(4, Math.round((r.val / devMax) * 100)) : 0;
                          return (
                            <div key={r.label} className="rounded-lg bg-slate-50 px-2.5 py-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-brand-muted">{r.label}</span>
                                <span className="text-brand-purple-dark font-bold tabular-nums">
                                  {r.val.toLocaleString("es-CO")}
                                  {r.suffix ? (
                                    <span className="text-brand-muted ml-1 font-normal">
                                      {r.suffix}
                                    </span>
                                  ) : null}
                                </span>
                              </div>
                              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200/70">
                                <div
                                  className="admin-bar-grow-x h-full rounded-full"
                                  style={{ width: `${w}%`, backgroundColor: r.color }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </AdminCard>
              );
            })}
          </div>

          {/* Tabla de abandono por producto y superficie */}
          {report.byProduct.length > 0 && (
            <div className="space-y-2.5">
              <div>
                <h3 className="text-brand-purple-dark font-display text-base font-bold">
                  Conversión y abandono por producto
                </h3>
                <p className="text-brand-muted text-xs">
                  Ordenado por los productos donde más personas abren el Estudio pero no llegan a
                  finalizar el diseño.
                </p>
              </div>
              <AdminTable minWidth={680}>
                <AdminTableHead>
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Producto</th>
                    <th className="px-4 py-3 text-left font-semibold">Superficie</th>
                    <th className="px-3 py-3 text-right font-semibold">Vistas</th>
                    <th className="px-3 py-3 text-right font-semibold">Abren Estudio</th>
                    <th className="px-3 py-3 text-right font-semibold">Finalizan</th>
                    <th className="px-3 py-3 text-right font-semibold">Abandono Estudio</th>
                    <th className="px-3 py-3 text-right font-semibold">Al carrito</th>
                    <th className="px-4 py-3 text-right font-semibold">Compras</th>
                  </tr>
                </AdminTableHead>
                <AdminTableBody>
                  {report.byProduct.map((row) => (
                    <AdminTableRow key={`${row.productSlug}:${row.editorKind}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <Link
                            href={buildMetricasHref(filters, { productSlug: row.productSlug })}
                            scroll={false}
                            className="text-brand-purple-dark hover:text-brand-purple font-medium hover:underline"
                          >
                            {row.productName}
                          </Link>
                          <Hint content="Abrir ficha pública en una pestaña nueva">
                            <Link
                              href={`/producto/${row.productSlug}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`Ver ficha pública de ${row.productName}`}
                              className="text-brand-muted hover:text-brand-purple inline-flex h-6 w-6 items-center justify-center rounded"
                            >
                              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                            </Link>
                          </Hint>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <AdminBadge
                          tone={
                            row.editorKind === "photo"
                              ? "purple"
                              : row.editorKind === "name" || row.editorKind === "letterset"
                                ? "turquoise"
                                : "slate"
                          }
                        >
                          {row.editorLabel}
                        </AdminBadge>
                      </td>
                      <td className="text-brand-purple-dark px-3 py-3 text-right tabular-nums">
                        {row.productViews.toLocaleString("es-CO")}
                      </td>
                      <td className="text-brand-purple-dark px-3 py-3 text-right tabular-nums">
                        {row.editorKind === "catalog"
                          ? "—"
                          : row.studioOpens.toLocaleString("es-CO")}
                      </td>
                      <td className="text-brand-purple-dark px-3 py-3 text-right tabular-nums">
                        {row.editorKind === "catalog"
                          ? "—"
                          : row.finalizesSucceeded.toLocaleString("es-CO")}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {row.editorKind === "catalog" || row.studioDropOffPct === null ? (
                          <span className="text-brand-muted text-xs">—</span>
                        ) : (
                          <AdminBadge
                            tone={
                              row.studioDropOffPct >= 65
                                ? "rose"
                                : row.studioDropOffPct >= 40
                                  ? "amber"
                                  : "emerald"
                            }
                          >
                            {row.studioDropOffPct}%
                          </AdminBadge>
                        )}
                      </td>
                      <td className="text-brand-purple-dark px-3 py-3 text-right tabular-nums">
                        {row.cartAdds.toLocaleString("es-CO")}
                      </td>
                      <td className="text-brand-purple-dark px-4 py-3 text-right font-semibold tabular-nums">
                        {row.purchases.toLocaleString("es-CO")}
                      </td>
                    </AdminTableRow>
                  ))}
                </AdminTableBody>
              </AdminTable>
            </div>
          )}
        </>
      )}
    </section>
  );
}
