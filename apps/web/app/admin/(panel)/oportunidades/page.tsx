/*
 * Admin > Ventas > Oportunidades B2B (`/admin/oportunidades` · `Fase 12 · S24`).
 */

import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Search,
  Sparkles,
  TrendingUp,
  Trophy,
} from "lucide-react";
import {
  AdminBadge,
  AdminCard,
  AdminHorizontalBars,
  AdminPage,
  AdminPageBody,
  AdminPageHeader,
  AdminSegmentedBar,
  type ChartTone,
} from "@/components/admin-page";
import { CountUp } from "@/components/admin/count-up";
import { WhatsAppIcon } from "@/components/icons/brand";
import { canAccessAdminPath } from "@/lib/admin-rbac";
import { requireCapability } from "@/lib/admin-rbac-guard";
import { customerWaLink } from "@/lib/wa";
import { formatCOP } from "@/lib/format";
import {
  isOpportunityEventType,
  isOpportunityStage,
  OPPORTUNITY_EVENT_LABELS,
  OPPORTUNITY_EVENT_TYPES,
  OPPORTUNITY_STAGE_LABELS,
  OPPORTUNITY_STAGE_TONES,
  OPPORTUNITY_STAGES,
  type OpportunityEventType,
  type OpportunityStage,
} from "@/features/opportunities/schemas";
import { listOpportunitiesForAdmin } from "@/features/opportunities/service";
import { formatDateCO } from "@/lib/datetime";

export const metadata: Metadata = {
  title: "Oportunidades B2B y Eventos",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  stage?: string;
  eventType?: string;
  q?: string;
  page?: string;
}>;

function buildOppHref(params: {
  stage?: OpportunityStage;
  eventType?: OpportunityEventType;
  q?: string;
  page?: number;
}): string {
  const qs = new URLSearchParams();
  if (params.stage) qs.set("stage", params.stage);
  if (params.eventType) qs.set("eventType", params.eventType);
  if (params.q) qs.set("q", params.q);
  if (params.page && params.page > 1) qs.set("page", String(params.page));
  const str = qs.toString();
  return str ? `/admin/oportunidades?${str}` : "/admin/oportunidades";
}

export default async function AdminOportunidadesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireCapability("opportunities:manage");
  const canViewContacts = canAccessAdminPath(session.admin.role, "/admin/clientes");

  const sp = await searchParams;
  const activeStage = sp.stage && isOpportunityStage(sp.stage) ? sp.stage : undefined;
  const activeEventType =
    sp.eventType && isOpportunityEventType(sp.eventType) ? sp.eventType : undefined;
  const q = sp.q?.trim() ?? "";
  const rawPage = sp.page ? Number.parseInt(sp.page, 10) : 1;
  const requestedPage = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;

  const { items, page, totalFiltered, totalPages, piiMasked, serverNowMs, kpis } =
    await listOpportunitiesForAdmin(
      {
        stage: activeStage,
        eventType: activeEventType,
        q,
        page: requestedPage,
      },
      session.admin.role,
    );

  const openCount =
    kpis.stageCounts.NEW + kpis.stageCounts.QUALIFYING + kpis.stageCounts.PROPOSAL_SENT;
  const hasActiveFilters = Boolean(activeStage || activeEventType || q);
  const nowMs = serverNowMs;
  const horizon14dMs = nowMs + 14 * 24 * 60 * 60 * 1000;

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Building2 className="h-5 w-5" />}
        title="Oportunidades B2B y Eventos"
        subtitle="Pipeline consultivo para empresas, bodas, grados y proyectos por volumen (separado de pedidos B2C)"
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Ventas" },
          { label: "Oportunidades B2B" },
        ]}
        actions={
          <Link
            href="/empresas-y-eventos"
            target="_blank"
            className="border-brand-purple/25 text-brand-purple-dark hover:bg-brand-purple/10 inline-flex min-h-11 items-center gap-1.5 rounded-xl border bg-white px-3.5 py-2 text-xs font-semibold transition-colors"
          >
            Ver formulario público
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        }
      />

      <AdminPageBody>
        {/* KPIs del pipeline consultivo */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <AdminCard className="p-4">
            <div className="text-brand-muted flex items-center gap-1.5 text-xs font-semibold uppercase">
              <Sparkles className="text-brand-purple h-4 w-4" />
              Oportunidades activas
            </div>
            <div className="text-brand-purple-dark font-display mt-1 text-2xl font-bold tabular-nums">
              <CountUp value={openCount} />
            </div>
            <p className="text-brand-muted mt-1 text-xs">
              {kpis.stageCounts.NEW} nuevas · {kpis.stageCounts.PROPOSAL_SENT} con propuesta
            </p>
            {kpis.upcomingEvents14dCount > 0 && (
              <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800">
                <AlertTriangle className="h-3 w-3 text-amber-600" />
                {kpis.upcomingEvents14dCount} con fecha de evento ≤ 14 días o vencida
              </p>
            )}
          </AdminCard>

          <AdminCard className="p-4">
            <div className="text-brand-muted flex items-center gap-1.5 text-xs font-semibold uppercase">
              <TrendingUp className="h-4 w-4 text-blue-600" />
              Pipeline abierto estimado
            </div>
            <div className="text-brand-purple font-display mt-1 text-2xl font-bold tabular-nums">
              {formatCOP(kpis.openPipelineCents)}
            </div>
            <p className="text-brand-muted mt-1 text-xs">
              Suma de presupuestos en calificación o propuesta
            </p>
          </AdminCard>

          <AdminCard className="p-4">
            <div className="text-brand-muted flex items-center gap-1.5 text-xs font-semibold uppercase">
              <Trophy className="h-4 w-4 text-emerald-600" />
              Negocios ganados
            </div>
            <div className="font-display mt-1 text-2xl font-bold text-emerald-700 tabular-nums">
              {formatCOP(kpis.wonRevenueCents)}
            </div>
            <p className="text-brand-muted mt-1 text-xs">
              {kpis.stageCounts.WON} cerrada{kpis.stageCounts.WON === 1 ? "" : "s"} con éxito
              {kpis.winRatePct !== null ? ` · Tasa de cierre ${kpis.winRatePct}%` : ""}
            </p>
          </AdminCard>

          <AdminCard className="p-4">
            <div className="text-brand-muted flex items-center gap-1.5 text-xs font-semibold uppercase">
              <Building2 className="h-4 w-4 text-slate-600" />
              Histórico total
            </div>
            <div className="text-brand-purple-dark font-display mt-1 text-2xl font-bold tabular-nums">
              <CountUp value={kpis.total} />
            </div>
            <p className="text-brand-muted mt-1 text-xs">
              {kpis.stageCounts.LOST} marcada{kpis.stageCounts.LOST === 1 ? "" : "s"} como perdida
              {kpis.stageCounts.LOST === 1 ? "" : "s"}
            </p>
          </AdminCard>
        </div>

        {/* Analítica visual del pipeline + mezcla por tipo de proyecto */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <AdminCard className="space-y-3 p-4 lg:col-span-7">
            <div>
              <h2 className="text-brand-purple-dark font-display text-sm font-bold">
                Embudo consultivo por etapa
              </h2>
              <p className="text-brand-muted text-xs">
                Haz clic en cualquier etapa para filtrar las oportunidades activas o cerradas.
              </p>
            </div>
            <AdminSegmentedBar
              ariaLabel="Distribución de oportunidades B2B por etapa del embudo"
              items={OPPORTUNITY_STAGES.map((st) => {
                const stageChartTone: Record<(typeof OPPORTUNITY_STAGES)[number], ChartTone> = {
                  NEW: "amber",
                  QUALIFYING: "purple",
                  PROPOSAL_SENT: "turquoise",
                  WON: "emerald",
                  LOST: "slate",
                };
                return {
                  key: st,
                  label: OPPORTUNITY_STAGE_LABELS[st],
                  count: kpis.stageCounts[st],
                  tone: stageChartTone[st],
                  href: buildOppHref({ stage: st, eventType: activeEventType, q }),
                };
              })}
            />
          </AdminCard>

          <AdminCard className="space-y-3 p-4 lg:col-span-5">
            <div>
              <h2 className="text-brand-purple-dark font-display text-sm font-bold">
                Demanda por tipo de proyecto
              </h2>
              <p className="text-brand-muted text-xs">
                Volumen de solicitudes y presupuesto acumulado por vertical B2B / Eventos.
              </p>
            </div>
            <AdminHorizontalBars
              items={kpis.byEventType
                .filter((ev) => ev.count > 0)
                .map((ev, idx) => {
                  const tones: ChartTone[] = ["purple", "pink", "turquoise", "coral", "slate"];
                  return {
                    key: ev.eventType,
                    label: ev.label,
                    value: ev.count,
                    formattedValue: `${ev.count.toLocaleString("es-CO")} ${ev.count === 1 ? "caso" : "casos"}`,
                    secondaryText: ev.amountCents > 0 ? formatCOP(ev.amountCents) : undefined,
                    tone: tones[idx % tones.length],
                    href: buildOppHref({
                      stage: activeStage,
                      eventType: ev.eventType,
                      q,
                    }),
                  };
                })}
            />
            {kpis.total === 0 && (
              <p className="text-brand-muted py-4 text-center text-xs">
                Aún no hay solicitudes registradas para desglosar por tipo de proyecto.
              </p>
            )}
          </AdminCard>
        </section>

        {/* Barra de filtros por etapa, tipo de evento y búsqueda */}
        <AdminCard className="space-y-3 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-1.5">
              <Link
                href={buildOppHref({ eventType: activeEventType, q })}
                className={`inline-flex min-h-10 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  !activeStage
                    ? "border-brand-purple bg-brand-purple text-white"
                    : "border-brand-purple/15 text-brand-purple-dark hover:bg-brand-purple/10 bg-[#FFF8F0]/60"
                }`}
              >
                Todas ({kpis.total})
              </Link>
              {OPPORTUNITY_STAGES.map((st) => {
                const selected = activeStage === st;
                return (
                  <Link
                    key={st}
                    href={buildOppHref({ stage: st, eventType: activeEventType, q })}
                    className={`inline-flex min-h-10 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      selected
                        ? "border-brand-purple bg-brand-purple text-white"
                        : "border-brand-purple/15 text-brand-purple-dark hover:bg-brand-purple/10 bg-[#FFF8F0]/60"
                    }`}
                  >
                    {OPPORTUNITY_STAGE_LABELS[st]} ({kpis.stageCounts[st]})
                  </Link>
                );
              })}
            </div>

            <form
              action="/admin/oportunidades"
              method="GET"
              className="flex flex-col gap-2 sm:flex-row sm:items-center"
            >
              {activeStage && <input type="hidden" name="stage" value={activeStage} />}
              <select
                name="eventType"
                defaultValue={activeEventType ?? ""}
                aria-label="Filtrar por tipo de proyecto o evento"
                className="border-brand-purple/20 text-brand-purple-dark focus:border-brand-purple min-h-10 rounded-xl border bg-white px-3 text-xs font-medium focus:outline-none"
              >
                <option value="">Todos los tipos de evento</option>
                {OPPORTUNITY_EVENT_TYPES.map((ev) => (
                  <option key={ev} value={ev}>
                    {OPPORTUNITY_EVENT_LABELS[ev]}
                  </option>
                ))}
              </select>

              <div className="relative w-full sm:w-64">
                <Search className="text-brand-muted pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                <input
                  type="search"
                  name="q"
                  defaultValue={q}
                  placeholder="Buscar OP-..., empresa, ciudad..."
                  className="border-brand-purple/20 text-brand-purple-dark focus:border-brand-purple min-h-10 w-full rounded-xl border bg-white pr-3 pl-9 text-xs focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="bg-brand-purple inline-flex min-h-10 items-center justify-center rounded-xl px-3.5 py-2 text-xs font-semibold text-white hover:brightness-110"
              >
                Filtrar
              </button>

              {hasActiveFilters && (
                <Link
                  href="/admin/oportunidades"
                  className="text-brand-muted hover:text-brand-purple-dark inline-flex min-h-10 items-center justify-center px-2 text-xs font-semibold underline underline-offset-2"
                >
                  Limpiar
                </Link>
              )}
            </form>
          </div>
        </AdminCard>

        {/* Listado de oportunidades */}
        {items.length === 0 ? (
          <AdminCard className="p-8 text-center">
            <p className="text-brand-purple-dark font-display text-base font-bold">
              No hay oportunidades en esta vista
            </p>
            <p className="text-brand-muted mt-1 text-xs">
              Las solicitudes recibidas desde <code className="font-mono">/empresas-y-eventos</code>{" "}
              aparecen aquí automáticamente con su tarea en Bandeja Hoy.
            </p>
          </AdminCard>
        ) : (
          <ul className="space-y-3">
            {items.map((opp) => {
              const isOpenStage =
                opp.stage === "NEW" || opp.stage === "QUALIFYING" || opp.stage === "PROPOSAL_SENT";
              const eventMs = opp.eventDate ? opp.eventDate.getTime() : null;
              const isEventOverdue = isOpenStage && eventMs !== null && eventMs < nowMs;
              const isEventSoon =
                isOpenStage && eventMs !== null && eventMs >= nowMs && eventMs <= horizon14dMs;

              const wa =
                !piiMasked && opp.contactPhone
                  ? customerWaLink(
                      opp.contactPhone,
                      `Hola ${opp.contactName}, te escribo de Lucams Shop sobre tu proyecto ${opp.number}. `,
                    )
                  : null;
              return (
                <li
                  key={opp.id}
                  className={`rounded-2xl border bg-white p-4 shadow-xs ${
                    isEventOverdue
                      ? "border-rose-300 bg-rose-50/20"
                      : isEventSoon
                        ? "border-amber-300"
                        : "border-brand-purple/15"
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-brand-purple font-mono text-xs font-bold">
                          {opp.number}
                        </span>
                        <AdminBadge tone={OPPORTUNITY_STAGE_TONES[opp.stage]}>
                          {OPPORTUNITY_STAGE_LABELS[opp.stage]}
                        </AdminBadge>
                        <AdminBadge tone="slate">
                          {OPPORTUNITY_EVENT_LABELS[opp.eventType]}
                        </AdminBadge>
                        {isEventOverdue && <AdminBadge tone="rose">Evento vencido</AdminBadge>}
                        {isEventSoon && <AdminBadge tone="amber">Evento ≤ 14 días</AdminBadge>}
                        {opp.expectedUnits !== null && (
                          <span className="text-brand-purple-dark text-xs font-semibold">
                            · {opp.expectedUnits} uds.
                          </span>
                        )}
                        {opp.expectedAmountCop > 0 && (
                          <span className="text-xs font-bold text-emerald-700">
                            · {formatCOP(opp.expectedAmountCop)}
                          </span>
                        )}
                      </div>

                      <h2 className="text-brand-purple-dark mt-1.5 text-sm font-bold">
                        {opp.title}
                      </h2>

                      <div className="text-brand-muted mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        <span>
                          Contacto:{" "}
                          {canViewContacts ? (
                            <Link
                              href={`/admin/clientes/${encodeURIComponent(opp.contactId)}`}
                              className="text-brand-purple-dark hover:text-brand-purple font-medium underline underline-offset-2"
                            >
                              {opp.contactName}
                            </Link>
                          ) : (
                            <span className="text-brand-purple-dark font-medium">
                              {opp.contactName}
                            </span>
                          )}
                        </span>
                        {opp.organizationName && <span>Empresa: {opp.organizationName}</span>}
                        {opp.city && <span>Ciudad: {opp.city}</span>}
                        {opp.eventDate && (
                          <span
                            className={`inline-flex items-center gap-1 ${
                              isEventOverdue
                                ? "font-semibold text-rose-700"
                                : isEventSoon
                                  ? "font-semibold text-amber-800"
                                  : ""
                            }`}
                          >
                            <Calendar className="h-3 w-3" />
                            Evento: {formatDateCO(opp.eventDate)}
                          </span>
                        )}
                        <span>
                          Responsable:{" "}
                          <strong className="text-brand-purple-dark font-medium">
                            {opp.ownerAdminEmail ?? "Sin asignar"}
                          </strong>
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                      {wa && (
                        <a
                          href={wa}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-emerald-600/30 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                        >
                          <WhatsAppIcon className="h-3.5 w-3.5 text-emerald-700" />
                          WhatsApp
                        </a>
                      )}
                      <Link
                        href={`/admin/oportunidades/${encodeURIComponent(opp.id)}`}
                        className="bg-brand-purple inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold text-white hover:brightness-110"
                      >
                        Gestionar
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {totalPages > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs">
            <span className="text-brand-muted">
              Mostrando {items.length.toLocaleString("es-CO")} de{" "}
              {totalFiltered.toLocaleString("es-CO")} oportunidades · Página {page} de {totalPages}
            </span>
            <div className="flex items-center gap-2">
              {page > 1 ? (
                <Link
                  href={buildOppHref({
                    stage: activeStage,
                    eventType: activeEventType,
                    q,
                    page: page - 1,
                  })}
                  className="border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/10 inline-flex min-h-10 items-center gap-1 rounded-xl border bg-white px-3 py-1.5 font-semibold"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </Link>
              ) : (
                <span className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 font-semibold text-slate-400">
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </span>
              )}
              {page < totalPages ? (
                <Link
                  href={buildOppHref({
                    stage: activeStage,
                    eventType: activeEventType,
                    q,
                    page: page + 1,
                  })}
                  className="border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/10 inline-flex min-h-10 items-center gap-1 rounded-xl border bg-white px-3 py-1.5 font-semibold"
                >
                  Siguiente
                  <ChevronRight className="h-4 w-4" />
                </Link>
              ) : (
                <span className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 font-semibold text-slate-400">
                  Siguiente
                  <ChevronRight className="h-4 w-4" />
                </span>
              )}
            </div>
          </div>
        )}
      </AdminPageBody>
    </AdminPage>
  );
}
